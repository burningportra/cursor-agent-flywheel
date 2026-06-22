import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Bead } from '../types.js';
import {
  DEFAULT_CURSOR_IMPL_MODELS,
  adaptPromptForCursor,
  buildBeadDispatchContext,
  buildCursorImplSpawnInstructions,
  classifyBeadsForSwarm,
  buildImplModelsGate,
  getCursorImplModels,
  modelForComplexity,
  recommendImplModels,
  resolveImplModelsConfirm,
  useNtmImplBackend,
} from '../cursor-implement-swarm.js';

function bead(title: string, description = ''): Bead {
  return {
    id: 'b-1',
    title,
    description,
    status: 'open',
    priority: 2,
    type: 'task',
    labels: [],
  };
}

describe('cursor-implement-swarm', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'fw-impl-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
    delete process.env.FW_IMPL_MODEL_SIMPLE;
    delete process.env.FW_IMPL_MODEL_MEDIUM;
    delete process.env.FW_IMPL_MODEL_COMPLEX;
    delete process.env.FW_IMPL_BACKEND;
  });

  it('returns defaults when no config', () => {
    expect(getCursorImplModels(tmp)).toEqual(DEFAULT_CURSOR_IMPL_MODELS);
    expect(getCursorImplModels(tmp).medium).not.toBe(getCursorImplModels(tmp).simple);
  });

  it('reads implement section from flywheel.config.yaml', () => {
    writeFileSync(
      join(tmp, 'flywheel.config.yaml'),
      'implement:\n  simple: fast-model\n  medium: mid-model\n  complex: heavy-model\n',
    );
    expect(getCursorImplModels(tmp)).toEqual({
      simple: 'fast-model',
      medium: 'mid-model',
      complex: 'heavy-model',
    });
  });

  it('env overrides config', () => {
    writeFileSync(
      join(tmp, 'flywheel.config.yaml'),
      'implement:\n  simple: a\n  medium: b\n  complex: c\n',
    );
    process.env.FW_IMPL_MODEL_SIMPLE = 'env-simple';
    expect(getCursorImplModels(tmp).simple).toBe('env-simple');
    expect(getCursorImplModels(tmp).medium).toBe('b');
  });

  it('modelForComplexity picks the right tier', () => {
    const models = { simple: 's', medium: 'm', complex: 'c' };
    expect(modelForComplexity(models, 'simple')).toBe('s');
    expect(modelForComplexity(models, 'complex')).toBe('c');
  });

  it('resolveImplModelsConfirm handles defaults and uniform', () => {
    expect(resolveImplModelsConfirm(tmp, 'defaults')).toEqual(
      DEFAULT_CURSOR_IMPL_MODELS,
    );
    expect(resolveImplModelsConfirm(tmp, { uniform: 'one-model' })).toEqual({
      simple: 'one-model',
      medium: 'one-model',
      complex: 'one-model',
    });
  });

  it('recommendImplModels upgrades tier when queue is complex-heavy', () => {
    const heavyDesc =
      'security authentication refactor integration concurrent distributed protocol architect cross-cutting breaking change state machine cryptographic migration '.repeat(
        40,
      );
    const beads = [
      { ...bead('Auth migration', heavyDesc), priority: 0 },
      { ...bead('Core API', heavyDesc), priority: 0 },
      { ...bead('Payments protocol', heavyDesc), priority: 0 },
    ];
    const rec = recommendImplModels(tmp, beads);
    expect(rec.preview.complex).toBeGreaterThanOrEqual(2);
    expect(rec.models.complex).toBe(DEFAULT_CURSOR_IMPL_MODELS.complex);
    expect(rec.models.medium).toBe('gpt-5.5-xhigh');
    expect(rec.rationale).toContain('Ready queue');
  });

  it('recommendImplModels suggests uniform fast model when all simple', () => {
    const beads = [
      bead('Update changelog', 'documentation readme typo'),
      bead('Lint fix', 'format config'),
    ];
    const rec = recommendImplModels(tmp, beads);
    expect(rec.models.simple).toBe(rec.models.medium);
    expect(rec.models.medium).toBe(rec.models.complex);
  });

  it('buildImplModelsGate exposes recommendation-first options', () => {
    const gate = buildImplModelsGate(tmp);
    expect(gate.kind).toBe('confirm_impl_models');
    expect(gate.options.length).toBe(4);
    expect(gate.options[0].label).toContain('recommendation');
    expect(gate.rationale).toBeTruthy();
    expect(gate.recommended).toBeDefined();
    expect(gate.beadClassifications).toEqual([]);
  });

  it('classifyBeadsForSwarm attaches model slug per tier', () => {
    const beads = [
      bead('Fix typo in README', 'documentation readme typo'),
      {
        ...bead('Auth migration', 'security authentication refactor'),
        id: 'b-hard',
        priority: 0,
        description:
          '### Files:\nmcp-server/src/auth.ts\n\n- [ ] tests\n- [ ] docs\n- [ ] rollout',
      },
    ];
    const models = getCursorImplModels(tmp);
    const rows = classifyBeadsForSwarm(beads, models);
    expect(rows).toHaveLength(2);
    expect(rows[0].complexity).not.toBe('simple');
    expect(rows.find((r) => r.beadId === 'b-1')?.complexity).toBe('simple');
  });

  it('resolveImplModelsConfirm recommended matches recommendImplModels', () => {
    const beads = [bead('Docs', 'readme documentation')];
    expect(resolveImplModelsConfirm(tmp, 'recommended', beads)).toEqual(
      recommendImplModels(tmp, beads).models,
    );
  });

  it('useNtmImplBackend only when FW_IMPL_BACKEND=ntm', () => {
    expect(useNtmImplBackend()).toBe(false);
    process.env.FW_IMPL_BACKEND = 'ntm';
    expect(useNtmImplBackend()).toBe(true);
  });

  it('buildCursorImplSpawnInstructions documents single-branch coordination', () => {
    const text = buildCursorImplSpawnInstructions(DEFAULT_CURSOR_IMPL_MODELS, tmp, {
      executionMode: 'single-branch',
    });
    expect(text).toContain('Single-branch coordination');
    expect(text).toContain('Do **not** run `git worktree add`');
    expect(text).toContain('file_reservation_paths');
  });

  it('adaptPromptForCursor includes single-branch git workflow and no worktrees', () => {
    const ctx = buildBeadDispatchContext(
      {
        ...bead('Add feature', '### Files:\n- src/feature.ts'),
        id: 'br-99',
      },
      'medium',
      'AgentOne',
      'Coordinator',
      tmp,
    );
    const { prompt } = adaptPromptForCursor(ctx, 'composer-2.5', 'single-branch');
    expect(prompt).toContain('git pull --rebase');
    expect(prompt).toContain('git push');
    expect(prompt).toContain('shared repo checkout');
    expect(prompt).not.toMatch(/git worktree add/);
    expect(prompt).toContain('src/feature.ts');
    expect(prompt).toContain('conflicts[]');
    expect(prompt).toContain("program='cursor'");
  });

  it('buildBeadDispatchContext extracts artifact paths from bead body', () => {
    const ctx = buildBeadDispatchContext(
      bead('Docs', '### Files:\n- docs/readme.md'),
      'simple',
      'Agent',
      'Coordinator',
      tmp,
    );
    expect(ctx.relevantFiles).toContain('docs/readme.md');
  });
});
