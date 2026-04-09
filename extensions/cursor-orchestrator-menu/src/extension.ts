import * as path from "node:path";
import * as vscode from "vscode";
import { deleteCheckpoint, readCheckpoint } from "./checkpoint";
import { buildOrchestratePrompt, buildSetupPrompt, buildStatusPrompt } from "./prompts";

const OUT = "Cursor Orchestrator";

type MenuId =
  | "wizard"
  | "verify"
  | "gate"
  | "beads"
  | "book"
  | "setup"
  | "status"
  | "checkpoint";

interface MenuItem extends vscode.QuickPickItem {
  orchId: MenuId;
}

export function activate(context: vscode.ExtensionContext): void {
  const ch = vscode.window.createOutputChannel(OUT);

  const root = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  context.subscriptions.push(
    vscode.commands.registerCommand("cursorOrchestratorMenu.openMenu", () => openMainMenu(ch, root)),
    vscode.commands.registerCommand("cursorOrchestratorMenu.orchestrateWizard", () => orchestrateWizard(ch, root)),
    vscode.commands.registerCommand("cursorOrchestratorMenu.runVerify", () => runInTerminal(root, "Verify orchestrator", "node scripts/verify-cursor-orchestrator.mjs")),
    vscode.commands.registerCommand("cursorOrchestratorMenu.runPublishGate", () =>
      runInTerminal(root, "Publish gate", "node scripts/publish-gate.mjs"),
    ),
    vscode.commands.registerCommand("cursorOrchestratorMenu.showBeads", () => runInTerminal(root, "br list", "br list")),
    vscode.commands.registerCommand("cursorOrchestratorMenu.openPublishingDoc", () => openPublishingDoc(root)),
    ch,
  );
}

export function deactivate(): void {}

function requireRoot(root: () => string | undefined): string | undefined {
  const r = root();
  if (!r) {
    void vscode.window.showWarningMessage("Open a folder/workspace first.");
  }
  return r;
}

async function openMainMenu(ch: vscode.OutputChannel, root: () => string | undefined): Promise<void> {
  const r = requireRoot(root);
  if (!r) {
    return;
  }

  const picked = await vscode.window.showQuickPick<MenuItem>(
    [
      {
        label: "$(rocket) Orchestrate wizard…",
        description: "Step-by-step: goal, plan type, copy prompt to Agent",
        detail: "Best match for Plan-mode-style guidance without typing long prompts",
        orchId: "wizard",
      },
      {
        label: "$(terminal) Run: verify-cursor-orchestrator.mjs",
        description: "Plugin + .cursor/commands parity + validate-template",
        orchId: "verify",
      },
      {
        label: "$(terminal) Run: publish-gate.mjs",
        description: "validate-template + verify (add --with-mcp in terminal if needed)",
        orchId: "gate",
      },
      {
        label: "$(list-tree) List beads (br list)",
        description: "Opens a terminal in the repo root",
        orchId: "beads",
      },
      {
        label: "$(book) Open publishing runbook",
        description: "docs/publishing/marketplace.md",
        orchId: "book",
      },
      {
        label: "$(clippy) Copy prompt: orchestrate-setup",
        description: "Paste into Agent",
        orchId: "setup",
      },
      {
        label: "$(pulse) Copy prompt: orchestrate-status",
        description: "Paste into Agent",
        orchId: "status",
      },
      {
        label: "$(info) Show checkpoint summary",
        description: "Reads .pi-orchestrator/checkpoint.json",
        orchId: "checkpoint",
      },
    ],
    {
      title: "Cursor Orchestrator",
      placeHolder: "Choose an action",
      matchOnDescription: true,
      matchOnDetail: true,
    },
  );

  if (!picked) {
    return;
  }

  switch (picked.orchId) {
    case "wizard":
      await orchestrateWizard(ch, root);
      break;
    case "verify":
      vscode.commands.executeCommand("cursorOrchestratorMenu.runVerify");
      break;
    case "gate":
      vscode.commands.executeCommand("cursorOrchestratorMenu.runPublishGate");
      break;
    case "beads":
      vscode.commands.executeCommand("cursorOrchestratorMenu.showBeads");
      break;
    case "book":
      vscode.commands.executeCommand("cursorOrchestratorMenu.openPublishingDoc");
      break;
    case "setup":
      await copyPrompt(buildSetupPrompt(r), "orchestrate-setup prompt");
      break;
    case "status":
      await copyPrompt(buildStatusPrompt(r), "orchestrate-status prompt");
      break;
    case "checkpoint": {
      const cp = readCheckpoint(r);
      ch.clear();
      ch.appendLine(JSON.stringify(cp, null, 2));
      ch.show(true);
      if (cp.exists) {
        void vscode.window.showInformationMessage(
          `Checkpoint: phase=${cp.phase ?? "?"}${cp.goal ? ` — ${cp.goal.slice(0, 80)}…` : ""}`,
        );
      } else {
        void vscode.window.showInformationMessage("No checkpoint file found.");
      }
      break;
    }
    default:
      break;
  }
}

