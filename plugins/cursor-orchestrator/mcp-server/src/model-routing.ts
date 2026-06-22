/**
 * Cost-Aware Model Routing
 *
 * Not every bead needs the most expensive model. A simple doc update
 * doesn't need Opus. But architectural integration does. This module
 * classifies bead complexity and routes to the appropriate model tier.
 *
 * Review passes always use a DIFFERENT model than implementation
 * to enforce the Flywheel's "different models have different tastes
 * and blind spots" principle.
 */

import {
  collectBeadFilePaths,
  countAcceptanceCriteria,
  parseBeadEffort,
} from "./beads.js";
import type { Bead } from "./types.js";
import { MODEL_ROUTING_TIERS } from "./prompts.js";

// ─── Types ──────────────────────────────────────────────────

export type BeadComplexity = "simple" | "medium" | "complex";

export interface BeadComplexityResult {
  complexity: BeadComplexity;
  reason: string;
  score: number;
  fileCount: number;
  acceptanceCount: number;
}

export interface ModelRoute {
  /** Model for implementing the bead. */
  implementation: string;
  /** Model for reviewing (forced diversity - different from implementation). */
  review: string;
  /** Complexity classification. */
  complexity: BeadComplexity;
  /** Reasoning for the classification. */
  reason: string;
}

// ─── Model Tiers ────────────────────────────────────────────

export interface ModelTier {
  implementation: string;
  review: string;
  fallbacks?: string[];  // for future use
}

const DEFAULT_TIERS: Record<BeadComplexity, ModelTier> = {
  simple: {
    implementation: MODEL_ROUTING_TIERS.simple.implementation,
    review: MODEL_ROUTING_TIERS.simple.review,
  },
  medium: {
    implementation: MODEL_ROUTING_TIERS.medium.implementation,
    review: MODEL_ROUTING_TIERS.medium.review,
  },
  complex: {
    implementation: MODEL_ROUTING_TIERS.complex.implementation,
    review: MODEL_ROUTING_TIERS.complex.review,
  },
};

// ─── Tier Validation ───────────────────────────────────────

function validateModelTier(tier: ModelTier, label: string): boolean {
  if (!tier.implementation || !tier.review) {
    process.stderr.write(`[model-routing] WARNING: tier "${label}" has empty implementation or review model — falling back to DEFAULT_TIERS\n`);
    return false;
  }
  return true;
}

// ─── Complexity Classification ──────────────────────────────

/** Signals that indicate higher complexity. */
const COMPLEXITY_SIGNALS = [
  /architect/i,
  /integrat/i,
  /migrat/i,
  /security/i,
  /auth(?:entication|orization)/i,
  /concurrent/i,
  /distribut/i,
  /cross-cutting/i,
  /refactor/i,
  /breaking.change/i,
  /state.machine/i,
  /protocol/i,
  /crypt/i,
  /orchestrat/i,
  /multi-?agent/i,
  /race.condition/i,
  /transaction/i,
  /backward.compat/i,
] as const;

/** Signals that indicate lower complexity. */
const SIMPLICITY_SIGNALS = [
  /readme/i,
  /changelog/i,
  /doc(?:s|umentation)/i,
  /typo/i,
  /rename/i,
  /bump.version/i,
  /update.dep(?:endency|encies)?/i,
  /format(?:ting)?/i,
  /comment/i,
  /copy(?:-|\s)?edit/i,
  /whitespace/i,
] as const;

const RISKY_PATH_RE =
  /(?:^|\/)(?:auth|security|payment|migration|schema|checkpoint|beads|mcp-server\/src\/)/i;

const COMPLEX_LABEL_RE =
  /^(?:p0|p1|security|critical|breaking|architecture|complex|risky)$/i;

const SIMPLE_LABEL_RE = /^(?:docs|chore|typo|style|cleanup|copy)$/i;

function complexityFromScore(score: number): BeadComplexity {
  if (score >= 5) return "complex";
  if (score >= 2) return "medium";
  return "simple";
}

/**
 * Classify a bead's complexity based on heuristics.
 * No LLM needed - runs in <1ms.
 */
