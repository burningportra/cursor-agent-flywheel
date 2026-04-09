import * as path from "node:path";
import * as vscode from "vscode";
import { listBeads, type BeadRow } from "../beads";
import { readCheckpoint } from "../checkpoint";

/** Internal tree node (not a vscode.TreeItem — we map in getTreeItem). */
export type OrchTreeNode = {
  key: string;
  label: string;
  description?: string;
  tooltip?: string;
  iconId?: string;
  collapsible?: vscode.TreeItemCollapsibleState;
  command?: string;
  commandArgs?: unknown[];
};

export class OrchestratorSidebar implements vscode.TreeDataProvider<OrchTreeNode> {
  private _onDidChange = new vscode.EventEmitter<OrchTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly getRoot: () => string | undefined) {}

  refresh(): void {
    this._onDidChange.fire();
  }

  getTreeItem(element: OrchTreeNode): vscode.TreeItem {
    const item = new vscode.TreeItem(
      element.label,
      element.collapsible ?? vscode.TreeItemCollapsibleState.None,
    );
    item.description = element.description;
    item.tooltip = element.tooltip;
    if (element.iconId) {
      item.iconPath = new vscode.ThemeIcon(element.iconId);
    }
    if (element.command) {
      item.command = {
        command: element.command,
        title: element.label,
        arguments: element.commandArgs ?? [],
      };
    }
    item.id = element.key;
    return item;
  }

  async getChildren(element?: OrchTreeNode): Promise<OrchTreeNode[]> {
    const root = this.getRoot();
    if (!root) {
      return [
        {
          key: "no-workspace",
          label: "Open a folder to use Orchestrator",
          iconId: "info",
        },
      ];
    }

    if (!element) {
      return [
        {
          key: "session",
          label: "Session",
          tooltip: ".pi-orchestrator/checkpoint.json",
          iconId: "dashboard",
          collapsible: vscode.TreeItemCollapsibleState.Expanded,
        },
        {
          key: "beads",
          label: "Beads",
          tooltip: "br list --json",
          iconId: "list-ordered",
          collapsible: vscode.TreeItemCollapsibleState.Expanded,
        },
        {
          key: "wizards",
          label: "Wizards & scripts",
          iconId: "wand",
          collapsible: vscode.TreeItemCollapsibleState.Expanded,
        },
        {
          key: "docs",
          label: "Docs",
          iconId: "book",
          collapsible: vscode.TreeItemCollapsibleState.Collapsed,
        },
      ];
    }

    switch (element.key) {
      case "session":
        return this.sessionNodes(root);
      case "beads":
        return this.beadNodes(root);
      case "wizards":
        return this.wizardNodes();
      case "docs":
        return this.docNodes(root);
      default:
        return [];
    }
  }

  private sessionNodes(root: string): OrchTreeNode[] {
    const cp = readCheckpoint(root);
    if (!cp.exists) {
      return [
        {
          key: "sess-none",
          label: "No checkpoint",
          description: "Run Orchestrate wizard to start",
          iconId: "circle-slash",
        },
      ];
    }
    const nodes: OrchTreeNode[] = [
      {
        key: "sess-phase",
        label: `Phase: ${cp.phase ?? "?"}`,
        iconId: "debug-alt",
      },
    ];
    if (cp.goal) {
      nodes.push({
        key: "sess-goal",
        label: "Goal",
        description: cp.goal.length > 60 ? `${cp.goal.slice(0, 57)}…` : cp.goal,
        tooltip: cp.goal,
        iconId: "target",
      });
    }
    if (cp.planDocument) {
      nodes.push({
        key: "sess-plan",
        label: "Plan file",
        description: cp.planDocument,
        iconId: "file",
      });
    }
    if (cp.writtenAt) {
      nodes.push({
        key: "sess-time",
        label: "Checkpoint updated",
        description: cp.writtenAt,
        iconId: "clock",
      });
    }
    return nodes;
  }

  private beadNodes(root: string): OrchTreeNode[] {
    const rows = listBeads(root);
    if (rows.length === 0) {
      return [
        {
          key: "beads-empty",
          label: "No beads (or br CLI unavailable)",
          description: "Run br init in repo root if using beads",
          iconId: "info",
        },
      ];
    }
    return rows.map((b) => this.beadToNode(b));
  }

  private beadToNode(b: BeadRow): OrchTreeNode {
    const statusIcon =
      b.status === "closed"
        ? "verified"
        : b.status === "in_progress"
          ? "sync~spin"
          : "circle-large-outline";
    return {
      key: `bead:${b.id}`,
      label: b.title,
      description: `${b.id} · ${b.status}`,
      tooltip: `${b.id}\n${b.title}\n${b.status}`,
      iconId: statusIcon,
    };
  }

  private wizardNodes(): OrchTreeNode[] {
    return [
      {
        key: "wiz-orch",
        label: "Orchestrate wizard…",
        description: "Session → goal → plan → copy prompt",
        iconId: "rocket",
        command: "cursorOrchestratorMenu.orchestrateWizard",
      },
      {
        key: "wiz-menu",
        label: "Full command menu…",
        description: "All quick actions",
        iconId: "list-flat",
        command: "cursorOrchestratorMenu.openMenu",
      },
      {
        key: "wiz-verify",
        label: "Run verify script",
        description: "verify-cursor-orchestrator.mjs",
        iconId: "beaker",
        command: "cursorOrchestratorMenu.runVerify",
      },
      {
        key: "wiz-gate",
        label: "Run publish gate",
        description: "publish-gate.mjs",
        iconId: "shield",
        command: "cursorOrchestratorMenu.runPublishGate",
      },
      {
        key: "wiz-br",
        label: "br list in terminal",
        iconId: "terminal",
        command: "cursorOrchestratorMenu.showBeads",
      },
    ];
  }

  private docNodes(root: string): OrchTreeNode[] {
    return [
      {
        key: "doc-pub",
        label: "Publishing runbook",
        description: "docs/publishing/marketplace.md",
        iconId: "markdown",
        command: "cursorOrchestratorMenu.openPublishingDoc",
      },
      {
        key: "doc-add",
        label: "Add a plugin",
        description: "docs/add-a-plugin.md",
        iconId: "add",
        command: "cursorOrchestratorMenu.openDoc",
        commandArgs: [path.join(root, "docs", "add-a-plugin.md")],
      },
    ];
  }
}