async function orchestrateWizard(ch: vscode.OutputChannel, root: () => string | undefined): Promise<void> {
  const r = requireRoot(root);
  if (!r) {
    return;
  }

  const cp = readCheckpoint(r);

  const sessionPick = await vscode.window.showQuickPick<
    vscode.QuickPickItem & { fresh?: boolean }
  >(
    [
      {
        label: "$(sync~spin) Resume or continue",
        description: cp.exists ? `Current phase: ${cp.phase ?? "unknown"}` : "No checkpoint on disk — will start fresh",
        fresh: false,
      },
      {
        label: "$(trash) Start fresh",
        description: "Delete .pi-orchestrator/checkpoint.json (if present)",
        fresh: true,
      },
    ],
    { title: "Orchestrator — session", placeHolder: "Resume or start fresh?" },
  );
  if (!sessionPick) {
    return;
  }

  let freshSession = false;
  if ("fresh" in sessionPick && sessionPick.fresh === true) {
    const ok = await vscode.window.showWarningMessage(
      "Delete orchestrator checkpoint and start fresh?",
      { modal: true },
      "Delete checkpoint",
      "Cancel",
    );
    if (ok !== "Delete checkpoint") {
      return;
    }
    const removed = deleteCheckpoint(r);
    freshSession = true;
    void vscode.window.showInformationMessage(removed ? "Checkpoint deleted." : "No checkpoint file to delete (starting fresh).");
  }

  const goal = await vscode.window.showInputBox({
    title: "Goal (optional)",
    prompt: "Leave empty to let the agent discover goals after orch_profile.",
    placeHolder: "e.g. Harden CI for slash commands",
  });

  type PlanItem = vscode.QuickPickItem & { mode: "standard" | "deep" | "unspecified" };
  const planPick = await vscode.window.showQuickPick<PlanItem>(
    [
      {
        label: "$(list-flat) Standard plan",
        description: "Single planning pass — faster",
        mode: "standard",
      },
      {
        label: "$(group-by-ref-type) Deep plan",
        description: "Three perspectives + synthesis — slower, richer",
        mode: "deep",
      },
      {
        label: "$(wand) Let Agent decide",
        description: "Agent picks standard vs deep from context",
        mode: "unspecified",
      },
    ],
    { title: "Planning mode", placeHolder: "How should we plan?" },
  );
  if (!planPick) {
    return;
  }

  const mode = planPick.mode;

  const prompt = buildOrchestratePrompt(r, {
    goal: goal ?? undefined,
    planningMode: mode,
    freshSession,
  });

  ch.clear();
  ch.appendLine(prompt);
  ch.show(true);

  await copyPrompt(prompt, "Orchestrate");

  void vscode.window.showInformationMessage(
    "Tip: Press Shift+Tab in Agent input for Cursor Plan mode before pasting, if you want a structured plan first.",
    "OK",
  );
}

async function copyPrompt(body: string, label: string): Promise<void> {
  await vscode.env.clipboard.writeText(body);
  const cfg = vscode.workspace.getConfiguration("cursorOrchestratorMenu");
  const cmd = cfg.get<string>("agentChatCommand")?.trim();

  const actions = ["OK"];
  if (cmd) {
    actions.unshift("Open Agent (settings command)");
  }

  const choice = await vscode.window.showInformationMessage(
    `${label}: prompt copied. Paste into Cursor Agent (⌘L / Ctrl+L on Mac / Win).`,
    { modal: false, detail: cmd ? `Optional command: ${cmd}` : "Set cursorOrchestratorMenu.agentChatCommand to auto-open chat." },
    ...actions,
  );

  if (choice === "Open Agent (settings command)" && cmd) {
    try {
      await vscode.commands.executeCommand(cmd);
    } catch {
      void vscode.window.showWarningMessage(`Command failed: ${cmd}. Check cursorOrchestratorMenu.agentChatCommand in Settings.`);
    }
  }
}

function runInTerminal(root: () => string | undefined, name: string, command: string): void {
  const r = requireRoot(root);
  if (!r) {
    return;
  }
  const t = vscode.window.createTerminal({ name, cwd: r, env: process.env });
  t.show();
  t.sendText(command);
}

async function openPublishingDoc(root: () => string | undefined): Promise<void> {
  const r = requireRoot(root);
  if (!r) {
    return;
  }
  const p = path.join(r, "docs", "publishing", "marketplace.md");
  const u = vscode.Uri.file(p);
  try {
    const doc = await vscode.workspace.openTextDocument(u);
    await vscode.window.showTextDocument(doc);
  } catch {
    void vscode.window.showErrorMessage(`Could not open ${p}`);
  }
}
