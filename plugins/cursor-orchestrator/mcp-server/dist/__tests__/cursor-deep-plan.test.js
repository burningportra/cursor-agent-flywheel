import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_CURSOR_DEEP_PLAN_MODELS, getCursorDeepPlanModels, useClaudeDeepPlanBackend, } from '../cursor-deep-plan.js';
describe('cursor-deep-plan', () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'cursor-deep-plan-'));
        delete process.env.FW_DEEP_PLAN_BACKEND;
        delete process.env.FW_DEEP_PLAN_MODEL_CORRECTNESS;
        delete process.env.FW_DEEP_PLAN_MODEL_ERGONOMICS;
        delete process.env.FW_DEEP_PLAN_MODEL_ROBUSTNESS;
        delete process.env.FW_DEEP_PLAN_MODEL_SYNTHESIS;
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    it('defaults to cursor backend unless FW_DEEP_PLAN_BACKEND=claude', () => {
        expect(useClaudeDeepPlanBackend()).toBe(false);
        process.env.FW_DEEP_PLAN_BACKEND = 'claude';
        expect(useClaudeDeepPlanBackend()).toBe(true);
    });
    it('uses built-in defaults when no config', () => {
        const models = getCursorDeepPlanModels(tmpDir);
        expect(models).toEqual(DEFAULT_CURSOR_DEEP_PLAN_MODELS);
        expect(models.correctness).toBe('opus-4.6');
        expect(models.ergonomics).toBe('composer-2.5');
        expect(models.robustness).toBe('gpt-5.5-xhigh');
    });
    it('reads flywheel.config.yaml deep_plan section', () => {
        writeFileSync(join(tmpDir, 'flywheel.config.yaml'), `deep_plan:
  correctness: custom-opus
  ergonomics: custom-composer
  robustness: custom-gpt
  synthesis: custom-synth
`);
        const models = getCursorDeepPlanModels(tmpDir);
        expect(models.correctness).toBe('custom-opus');
        expect(models.ergonomics).toBe('custom-composer');
        expect(models.robustness).toBe('custom-gpt');
        expect(models.synthesis).toBe('custom-synth');
    });
    it('env overrides win over config file', () => {
        writeFileSync(join(tmpDir, 'flywheel.config.yaml'), `deep_plan:
  correctness: from-file
`);
        process.env.FW_DEEP_PLAN_MODEL_CORRECTNESS = 'from-env';
        expect(getCursorDeepPlanModels(tmpDir).correctness).toBe('from-env');
    });
});
//# sourceMappingURL=cursor-deep-plan.test.js.map