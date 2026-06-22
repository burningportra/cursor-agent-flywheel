/**
 * Claude prompt adapter.
 *
 * Claude is the baseline — its prompt mirrors the existing Step 7
 * template in `skills/start/_implement.md` so behavior is unchanged for
 * Claude panes when model diversity is enabled. Kept as its own file so
 * the three providers expose a symmetric interface.
 */
import type { AdaptedPrompt, BeadDispatchContext } from './codex-prompt.js';
export type { AdaptedPrompt, BeadDispatchContext };
export type ClaudePromptMode = 'worktree' | 'single-branch';
export interface ClaudePromptOptions {
    mode?: ClaudePromptMode;
    program?: string;
    model?: string;
}
export declare function adaptPromptForClaude(bead: BeadDispatchContext, options?: ClaudePromptOptions): AdaptedPrompt;
//# sourceMappingURL=claude-prompt.d.ts.map