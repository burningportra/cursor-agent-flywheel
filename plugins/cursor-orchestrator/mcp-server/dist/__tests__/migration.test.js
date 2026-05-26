/**
 * Migration safety — v3.12.x checkpoints continue to load under v3.13.0.
 *
 * The v3.13.0 outcome-grading additions (T4) appended 6 optional fields to
 * `FlywheelState`. Existing checkpoints written by v3.11.x and v3.12.x
 * lack those fields entirely. This test loads a frozen v3.12.0 fixture
 * through the production `readCheckpoint` path and asserts:
 *
 *   1. The load succeeds (envelope returned, not null).
 *   2. The fixture's `stateHash` validates against the original state shape
 *      — i.e. we did not silently mutate the schema.
 *   3. All 6 new outcome-grading fields read as `undefined`.
 *   4. `getMaxOutcomeIterations` falls back to the documented default.
 *
 * Bead: claude-orchestrator-2xn (T17).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readCheckpoint, validateCheckpoint, computeStateHash, CHECKPOINT_DIR, CHECKPOINT_FILE, } from '../checkpoint.js';
import { getMaxOutcomeIterations, DEFAULT_OUTCOME_ITERATIONS, MIN_OUTCOME_ITERATIONS, MAX_OUTCOME_ITERATIONS, } from '../outcome-grading.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, 'fixtures', 'checkpoint-v3.12.json');
const PRE_P3_FIXTURE_PATH = join(__dirname, 'fixtures', 'checkpoint-pre-p3.json');
describe('v3.12.x → v3.13.0 checkpoint migration', () => {
    let dir;
    afterEach(() => {
        if (dir)
            rmSync(dir, { recursive: true, force: true });
    });
    it('loads a v3.12.0 fixture without any outcome-grading fields and emits no fatal warnings', () => {
        dir = mkdtempSync(join(tmpdir(), 'flywheel-migration-'));
        const ckptDir = join(dir, CHECKPOINT_DIR);
        mkdirSync(ckptDir, { recursive: true });
        const fixture = readFileSync(FIXTURE_PATH, 'utf8');
        writeFileSync(join(ckptDir, CHECKPOINT_FILE), fixture, 'utf8');
        const result = readCheckpoint(dir);
        expect(result).not.toBeNull();
        expect(result.envelope.schemaVersion).toBe(1);
        expect(result.envelope.flywheelVersion).toBe('3.12.0');
        // Every new outcome-grading field must read as undefined on a v3.12.x
        // checkpoint — confirms additivity (R4 mitigation).
        const state = result.envelope.state;
        expect(state.outcomeRubricPath).toBeUndefined();
        expect(state.outcomeGradingSkipped).toBeUndefined();
        expect(state.outcomeGradingHistory).toBeUndefined();
        expect(state.maxOutcomeIterations).toBeUndefined();
        expect(state.cycleStartSha).toBeUndefined();
        expect(state.cycleEndTestOutput).toBeUndefined();
        // Existing v3.12.x fields still present.
        expect(state.phase).toBe('awaiting_plan_approval');
        expect(state.selectedGoal).toBe('Migrate from v3.12.x to v3.13.0');
        expect(state.activeBeadIds).toEqual([
            'claude-orchestrator-xsz',
            'agent-flywheel-plugin-zbx',
        ]);
        expect(state.sessionStartSha).toBe('5c7ed76abc123def456789012345678901234567');
        // Version-drift warning fires (3.12.0 != current); not fatal.
        expect(result.warnings.some((w) => w.includes('3.12.0'))).toBe(true);
    });
    it('getMaxOutcomeIterations returns the documented default on legacy state', () => {
        dir = mkdtempSync(join(tmpdir(), 'flywheel-migration-default-'));
        const ckptDir = join(dir, CHECKPOINT_DIR);
        mkdirSync(ckptDir, { recursive: true });
        const fixture = readFileSync(FIXTURE_PATH, 'utf8');
        writeFileSync(join(ckptDir, CHECKPOINT_FILE), fixture, 'utf8');
        const result = readCheckpoint(dir);
        expect(result).not.toBeNull();
        expect(getMaxOutcomeIterations(result.envelope.state)).toBe(DEFAULT_OUTCOME_ITERATIONS);
    });
    it('getMaxOutcomeIterations clamps explicit values into [MIN, MAX]', () => {
        expect(getMaxOutcomeIterations({ maxOutcomeIterations: 0 })).toBe(MIN_OUTCOME_ITERATIONS);
        expect(getMaxOutcomeIterations({ maxOutcomeIterations: 10 })).toBe(MAX_OUTCOME_ITERATIONS);
        expect(getMaxOutcomeIterations({ maxOutcomeIterations: 4 })).toBe(4);
        expect(getMaxOutcomeIterations({})).toBe(DEFAULT_OUTCOME_ITERATIONS);
    });
    it('getMaxOutcomeIterations reads FW_MAX_OUTCOME_ITERATIONS when state unset', () => {
        const prev = process.env.FW_MAX_OUTCOME_ITERATIONS;
        process.env.FW_MAX_OUTCOME_ITERATIONS = '4';
        try {
            expect(getMaxOutcomeIterations({})).toBe(4);
        }
        finally {
            if (prev === undefined)
                delete process.env.FW_MAX_OUTCOME_ITERATIONS;
            else
                process.env.FW_MAX_OUTCOME_ITERATIONS = prev;
        }
    });
});
/**
 * Pre-P3 checkpoint migration — v3.19.x checkpoints without gateResolutions
 * continue to load under v3.20.0 recover-gates additions.
 *
 * Bead: cursor-agent-flywheel-1gd.
 */
describe('pre-P3 → v3.20.0 checkpoint migration', () => {
    let dir;
    afterEach(() => {
        if (dir)
            rmSync(dir, { recursive: true, force: true });
    });
    it('loads checkpoint-pre-p3.json with gateResolutions absent and state hash round-trips', () => {
        dir = mkdtempSync(join(tmpdir(), 'flywheel-migration-pre-p3-'));
        const ckptDir = join(dir, CHECKPOINT_DIR);
        mkdirSync(ckptDir, { recursive: true });
        const fixtureRaw = readFileSync(PRE_P3_FIXTURE_PATH, 'utf8');
        writeFileSync(join(ckptDir, CHECKPOINT_FILE), fixtureRaw, 'utf8');
        const parsed = JSON.parse(fixtureRaw);
        expect(validateCheckpoint(parsed)).toEqual({
            valid: true,
            warnings: ['Checkpoint was written by v3.19.0, current is v3.20.0'],
        });
        expect(computeStateHash(parsed.state)).toBe(parsed.stateHash);
        const result = readCheckpoint(dir);
        expect(result).not.toBeNull();
        expect(result.envelope.flywheelVersion).toBe('3.19.0');
        const state = result.envelope.state;
        expect(state.gateResolutions).toBeUndefined();
        expect(state.coordinatorEpoch).toBe(2);
        expect(state.steeringEvents).toHaveLength(1);
        expect(state.activeBeadIds).toEqual([
            'cursor-agent-flywheel-31n',
            'cursor-agent-flywheel-1gd',
        ]);
        expect(computeStateHash(state)).toBe(result.envelope.stateHash);
    });
});
//# sourceMappingURL=migration.test.js.map