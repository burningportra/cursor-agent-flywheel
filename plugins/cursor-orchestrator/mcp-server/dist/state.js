import { readCheckpoint, writeCheckpoint, clearCheckpoint } from './checkpoint.js';
import { createInitialState } from './types.js';
const VERSION = '2.0.0';
export function loadState(cwd) {
    const result = readCheckpoint(cwd);
    if (result && result.envelope.state.phase !== 'idle' && result.envelope.state.phase !== 'complete') {
        for (const w of result.warnings)
            console.warn('[orchestrator]', w);
        return result.envelope.state;
    }
    return createInitialState();
}
export function saveState(cwd, state) {
    writeCheckpoint(cwd, state, VERSION);
}
export function clearState(cwd) {
    clearCheckpoint(cwd);
}
//# sourceMappingURL=state.js.map