export function classifyBeadComplexity(bead: Bead): BeadComplexityResult {
  const desc = bead.description ?? "";
  const title = bead.title ?? "";
  const text = `${title} ${desc}`;
  const descLength = desc.length;
  const filePaths = collectBeadFilePaths(bead);
  const fileCount = filePaths.length;
  const acceptanceCount = countAcceptanceCriteria(desc);

  let score = 0;
  const reasons: string[] = [];

  // File scope (uses bullet paths, Files sections, and prose path tokens)
  if (fileCount > 8) {
    score += 3;
    reasons.push(`${fileCount} file paths`);
  } else if (fileCount > 4) {
    score += 2;
    reasons.push(`${fileCount} file paths`);
  } else if (fileCount > 1) {
    score += 1;
    reasons.push(`${fileCount} file paths`);
  }

  if (filePaths.some((p) => RISKY_PATH_RE.test(p))) {
    score += 1;
    reasons.push("core/risky paths");
  }

  if (
    fileCount > 0
    && filePaths.every((p) => p.startsWith("docs/") || /\.md$/i.test(p))
  ) {
    score -= 2;
    reasons.push("docs-only scope");
  }

  // Acceptance criteria depth
  if (acceptanceCount >= 6) {
    score += 2;
    reasons.push(`${acceptanceCount} acceptance criteria`);
  } else if (acceptanceCount >= 3) {
    score += 1;
    reasons.push(`${acceptanceCount} acceptance criteria`);
  }

  // Description length
  if (descLength > 2000) {
    score += 2;
    reasons.push("long description");
  } else if (descLength > 800) {
    score += 1;
    reasons.push("detailed description");
  }

  // Priority (P0/P1 = likely more complex)
  if (typeof bead.priority === "number" && !Number.isNaN(bead.priority) && bead.priority <= 1) {
    score += 1;
    reasons.push("high priority");
  }

  // Effort tier (template / estimate field)
  const effort = parseBeadEffort(bead);
  if (effort === "XL") {
    score += 2;
    reasons.push("effort XL");
  } else if (effort === "L") {
    score += 1;
    reasons.push("effort L");
  } else if (effort === "S") {
    score -= 1;
    reasons.push("effort S");
  }

  // Labels
  for (const label of bead.labels ?? []) {
    const norm = label.trim().toLowerCase();
    if (COMPLEX_LABEL_RE.test(norm)) {
      score += 1;
      reasons.push(`label ${label}`);
    } else if (SIMPLE_LABEL_RE.test(norm)) {
      score -= 1;
      reasons.push(`label ${label}`);
    }
  }

  // Issue type
  const issueType = `${bead.issue_type ?? bead.type ?? ""}`.toLowerCase();
  if (/bug|incident|regression/.test(issueType)) {
    score += 1;
    reasons.push("bug-type bead");
  } else if (/chore|docs|copy/.test(issueType)) {
    score -= 1;
    reasons.push("chore/docs bead");
  }

  // Complexity signals in text
  const complexMatches = COMPLEXITY_SIGNALS.filter((p) => p.test(text));
  if (complexMatches.length > 0) {
    score += Math.min(complexMatches.length, 3);
    reasons.push(`complexity signals: ${complexMatches.length}`);
  }

  // Simplicity signals (negative score)
  const simpleMatches = SIMPLICITY_SIGNALS.filter((p) => p.test(text));
  if (simpleMatches.length > 0) {
    score -= Math.min(simpleMatches.length, 3);
    reasons.push(`simplicity signals: ${simpleMatches.length}`);
  }

  // Vague beads with no file scope stay medium-ish when description is substantial
  if (fileCount === 0 && descLength > 400 && acceptanceCount >= 2) {
    score += 1;
    reasons.push("substantial scope without explicit paths");
  }

  const complexity = complexityFromScore(score);

  return {
    complexity,
    reason: reasons.join(", ") || "baseline score",
    score,
    fileCount,
    acceptanceCount,
  };
}

// ─── Routing ────────────────────────────────────────────────

/**
 * Route a bead to the appropriate model tier.
 */
export function routeModel(bead: Bead, tiers?: Record<BeadComplexity, ModelTier>): ModelRoute {
  const { complexity, reason } = classifyBeadComplexity(bead);
  const tierMap = tiers ?? DEFAULT_TIERS;

  let tier = tierMap[complexity];

  // Validate the resolved tier; fall back to DEFAULT_TIERS if invalid or missing
  if (!tier || !validateModelTier(tier, complexity)) {
    process.stderr.write(`[model-routing] falling back to DEFAULT_TIERS["${complexity}"]\n`);
    tier = DEFAULT_TIERS[complexity];

    // Ultimate fallback to medium if DEFAULT_TIERS entry also fails (shouldn't happen)
    if (!validateModelTier(tier, `DEFAULT:${complexity}`)) {
      process.stderr.write(`[model-routing] DEFAULT_TIERS["${complexity}"] also invalid — using DEFAULT_TIERS["medium"]\n`);
      tier = DEFAULT_TIERS.medium;
    }
  }

  return {
    implementation: tier.implementation,
    review: tier.review,
    complexity,
    reason,
  };
}

/**
 * Route multiple beads and summarize the distribution.
 */
export function routeBeads(beads: Bead[]): {
  routes: Map<string, ModelRoute>;
  summary: { simple: number; medium: number; complex: number };
} {
  const routes = new Map<string, ModelRoute>();
  const summary = { simple: 0, medium: 0, complex: 0 };

  for (const bead of beads) {
    const route = routeModel(bead);
    routes.set(bead.id, route);
    summary[route.complexity]++;
  }

  return { routes, summary };
}

// ─── Display ────────────────────────────────────────────────

/**
 * Format model routing summary for display.
 */
export function formatRoutingSummary(
  routes: Map<string, ModelRoute>,
  beads: Bead[]
): string {
  if (routes.size === 0) return "";

  const summary = { simple: 0, medium: 0, complex: 0 };
  for (const route of routes.values()) {
    summary[route.complexity]++;
  }

  const total = routes.size;
  const lines = [
    `Model Routing (${total} beads)`,
    `  Simple:  ${summary.simple} bead${summary.simple !== 1 ? "s" : ""} -> fast model (haiku-class)`,
    `  Medium:  ${summary.medium} bead${summary.medium !== 1 ? "s" : ""} -> balanced model (sonnet-class)`,
    `  Complex: ${summary.complex} bead${summary.complex !== 1 ? "s" : ""} -> strongest model (opus-class)`,
  ];

  // Show the complex beads specifically
  const complexBeads = beads.filter((b) => routes.get(b.id)?.complexity === "complex");
  if (complexBeads.length > 0 && complexBeads.length <= 5) {
    lines.push("  Complex beads:");
    for (const b of complexBeads) {
      const route = routes.get(b.id)!;
      lines.push(`    - ${b.id}: ${b.title} (${route.reason})`);
    }
  }

  return lines.join("\n");
}
