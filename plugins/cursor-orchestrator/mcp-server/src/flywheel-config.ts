/**
 * Minimal loader for `flywheel.config.yaml` at the repo root.
 *
 * Only the fields B-AC2 introduces are read here. We intentionally do NOT add a
 * YAML dependency — the file is expected to be hand-edited and small, and a
 * deliberately tiny parser keeps the install footprint flat (Phase 12 §12.5
 * "no optional deps" trap-avoidance bullet).
 *
 * Schema (v1):
 *
 *   convergence:
 *     gate_advance_wave: true   # default true
 *
 *   deep_plan:                # Cursor deep-plan Task model slugs (optional)
 *     correctness: opus-4.6
 *     ergonomics: composer-2.5
 *     robustness: gpt-5.5-xhigh
 *     synthesis: opus-4.6
 *
 *   implement:                # Cursor implement-wave Task models (optional)
 *     simple: composer-2.5
 *     medium: composer-2.5
 *     complex: opus-4.6
 *
 *   duel:                     # Cursor dueling-wizards Task models (optional)
 *     wizard_a: opus-4.6
 *     wizard_b: gpt-5.5-xhigh
 *     wizard_c: composer-2.5
 *     synthesis: opus-4.6
 *
 * R-008 (agent-ergonomics audit pass 4) — strict-key validation with
 * Levenshtein-1 typo suggestions. Currently warn-only (collect warnings
 * on the result; callers decide how to surface them). The deprecation
 * path is: v3.x warns, v4.0 fails. This is the warn-only stage.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

export interface FlywheelConfigConvergence {
  gate_advance_wave: boolean;
}

/** Per-perspective Cursor model slugs for deep-plan Task spawns. */
export interface FlywheelConfigDeepPlan {
  correctness?: string;
  ergonomics?: string;
  robustness?: string;
  synthesis?: string;
}

/** Per-complexity Cursor model slugs for implement-wave Task spawns. */
export interface FlywheelConfigImplement {
  simple?: string;
  medium?: string;
  complex?: string;
}

/** Per-wizard Cursor model slugs for dueling-idea-wizards Task spawns. */
export interface FlywheelConfigDuel {
  wizard_a?: string;
  wizard_b?: string;
  wizard_c?: string;
  synthesis?: string;
}

export interface FlywheelConfigGrader {
  model?: string;
}

export interface FlywheelConfigImplTick {
  interval_seconds?: number;
  review_model?: string;
  max_parallel_impl?: number;
  /** Commits since last batch-review baseline before fresh-eyes auto-trigger (0 = off). */
  commit_batch_threshold?: number;
}

export interface FlywheelConfigCoordinator {
  /** When false, skip server-side stale tick drop (default true). */
  epochGuards?: boolean;
  /** When false, omit template nextActionHint payloads (default true). */
  nextActionHints?: boolean;
}

export type FlywheelConfigProfileStaleAction = 'nudge' | 'auto_refresh';

export interface FlywheelConfigProfile {
  watchIntentFiles?: boolean;
  staleAction?: FlywheelConfigProfileStaleAction;
  debounceSeconds?: number;
}

export interface FlywheelConfigReview {
  thermo_nuclear_model?: string;
}

/** Scoped vs full-suite test policy for implement swarms. */
export interface FlywheelConfigVerify {
  test_cwd?: string;
  build_slot?: string;
  max_workers?: number;
  allow_full_suite_when_alone?: boolean;
}

/** Cursor swarm coordination — single-branch + Agent Mail (default). */
export interface FlywheelConfigCoordination {
  mode?: 'single-branch' | 'worktree';
}

export interface FlywheelConfig {
  convergence: FlywheelConfigConvergence;
  deep_plan?: FlywheelConfigDeepPlan;
  implement?: FlywheelConfigImplement;
  duel?: FlywheelConfigDuel;
  grader?: FlywheelConfigGrader;
  impl_tick?: FlywheelConfigImplTick;
  coordinator?: FlywheelConfigCoordinator;
  profile?: FlywheelConfigProfile;
  review?: FlywheelConfigReview;
  verify?: FlywheelConfigVerify;
  coordination?: FlywheelConfigCoordination;
}

/**
 * R-008 — single warning surfaced from the loader. Each reports a
 * structural problem in the YAML that did not block the load (the
 * fields we recognized still loaded with their defaults).
 */
