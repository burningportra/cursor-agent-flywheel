import { type ExecFn } from "./agent-mail.js";
export type AgentHealth = "active" | "idle" | "stuck";
export interface AgentStatus {
    worktreePath: string;
    stepIndex: number;
    health: AgentHealth;
    lastActivity: number;
    changedFiles: string[];
}
export interface TenderConfig {
    /** Polling interval in ms (default 60_000 = 60s) */
    pollInterval: number;
    /** Agent is "stuck" after this many ms without changes (default 300_000 = 5 min) */
    stuckThreshold: number;
    /** Agent is "idle" after this many ms without changes (default 120_000 = 2 min) */
    idleThreshold: number;
    /** Cadence check interval in ms (default 20 * 60 * 1000 = 20 min) */
    cadenceIntervalMs: number;
}
export interface ConflictAlert {
    file: string;
    worktrees: string[];
    stepIndices: number[];
}
export interface SwarmTenderOptions {
    config?: Partial<TenderConfig>;
    onStuck?: (agent: AgentStatus) => void;
    onConflict?: (conflict: ConflictAlert) => void;
    onTick?: (statuses: AgentStatus[]) => void;
    /** Called every cadenceIntervalMs with the operator cadence checklist. */
    onCadenceCheck?: (checklist: string) => void;
    /** Agent Mail orchestrator identity (for sending stuck-agent messages). */
    orchestratorAgentName?: string;
}
export declare class SwarmTender {
    private exec;
    private cwd;
    private agents;
    private config;
    private timer;
    private onStuck?;
    private onConflict?;
    private onTick?;
    private onCadenceCheck?;
    private lastCadencePromptAt;
    private orchestratorAgentName?;
    constructor(exec: ExecFn, cwd: string, worktrees: {
        path: string;
        stepIndex: number;
    }[], options?: SwarmTenderOptions);
    /** Start polling. */
    start(): void;
    /** Stop polling. */
    stop(): void;
    /** Get current status of all agents. */
    getStatus(): AgentStatus[];
    /** Get summary string for display. */
    getSummary(): string;
    /** Single poll cycle — check all worktrees. */
    private poll;
    /** Remove an agent from monitoring (e.g., step completed). */
    removeAgent(stepIndex: number): void;
    /**
     * Force-release stale file reservations from a stuck agent.
     * Uses Agent Mail's force_release_file_reservation to clear locks
     * so other agents can proceed.
     */
    releaseStaleReservations(stuckAgentName: string, reservationIds: number[], note?: string): Promise<void>;
    /**
     * Send a nudge message to a stuck agent via Agent Mail.
     * Prompts the agent to check in or report blockers.
     */
    nudgeStuckAgent(stuckAgentName: string, threadId: string): Promise<void>;
    /**
     * Get whois profile for an agent via Agent Mail.
     * Useful for diagnosing which agent is stuck and what it was doing.
     */
    inspectAgent(agentName: string): Promise<any>;
}
//# sourceMappingURL=tender.d.ts.map