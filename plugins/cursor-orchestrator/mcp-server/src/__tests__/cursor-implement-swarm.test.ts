import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Bead } from '../types.js';
import {
  DEFAULT_CURSOR_IMPL_MODELS,
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
});