export interface FlywheelConfigWarning {
  kind: 'unknown_key' | 'wrong_type' | 'unparseable_yaml';
  /** dotted path to the offending key, e.g. "convergence.gate_advance_wav" */
  path: string;
  message: string;
  /** present for unknown_key when a Levenshtein-1 match exists */
  suggestion?: string;
}

export interface FlywheelConfigResult {
  config: FlywheelConfig;
  warnings: FlywheelConfigWarning[];
  /** absolute path that was attempted (whether or not it existed) */
  source: string;
}

/**
 * R-008 — known keys per nesting level. Adding a new field elsewhere
 * MUST update this map AND DEFAULT_CONFIG. Keep them lockstep.
 */
const KNOWN_KEYS: Record<string, readonly string[]> = {
  '': ['convergence', 'deep_plan', 'implement', 'duel', 'grader', 'impl_tick', 'coordinator', 'profile', 'review', 'verify', 'coordination'],
  convergence: ['gate_advance_wave'],
  deep_plan: ['correctness', 'ergonomics', 'robustness', 'synthesis'],
  implement: ['simple', 'medium', 'complex'],
  duel: ['wizard_a', 'wizard_b', 'wizard_c', 'synthesis'],
  grader: ['model'],
  impl_tick: ['interval_seconds', 'review_model', 'max_parallel_impl', 'commit_batch_threshold'],
  coordinator: ['epochGuards', 'nextActionHints'],
  profile: ['watchIntentFiles', 'staleAction', 'debounceSeconds'],
  review: ['thermo_nuclear_model'],
  verify: ['test_cwd', 'build_slot', 'max_workers', 'allow_full_suite_when_alone'],
  coordination: ['mode'],
};

export const DEFAULT_CONFIG: FlywheelConfig = {
  convergence: {
    gate_advance_wave: true,
  },
};

const CONFIG_FILENAME = 'flywheel.config.yaml';

/**
 * Levenshtein distance between two short strings. Returns Infinity if
 * either input is suspiciously long (we only ever compare config keys,
 * which are < 40 chars). Used by R-008 typo detection.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length > 40 || b.length > 40) return Infinity;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,         // deletion
        curr[j - 1] + 1,     // insertion
        prev[j - 1] + cost,  // substitution
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/**
 * R-008 — return the closest known key within Levenshtein distance 1, or
 * undefined if nothing is close enough. Used to suggest "did you mean".
 */
export function suggestKey(unknown: string, known: readonly string[]): string | undefined {
  let bestKey: string | undefined;
  let bestDist = 2; // strictly < 2 means accept
  for (const k of known) {
    const d = levenshtein(unknown, k);
    if (d < bestDist) {
      bestDist = d;
      bestKey = k;
    }
  }
  return bestKey;
}

/**
 * Parse the limited YAML subset we care about for B-AC2:
 *   key: value
 *   nested-key:
 *     subkey: value
 *
 * No lists, no quoted-string escapes, no anchors. Anything more complex is
 * treated as "use defaults" — explicit fallbacks beat silent misparse.
 */
function parseTinyYaml(src: string): Record<string, unknown> {
  const lines = src.split(/\r?\n/);
  const root: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentObj: Record<string, unknown> | null = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (line.trim() === '') continue;
    const indent = line.length - line.replace(/^\s+/, '').length;
    const trimmed = line.trim();
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (indent === 0) {
      if (value === '') {
        currentKey = key;
        currentObj = {};
        root[key] = currentObj;
      } else {
        root[key] = coerce(value);
        currentKey = null;
        currentObj = null;
      }
    } else if (currentObj && currentKey !== null) {
      currentObj[key] = coerce(value);
    }
  }
  return root;
}

