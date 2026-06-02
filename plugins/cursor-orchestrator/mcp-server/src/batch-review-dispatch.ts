/**
 * Shared batch-review dispatch payload for Cursor impl ticks and flywheel_review.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { buildCombinedReviewPrompt } from './combined-review-prompt.js';
import { readMemory } from './memory.js';
import type { ToolContext } from './types.js';

export interface BatchReviewDispatchPayload {
  shaRange: string;
  reviewSha: string;
  verdictPath: string;
  verdictRel: string;
  changedFiles: string[];
  prompt: string;
}

export function batchReviewVerdictRel(shaRange: string): string {
  return path.join('.pi-flywheel', 'batch-reviews', `${shaRange}.json`);
}

export function batchReviewVerdictPath(cwd: string, shaRange: string): string {
  return path.join(cwd, batchReviewVerdictRel(shaRange));
}

export async function resolveHeadSha(cwd: string, exec: ToolContext['exec']): Promise<string> {
  const r = await exec('git', ['rev-parse', 'HEAD'], { cwd, timeout: 8000 });
  if (r.code !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout.trim();
}

export function buildShaRange(fromSha: string | undefined, toSha: string): string {
  const from = fromSha?.trim();
  if (from && from.length > 0) {
    return `${from}..${toSha}`;
  }
  return `0000000..${toSha}`;
}

export async function prepareBatchReviewDispatch(
  ctx: ToolContext,
  shaRange: string,
  reviewSha: string,
): Promise<BatchReviewDispatchPayload> {
  const { exec, cwd, state, signal } = ctx;
  const verdictDir = path.join(cwd, '.pi-flywheel', 'batch-reviews');
  const verdictPath = path.join(verdictDir, `${shaRange}.json`);
  const verdictRel = batchReviewVerdictRel(shaRange);

  try {
    await fs.mkdir(verdictDir, { recursive: true });
  } catch {
    /* non-fatal */
  }

  const diffResult = await exec('git', ['diff', '--name-only', shaRange], {
    cwd,
    timeout: 8000,
    signal,
  });
  const changedFiles =
    diffResult.code === 0
      ? diffResult.stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  let memoryContext = '';
  try {
    const mem = readMemory(cwd, `batch review patterns ${state.selectedGoal ?? ''}`);
    if (mem) memoryContext = `\n\n## Prior Session Learnings\n${mem}\n`;
  } catch {
    /* CASS unavailable */
  }

  const callbackHint =
    `\n\nWrite your verdict JSON to \`${verdictRel}\` (create parent dirs if needed). ` +
    `The coordinator will call \`flywheel_impl_tick\` or \`flywheel_review({ action: "batch_review", shaRange: "${shaRange}" })\` ` +
    `to read the file and branch.`;

  const prompt = buildCombinedReviewPrompt({
    round: 1,
    memoryContext,
    allArtifacts: changedFiles,
    callbackHint,
    regressionHint: '',
    shaRange,
  });

  return {
    shaRange,
    reviewSha,
    verdictPath,
    verdictRel,
    changedFiles,
    prompt,
  };
}
