#!/usr/bin/env node
/**
 * Sync burningportra/agent-flywheel-plugin into plugins/cursor-orchestrator.
 *
 * Usage (repo root):
 *   node scripts/sync-agent-flywheel-upstream.mjs [--ref v3.18.1] [--upstream-dir PATH]
 *   node scripts/sync-agent-flywheel-upstream.mjs --check
 */
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pluginRoot = path.join(repoRoot, "plugins", "cursor-orchestrator");
const defaultRef = "v3.18.1";
const manifestPath = path.join(pluginRoot, "SYNC_MANIFEST.json");

const COPY_DIRS = [
  { from: "mcp-server/src", to: "mcp-server/src", overlay: ["cursor-adapters.ts"] },
  { from: "mcp-server/scripts", to: "mcp-server/scripts", overlay: ["build-skills-bundle.ts"] },
  { from: "commands", to: "commands" },
  { from: "skills", to: "skills" },
  { from: "hooks", to: "hooks", skipFiles: ["hooks.json"] },
  { from: "agents", to: "agents", optional: true },
  { from: "rules", to: "rules", optional: true },
];

const COPY_FILES = [
  { from: "flywheel.config.yaml", to: "flywheel.config.yaml" },
  { from: "scripts/build-mutex.sh", to: "scripts/build-mutex.sh" },
  { from: "mcp-server/.lintskill-baseline.json", to: "mcp-server/.lintskill-baseline.json" },
  { from: "mcp-server/.lintskill-manifest.json", to: "mcp-server/.lintskill-manifest.json" },
  { from: "mcp-server/package.json", to: "mcp-server/package.json" },
  { from: "mcp-server/package-lock.json", to: "mcp-server/package-lock.json" },
  { from: "mcp-server/tsconfig.json", to: "mcp-server/tsconfig.json" },
  { from: "mcp-server/tsconfig.scripts.json", to: "mcp-server/tsconfig.scripts.json" },
  { from: "mcp-server/vitest.config.ts", to: "mcp-server/vitest.config.ts" },
  { from: "AGENTS.md", to: "AGENTS.md" },
];

const PRESERVE_FILES = [
  ".cursor-plugin/plugin.json",
  "mcp.json",
  "scripts/start-orchestrator-mcp.cjs",
  "scripts/session-start-orchestrator-notice.cjs",
  "scripts/post-tool-orch-approve-hint.sh",
  "hooks/hooks.json",
  "CHANGELOG.md",
  "README.md",
  "assets/logo.svg",
];

/** Cursor-specific bodies restored after upstream overwrites `commands/` or `skills/`. */
const CURSOR_OVERLAY_PATHS = [
  "AGENTS.md",
  "commands/flywheel.md",
  "commands/start.md",
  "commands/flywheel-swarm.md",
  "commands/flywheel-resume.md",
  "commands/flywheel-recover-gates.md",
  "commands/recover-gates.md",
  "skills/start/SKILL.md",
  "skills/start/_ceremony.md",
  "skills/start/_discover.md",
  "skills/start/_bootstrap.md",
  "skills/start/_implement.cursor.md",
  "skills/start/_planning.cursor.md",
  "skills/start/_review.md",
  "skills/start/_wrapup.md",
  "skills/flywheel-swarm/SKILL.md",
  "rules/context-budget.mdc",
  "rules/cursor-swarm.mdc",
  "rules/cursor-user-gates.mdc",
  "rules/orchestrator-cursor-models.mdc",
  "mcp-server/scripts/build-skills-bundle.ts",
  "mcp-server/package.json",
];

function parseArgs() {
  const args = process.argv.slice(2);
  let ref = defaultRef;
  let upstreamDir = "";
  let check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ref" && args[i + 1]) {
      ref = args[++i];
    } else if (args[i] === "--upstream-dir" && args[i + 1]) {
      upstreamDir = path.resolve(args[++i]);
    } else if (args[i] === "--check") {
      check = true;
    }
  }
  return { ref, upstreamDir, check };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function gitRevParse(repoDir, ref) {
  const r = spawnSync("git", ["rev-parse", ref], { cwd: repoDir, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

async function ensureUpstream(ref, upstreamDir) {
  if (upstreamDir && (await exists(upstreamDir))) {
    return { dir: upstreamDir, sha: gitRevParse(upstreamDir, "HEAD") ?? "unknown" };
  }
  const cache = path.join(repoRoot, ".cache", "agent-flywheel-plugin");
  if (!(await exists(path.join(cache, ".git")))) {
    await fs.mkdir(path.dirname(cache), { recursive: true });
    const clone = spawnSync(
      "git",
      ["clone", "--depth", "1", "--branch", ref, "https://github.com/burningportra/agent-flywheel-plugin.git", cache],
      { stdio: "inherit" },
    );
    if (clone.status !== 0) {
      const cloneMain = spawnSync(
        "git",
        ["clone", "--depth", "1", "https://github.com/burningportra/agent-flywheel-plugin.git", cache],
        { stdio: "inherit" },
      );
      if (cloneMain.status !== 0) process.exit(1);
      spawnSync("git", ["fetch", "--depth", "1", "origin", "tag", ref], { cwd: cache, stdio: "inherit" });
      spawnSync("git", ["checkout", ref], { cwd: cache, stdio: "inherit" });
    }
  } else {
    spawnSync("git", ["fetch", "--depth", "1", "origin", ref], { cwd: cache, stdio: "inherit" });
    spawnSync("git", ["checkout", ref], { cwd: cache, stdio: "inherit" });
  }
  const sha = gitRevParse(cache, "HEAD") ?? "unknown";
  return { dir: cache, sha };
}

async function rmrf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyDir(src, dest, { skipFiles = [], overlayKeep = [] } = {}) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    if (skipFiles.includes(ent.name)) continue;
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      await copyDir(s, d, { skipFiles, overlayKeep });
    } else if (ent.isFile()) {
      if (overlayKeep.includes(ent.name) && (await exists(d))) continue;
      await fs.copyFile(s, d);
    }
  }
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function readOverlayBackups() {
  const backups = {};
  for (const rel of CURSOR_OVERLAY_PATHS) {
    const p = path.join(pluginRoot, rel);
    if (await exists(p)) {
      backups[rel] = await fs.readFile(p, "utf8");
    }
  }
  return backups;
}

async function restoreOverlayBackups(backups) {
  for (const [rel, content] of Object.entries(backups)) {
    const p = path.join(pluginRoot, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content);
  }
}

/** Cursor marketplace requires `name` in command frontmatter; upstream uses description-only. */
async function patchMcpPackageJsonForCursor() {
  const pkgPath = path.join(pluginRoot, "mcp-server", "package.json");
  let raw = await fs.readFile(pkgPath, "utf8");
  const pin = 'FW_BUNDLE_GENERATED_AT=1970-01-01T00:00:00.000Z node dist/scripts/build-skills-bundle.js';
  if (!raw.includes("FW_BUNDLE_GENERATED_AT")) {
    raw = raw.replace(
      /"build:bundle":\s*"[^"]*"/,
      `"build:bundle": "${pin}"`,
    );
    await fs.writeFile(pkgPath, raw);
  }
}