function coerce(v: string): boolean | number | string {
  const lc = v.toLowerCase();
  if (lc === 'true') return true;
  if (lc === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  // strip surrounding quotes if present
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * R-008 — collect structural warnings about the parsed YAML without
 * blocking the load. Only walks one level of nesting (matching the
 * schema). Adding a new top-level node should also add a KNOWN_KEYS
 * entry for that node's children.
 */
function collectConfigWarnings(parsed: Record<string, unknown>): FlywheelConfigWarning[] {
  const warnings: FlywheelConfigWarning[] = [];
  const topKnown = KNOWN_KEYS[''];
  for (const key of Object.keys(parsed)) {
    if (topKnown.includes(key)) continue;
    const suggestion = suggestKey(key, topKnown);
    warnings.push({
      kind: 'unknown_key',
      path: key,
      message: suggestion
        ? `Unknown top-level key "${key}" — did you mean "${suggestion}"?`
        : `Unknown top-level key "${key}".`,
      ...(suggestion ? { suggestion } : {}),
    });
  }
  for (const [topKey, value] of Object.entries(parsed)) {
    if (!topKnown.includes(topKey)) continue; // already warned
    const known = KNOWN_KEYS[topKey];
    if (!known) continue;
    if (typeof value !== 'object' || value === null) continue;
    for (const subKey of Object.keys(value as Record<string, unknown>)) {
      if (known.includes(subKey)) continue;
      const suggestion = suggestKey(subKey, known);
      warnings.push({
        kind: 'unknown_key',
        path: `${topKey}.${subKey}`,
        message: suggestion
          ? `Unknown key "${topKey}.${subKey}" — did you mean "${topKey}.${suggestion}"?`
          : `Unknown key "${topKey}.${subKey}".`,
        ...(suggestion ? { suggestion: `${topKey}.${suggestion}` } : {}),
      });
    }
  }
  // Type check on the recognized fields.
  const conv = parsed.convergence;
  if (conv && typeof conv === 'object') {
    const gate = (conv as Record<string, unknown>).gate_advance_wave;
    if (gate !== undefined && typeof gate !== 'boolean') {
      warnings.push({
        kind: 'wrong_type',
        path: 'convergence.gate_advance_wave',
        message: `convergence.gate_advance_wave must be a boolean (true|false); got ${JSON.stringify(gate)}. Using default.`,
      });
    }
  }
  return warnings;
}

/**
 * R-008 — full loader returning config + warnings + source. The
 * `loadFlywheelConfig` thin wrapper preserves the existing single-value
 * return type for callers that don't care about warnings.
 */
export function loadFlywheelConfigWithWarnings(cwd: string): FlywheelConfigResult {
  const configPath = path.join(cwd, CONFIG_FILENAME);
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    return { config: DEFAULT_CONFIG, warnings: [], source: configPath };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = parseTinyYaml(raw);
  } catch (err: unknown) {
    return {
      config: DEFAULT_CONFIG,
      warnings: [
        {
          kind: 'unparseable_yaml',
          path: '',
          message: `Could not parse ${configPath}: ${err instanceof Error ? err.message : String(err)}. Using defaults.`,
        },
      ],
      source: configPath,
    };
  }
  const warnings = collectConfigWarnings(parsed);

  let gate = DEFAULT_CONFIG.convergence.gate_advance_wave;
  const convNode = parsed.convergence;
  if (typeof convNode === 'object' && convNode !== null) {
    const conv = convNode as Record<string, unknown>;
    if (typeof conv.gate_advance_wave === 'boolean') {
      gate = conv.gate_advance_wave;
    }
  }

  let deep_plan: FlywheelConfigDeepPlan | undefined;
  const dpNode = parsed.deep_plan;
  if (typeof dpNode === 'object' && dpNode !== null) {
    const dp = dpNode as Record<string, unknown>;
    const pick = (k: keyof FlywheelConfigDeepPlan): string | undefined => {
      const v = dp[k];
      return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
    };
    deep_plan = {
      correctness: pick('correctness'),
      ergonomics: pick('ergonomics'),
      robustness: pick('robustness'),
      synthesis: pick('synthesis'),
    };
    if (
      !deep_plan.correctness &&
      !deep_plan.ergonomics &&
      !deep_plan.robustness &&
      !deep_plan.synthesis
    ) {
      deep_plan = undefined;
    }
  }

  let implement: FlywheelConfigImplement | undefined;
  const implNode = parsed.implement;
  if (typeof implNode === 'object' && implNode !== null) {
    const impl = implNode as Record<string, unknown>;
    const pick = (k: keyof FlywheelConfigImplement): string | undefined => {
      const v = impl[k];
      return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
    };
    implement = {
      simple: pick('simple'),
      medium: pick('medium'),
      complex: pick('complex'),
    };
    if (!implement.simple && !implement.medium && !implement.complex) {
      implement = undefined;
    }
  }

  let duel: FlywheelConfigDuel | undefined;
  const duelNode = parsed.duel;
  if (typeof duelNode === 'object' && duelNode !== null) {
    const d = duelNode as Record<string, unknown>;
    const pick = (k: keyof FlywheelConfigDuel): string | undefined => {
      const v = d[k];
      return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
    };
    duel = {
      wizard_a: pick('wizard_a'),
      wizard_b: pick('wizard_b'),
      wizard_c: pick('wizard_c'),
      synthesis: pick('synthesis'),
    };
    if (
      !duel.wizard_a &&
      !duel.wizard_b &&
      !duel.wizard_c &&
      !duel.synthesis
    ) {
      duel = undefined;
    }
  }

  let grader: FlywheelConfigGrader | undefined;
  const graderNode = parsed.grader;
  if (typeof graderNode === 'object' && graderNode !== null) {
    const g = graderNode as Record<string, unknown>;
    const model =
      typeof g.model === 'string' && g.model.trim() !== '' ? g.model.trim() : undefined;
    if (model) grader = { model };
  }

  let impl_tick: FlywheelConfigImplTick | undefined;
  const tickNode = parsed.impl_tick;
  if (typeof tickNode === 'object' && tickNode !== null) {
    const t = tickNode as Record<string, unknown>;
    const interval_seconds =
      typeof t.interval_seconds === 'number' && t.interval_seconds >= 60
        ? Math.floor(t.interval_seconds)
        : undefined;
    const review_model =
      typeof t.review_model === 'string' && t.review_model.trim()
        ? t.review_model.trim()
        : undefined;
    const max_parallel_impl =
      typeof t.max_parallel_impl === 'number' && t.max_parallel_impl >= 1
        ? Math.floor(t.max_parallel_impl)
        : undefined;
    const commit_batch_threshold =
      typeof t.commit_batch_threshold === 'number' && Number.isInteger(t.commit_batch_threshold)
        && t.commit_batch_threshold >= 0
        ? t.commit_batch_threshold
        : undefined;
    if (interval_seconds || review_model || max_parallel_impl || commit_batch_threshold !== undefined) {
      impl_tick = {
        ...(interval_seconds ? { interval_seconds } : {}),
        ...(review_model ? { review_model } : {}),
        ...(max_parallel_impl ? { max_parallel_impl } : {}),
        ...(commit_batch_threshold !== undefined ? { commit_batch_threshold } : {}),
      };
    }
  }

  let coordinator: FlywheelConfigCoordinator | undefined;
  const coordinatorNode = parsed.coordinator;
  if (typeof coordinatorNode === 'object' && coordinatorNode !== null) {
    const c = coordinatorNode as Record<string, unknown>;
    const epochGuards =
      typeof c.epochGuards === 'boolean' ? c.epochGuards : undefined;
    const nextActionHints =
      typeof c.nextActionHints === 'boolean' ? c.nextActionHints : undefined;
    if (epochGuards !== undefined || nextActionHints !== undefined) {
      coordinator = {
        ...(epochGuards !== undefined ? { epochGuards } : {}),
        ...(nextActionHints !== undefined ? { nextActionHints } : {}),
      };
    }
  }

  let verify: FlywheelConfigVerify | undefined;
  const verifyNode = parsed.verify;
  if (typeof verifyNode === 'object' && verifyNode !== null) {
    const v = verifyNode as Record<string, unknown>;
    const test_cwd =
      typeof v.test_cwd === 'string' && v.test_cwd.trim() ? v.test_cwd.trim() : undefined;
    const build_slot =
      typeof v.build_slot === 'string' && v.build_slot.trim() ? v.build_slot.trim() : undefined;
    const max_workers =
      typeof v.max_workers === 'number' && v.max_workers >= 1
        ? Math.floor(v.max_workers)
        : undefined;
    const allow_full_suite_when_alone =
      typeof v.allow_full_suite_when_alone === 'boolean'
        ? v.allow_full_suite_when_alone
        : undefined;
    if (
      test_cwd ||
      build_slot ||
      max_workers ||
      allow_full_suite_when_alone !== undefined
    ) {
      verify = {
        ...(test_cwd ? { test_cwd } : {}),
        ...(build_slot ? { build_slot } : {}),
        ...(max_workers ? { max_workers } : {}),
        ...(allow_full_suite_when_alone !== undefined
          ? { allow_full_suite_when_alone }
          : {}),
      };
    }
  }

  let profile: FlywheelConfigProfile | undefined;
  const profileNode = parsed.profile;
  if (typeof profileNode === 'object' && profileNode !== null) {
    const p = profileNode as Record<string, unknown>;
    const watchIntentFiles =
      typeof p.watchIntentFiles === 'boolean' ? p.watchIntentFiles : undefined;
    const staleActionRaw =
      typeof p.staleAction === 'string' ? p.staleAction.trim().toLowerCase() : undefined;
    const staleAction: FlywheelConfigProfileStaleAction | undefined =
      staleActionRaw === 'nudge' || staleActionRaw === 'auto_refresh'
        ? staleActionRaw
        : undefined;
    const debounceSeconds =
      typeof p.debounceSeconds === 'number' && p.debounceSeconds >= 0
        ? Math.floor(p.debounceSeconds)
        : undefined;
    if (
      watchIntentFiles !== undefined ||
      staleAction !== undefined ||
      debounceSeconds !== undefined
    ) {
      profile = {
        ...(watchIntentFiles !== undefined ? { watchIntentFiles } : {}),
        ...(staleAction ? { staleAction } : {}),
        ...(debounceSeconds !== undefined ? { debounceSeconds } : {}),
      };
    }
  }

  let review: FlywheelConfigReview | undefined;
  const reviewNode = parsed.review;
  if (typeof reviewNode === 'object' && reviewNode !== null) {
    const r = reviewNode as Record<string, unknown>;
    const thermo_nuclear_model =
      typeof r.thermo_nuclear_model === 'string' && r.thermo_nuclear_model.trim()
        ? r.thermo_nuclear_model.trim()
        : undefined;
    if (thermo_nuclear_model) {
      review = { thermo_nuclear_model };
    }
  }

  let coordination: FlywheelConfigCoordination | undefined;
  const coordinationNode = parsed.coordination;
  if (typeof coordinationNode === 'object' && coordinationNode !== null) {
    const c = coordinationNode as Record<string, unknown>;
    const modeRaw =
      typeof c.mode === 'string' ? c.mode.trim().toLowerCase() : undefined;
    const mode: FlywheelConfigCoordination['mode'] | undefined =
      modeRaw === 'single-branch' || modeRaw === 'worktree' ? modeRaw : undefined;
    if (mode) {
      coordination = { mode };
    }
  }

  return {
    config: {
      convergence: { gate_advance_wave: gate },
      ...(deep_plan ? { deep_plan } : {}),
      ...(implement ? { implement } : {}),
      ...(duel ? { duel } : {}),
      ...(grader ? { grader } : {}),
      ...(impl_tick ? { impl_tick } : {}),
      ...(coordinator ? { coordinator } : {}),
      ...(profile ? { profile } : {}),
      ...(review ? { review } : {}),
      ...(verify ? { verify } : {}),
      ...(coordination ? { coordination } : {}),
    },
    warnings,
    source: configPath,
  };
}

export function loadFlywheelConfig(cwd: string): FlywheelConfig {
  return loadFlywheelConfigWithWarnings(cwd).config;
}

const DEFAULT_THERMO_REVIEW_MODEL = 'opus-4.6';

/** Model for thermo-nuclear subagent (batch review + hit-me thermo persona). */
export function resolveThermoNuclearModel(cwd: string): string {
  const fromEnv = process.env.FW_REVIEW_THERMO_MODEL?.trim();
  if (fromEnv) return fromEnv;
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  const fromReview = config.review?.thermo_nuclear_model?.trim();
  if (fromReview) return fromReview;
  const fromTick = config.impl_tick?.review_model?.trim();
  if (fromTick) return fromTick;
  return DEFAULT_THERMO_REVIEW_MODEL;
}

/** True when coordinator.epochGuards is absent or explicitly true (default on). */
export function areEpochGuardsEnabled(cwd: string): boolean {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  return config.coordinator?.epochGuards !== false;
}

/** True when coordinator.nextActionHints is absent or explicitly true (default on). */
export function areNextActionHintsEnabled(cwd: string): boolean {
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  return config.coordinator?.nextActionHints !== false;
}

/** Config/env coordination mode hint (Cursor swarm always uses single-branch when Agent Mail is up). */
export function readCoordinationModeConfig(cwd: string): 'single-branch' | 'worktree' | undefined {
  const envRaw = process.env.FW_COORDINATION_MODE?.trim().toLowerCase();
  if (envRaw === 'single-branch' || envRaw === 'worktree') {
    return envRaw;
  }
  const { config } = loadFlywheelConfigWithWarnings(cwd);
  return config.coordination?.mode;
}
