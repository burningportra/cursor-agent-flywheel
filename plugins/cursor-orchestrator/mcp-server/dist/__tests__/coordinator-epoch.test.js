import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bumpCoordinatorEpoch, getCoordinatorEpoch, } from "../coordinator-epoch.js";
import { createInitialState } from "../types.js";
import { loadState, saveState } from "../state.js";
let testDir;
afterEach(() => {
    if (testDir)
        rmSync(testDir, { recursive: true, force: true });
});
describe("getCoordinatorEpoch", () => {
    it("returns 0 when coordinatorEpoch is undefined", () => {
        expect(getCoordinatorEpoch(createInitialState())).toBe(0);
    });
    it("returns stored value for non-negative integers", () => {
        const state = {
            ...createInitialState(),
            coordinatorEpoch: 3,
        };
        expect(getCoordinatorEpoch(state)).toBe(3);
    });
    it("treats negative values as 0", () => {
        const state = {
            ...createInitialState(),
            coordinatorEpoch: -1,
        };
        expect(getCoordinatorEpoch(state)).toBe(0);
    });
    it("treats NaN as 0", () => {
        const state = {
            ...createInitialState(),
            coordinatorEpoch: Number.NaN,
        };
        expect(getCoordinatorEpoch(state)).toBe(0);
    });
});
describe("bumpCoordinatorEpoch", () => {
    it("increments monotonically from default 0 to 1", () => {
        const bumped = bumpCoordinatorEpoch(createInitialState());
        expect(getCoordinatorEpoch(bumped)).toBe(1);
    });
    it("increments monotonically across repeated bumps", () => {
        let state = createInitialState();
        state = bumpCoordinatorEpoch(state);
        state = bumpCoordinatorEpoch(state);
        state = bumpCoordinatorEpoch(state);
        expect(getCoordinatorEpoch(state)).toBe(3);
    });
    it("does not mutate the input state", () => {
        const before = createInitialState();
        bumpCoordinatorEpoch(before);
        expect(before.coordinatorEpoch).toBeUndefined();
    });
});
describe("checkpoint round-trip", () => {
    it("preserves coordinatorEpoch through saveState and loadState", async () => {
        testDir = mkdtempSync(join(tmpdir(), "coordinator-epoch-"));
        let state = createInitialState();
        state = { ...state, phase: "implementing", coordinatorEpoch: 0 };
        state = bumpCoordinatorEpoch(state);
        state = bumpCoordinatorEpoch(state);
        await saveState(testDir, state);
        const restored = loadState(testDir);
        expect(restored.coordinatorEpoch).toBe(2);
        expect(getCoordinatorEpoch(restored)).toBe(2);
    });
});
//# sourceMappingURL=coordinator-epoch.test.js.map