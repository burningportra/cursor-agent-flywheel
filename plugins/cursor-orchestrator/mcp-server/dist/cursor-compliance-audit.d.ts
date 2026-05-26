/**
 * Cursor-native compliance audit — defer to Task instead of claude CLI spawn.
 */
/** When true, flywheel_compliance_audit returns a Task spec instead of spawning claude. */
export declare function useCursorComplianceBackend(): boolean;
export declare function resolveCursorComplianceModel(cwd: string): string;
export declare function buildComplianceAuditSkillPrompt(args: {
    beadIds: string[];
    threshold: number;
    parallelism: number;
}): string;
export declare function buildComplianceCoordinatorPlaybook(model: string): string;
/** Parse FW_COMPLIANCE_OVERRIDE / skipEnv — full skip or per-bead list. */
export declare function parseComplianceOverride(raw: string): {
    skipAll: boolean;
    beadIds: Set<string>;
};
//# sourceMappingURL=cursor-compliance-audit.d.ts.map