async function ensureCommandNameFrontmatter() {
  const commandsDir = path.join(pluginRoot, "commands");
  if (!(await exists(commandsDir))) return;
  const files = await fs.readdir(commandsDir);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const p = path.join(commandsDir, file);
    let content = await fs.readFile(p, "utf8");
    if (!content.startsWith("---\n")) continue;
    const close = content.indexOf("\n---\n", 4);
    if (close === -1) continue;
    const fm = content.slice(4, close);
    if (/^name:/m.test(fm)) continue;
    const stem = file.replace(/\.md$/, "");
    content = `---\nname: ${stem}\n${fm}${content.slice(close)}`;
    await fs.writeFile(p, content);
  }
}

async function runSync(upstreamDir, sha, ref) {
  const overlayBackups = await readOverlayBackups();
  const touched = [];
  for (const spec of COPY_DIRS) {
    const src = path.join(upstreamDir, spec.from);
    const dest = path.join(pluginRoot, spec.to);
    if (!(await exists(src))) {
      if (spec.optional) continue;
      console.error(`Missing upstream path: ${spec.from}`);
      process.exit(1);
    }
    await rmrf(dest);
    await copyDir(src, dest, {
      skipFiles: spec.skipFiles ?? [],
      overlayKeep: spec.overlay ?? [],
    });
    touched.push(spec.to);
  }
  await restoreOverlayBackups(overlayBackups);
  await ensureCommandNameFrontmatter();
  await patchMcpPackageJsonForCursor();
  for (const spec of COPY_FILES) {
    const src = path.join(upstreamDir, spec.from);
    if (!(await exists(src))) continue;
    await copyFile(src, path.join(pluginRoot, spec.to));
    touched.push(spec.to);
  }

  const manifest = {
    syncedAt: new Date().toISOString(),
    upstreamRepo: "burningportra/agent-flywheel-plugin",
    upstreamRef: ref,
    upstreamSha: sha,
    preserveFiles: PRESERVE_FILES,
    touched,
    cursorOverlays: [
      "hooks/hooks.json (Cursor v1 format)",
      ".cursor-plugin/plugin.json",
      "mcp.json (Cursor url + stdio)",
      "mcp-server/src/cursor-adapters.ts",
      "mcp-server/src/checkpoint-legacy.ts",
    ],
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`sync-agent-flywheel-upstream: OK → ${manifestPath}`);
  console.log(`  upstream ${ref} @ ${sha.slice(0, 12)}`);
  console.log(`  touched ${touched.length} paths`);
}

async function runCheck(ref) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    console.error("SYNC_MANIFEST.json missing — run sync without --check first");
    process.exit(1);
  }
  const cache = path.join(repoRoot, ".cache", "agent-flywheel-plugin");
  const sha = gitRevParse(cache, ref) ?? gitRevParse(cache, "HEAD");
  if (manifest.upstreamRef !== ref) {
    console.error(`Manifest ref ${manifest.upstreamRef} != expected ${ref}`);
    process.exit(1);
  }
  if (sha && manifest.upstreamSha && !manifest.upstreamSha.startsWith(sha.slice(0, 7)) && sha !== manifest.upstreamSha) {
    console.warn(`Note: manifest sha ${manifest.upstreamSha.slice(0, 12)} may differ from cache ${sha?.slice(0, 12)} — re-run sync to refresh`);
  }
  console.log("sync-agent-flywheel-upstream --check: OK");
}

async function main() {
  const { ref, upstreamDir, check } = parseArgs();
  if (check) {
    await runCheck(ref);
    return;
  }
  const { dir, sha } = await ensureUpstream(ref, upstreamDir);
  await runSync(dir, sha, ref);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
