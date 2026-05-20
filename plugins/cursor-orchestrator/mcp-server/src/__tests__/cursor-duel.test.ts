import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildCursorDuelRun,
  buildDuelModelsGate,
  getCursorDuelModels,
  resolveDuelModelsConfirm,
} from '../cursor-duel.js';

describe('cursor-duel', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fw-duel-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('reads duel section from flywheel.config.yaml', () => {
    writeFileSync(
      join(tmp, 'flywheel.config.yaml'),
      `duel:
  wizard_a: model-a
  wizard_b: model-b
  wizard_c: model-c
  synthesis: model-s
`,
    );
    expect(getCursorDuelModels(tmp)).toEqual({
      wizard_a: 'model-a',
      wizard_b: 'model-b',
      wizard_c: 'model-c',
      synthesis: 'model-s',
    });
  });

  it('buildDuelModelsGate includes four options', () => {
    const gate = buildDuelModelsGate(tmp);
    expect(gate.options).toHaveLength(4);
    expect(gate.kind).toBe('confirm_duel_models');
  });

  it('buildCursorDuelRun spawns three wizards when models differ', () => {
    const models = {
      wizard_a: 'opus-4.6',
      wizard_b: 'gpt-5.5-xhigh',
      wizard_c: 'composer-2.5',
      synthesis: 'opus-4.6',
    };
    const run = buildCursorDuelRun({
      cwd: tmp,
      mode: 'ideas',
      focus: 'test goal',
      outputPath: 'docs/discovery/duel-2026-01-01.md',
      top: 5,
      models,
    });
    expect(run.wizards).toHaveLength(3);
    expect(run.spawnBackend).toBe('cursor-task');
    expect(run.wizards[0].model).not.toBe(run.wizards[1].model);
  });

  it('buildCursorDuelRun spawns two wizards when wizard_c duplicates a slot', () => {
    const models = {
      wizard_a: 'opus-4.6',
      wizard_b: 'gpt-5.5-xhigh',
      wizard_c: 'opus-4.6',
      synthesis: 'opus-4.6',
    };
    const run = buildCursorDuelRun({
      cwd: tmp,
      mode: 'architecture',
      focus: 'plan goal',
      outputPath: 'docs/plans/x-duel.md',
      top: 3,
      models,
    });
    expect(run.wizards).toHaveLength(2);
  });

  it('resolveDuelModelsConfirm recommended matches config', () => {
    writeFileSync(
      join(tmp, 'flywheel.config.yaml'),
      'duel:\n  wizard_a: a\n  wizard_b: b\n  wizard_c: c\n  synthesis: s\n',
    );
    const resolved = resolveDuelModelsConfirm(tmp, 'recommended');
    expect(resolved.wizard_a).toBe('a');
    expect(resolved.synthesis).toBe('s');
  });
});
