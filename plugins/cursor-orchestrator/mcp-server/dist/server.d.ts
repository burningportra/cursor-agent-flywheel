import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { makeExec } from './exec.js';
import { clearState, loadState, saveState } from './state.js';
import type { McpToolResult, FlywheelToolName, ToolContext } from './types.js';
export declare const WaveReviewGateArgsSchema: z.ZodObject<{
    cwd: z.ZodString;
    beadIds: z.ZodArray<z.ZodString>;
    confirmAction: z.ZodOptional<z.ZodEnum<{
        "looks-good-all": "looks-good-all";
        "self-review": "self-review";
        "fresh-eyes": "fresh-eyes";
        "duel-review": "duel-review";
    }>>;
    reviewBeadId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const WrapUpGateArgsSchema: z.ZodObject<{
    cwd: z.ZodString;
    confirmWrapUp: z.ZodOptional<z.ZodEnum<{
        skip: "skip";
        full: "full";
        commit_only: "commit_only";
    }>>;
    force: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
type ToolRunner = (ctx: ToolContext, args: any) => Promise<McpToolResult>;
type ToolRunnerMap = Partial<Record<FlywheelToolName, ToolRunner>>;
interface ToolValidationError {
    message: string;
    field?: string;
    reason: 'missing_required_parameter' | 'invalid_cwd' | 'invalid_enum_value' | 'invalid_type';
}
interface CallToolHandlerDependencies {
    makeExec: typeof makeExec;
    loadState: typeof loadState;
    saveState: typeof saveState;
    clearState: typeof clearState;
    runners?: ToolRunnerMap;
}
export declare const TOOLS: ({
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            goal: {
                type: string;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            ideas: {
                type: string;
                description: string;
                minItems: number;
                maxItems: number;
                items: {
                    type: string;
                    properties: {
                        id: {
                            type: string;
                            description: string;
                        };
                        title: {
                            type: string;
                            description: string;
                        };
                        description: {
                            type: string;
                            description: string;
                        };
                        category: {
                            type: string;
                            enum: string[];
                        };
                        effort: {
                            type: string;
                            enum: string[];
                        };
                        impact: {
                            type: string;
                            enum: string[];
                        };
                        rationale: {
                            type: string;
                            description: string;
                        };
                        tier: {
                            type: string;
                            enum: string[];
                        };
                        sourceEvidence: {
                            type: string;
                            items: {
                                type: string;
                            };
                        };
                        scores: {
                            type: string;
                            properties: {
                                useful: {
                                    type: string;
                                };
                                pragmatic: {
                                    type: string;
                                };
                                accretive: {
                                    type: string;
                                };
                                robust: {
                                    type: string;
                                };
                                ergonomic: {
                                    type: string;
                                };
                            };
                        };
                        risks: {
                            type: string;
                            items: {
                                type: string;
                            };
                        };
                        synergies: {
                            type: string;
                            items: {
                                type: string;
                            };
                        };
                    };
                    required: string[];
                };
            };
            goal?: undefined;
            force?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            goal: {
                type: string;
                description: string;
            };
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            mode: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            planFile: {
                type: string;
                description: string;
            };
            planContent: {
                type: string;
                description: string;
            };
            source: {
                type: string;
                enum: string[];
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
                description: string;
                default?: undefined;
            };
            advancedAction: {
                type: string;
                enum: string[];
                description: string;
            };
            remediation: {
                type: string;
                description: string;
                properties: {
                    planSlug: {
                        type: string;
                        description: string;
                    };
                    iteration: {
                        type: string;
                        description: string;
                    };
                    criterionId: {
                        type: string;
                        description: string;
                    };
                    criterionDescription: {
                        type: string;
                        description: string;
                    };
                    status: {
                        type: string;
                        enum: string[];
                        description: string;
                    };
                    evidence: {
                        type: string;
                        description: string;
                    };
                    gaps: {
                        type: string;
                        items: {
                            type: string;
                        };
                        description: string;
                    };
                };
                required: string[];
            };
            until_convergence_score: {
                type: string;
                minimum: number;
                maximum: number;
                description: string;
            };
            max_rounds: {
                type: string;
                minimum: number;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            beadId: {
                type: string;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
                description: string;
                default?: undefined;
            };
            mode: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            parallelSafe: {
                type: string;
                default: boolean;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            beadIds: {
                type: string;
                description: string;
                minItems: number;
                items: {
                    type: string;
                };
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            beadIds: {
                type: string;
                description: string;
                items: {
                    type: string;
                };
                minItems?: undefined;
            };
            mode: {
                type: string;
                enum: string[];
                description: string;
                default?: undefined;
            };
            threshold: {
                type: string;
                description: string;
            };
            parallelism: {
                type: string;
                description: string;
            };
            skipEnv: {
                type: string;
                description: string;
            };
            afterTask: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            closedBeadIds: {
                type: string;
                description: string;
                minItems: number;
                items: {
                    type: string;
                };
            };
            maxNextWave: {
                type: string;
                description: string;
            };
            confirmImplModels: {
                description: string;
            };
            skipImplModelsGate: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            beadIds: {
                type: string;
                items: {
                    type: string;
                };
                minItems: number;
                description: string;
            };
            confirmAction: {
                type: string;
                enum: string[];
                description: string;
            };
            reviewBeadId: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            confirmWrapUp: {
                type: string;
                enum: string[];
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            goal?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            step: {
                type: string;
                enum: string[];
                description: string;
            };
            coveredSections: {
                type: string;
                description: string;
            };
            totalSections: {
                type: string;
                description: string;
            };
            missingSections: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            overlapPairs: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            mode: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            focus: {
                type: string;
                description: string;
            };
            top: {
                type: string;
                description: string;
            };
            output: {
                type: string;
                description: string;
            };
            confirmDuelModels: {
                description: string;
            };
            skipDuelModelsGate: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            confirmImplModels: {
                description: string;
            };
            commitBatchThreshold: {
                type: string;
                minimum: number;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            query: {
                type: string;
                description: string;
            };
            operation: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            content: {
                type: string;
                description: string;
            };
            entryId: {
                type: string;
                description: string;
            };
            refreshRoot: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            includeBodyInText: {
                type: string;
                description: string;
            };
            name: {
                type: string;
                description: string;
                pattern: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            sinceDays: {
                type: string;
                description: string;
                minimum: number;
                maximum: number;
                default: number;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            closedBeadIds: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
                minItems?: undefined;
            };
            coordinatorAgent: {
                type: string;
                description: string;
            };
            commitBatchThreshold: {
                type: string;
                minimum: number;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            variant: {
                type: string;
                enum: string[];
                description: string;
            };
            recentPlanPaths: {
                type: string;
                items: {
                    type: string;
                };
                description: string;
            };
            isFirstRun: {
                type: string;
            };
            goal: {
                type: string;
                description?: undefined;
            };
            phase: {
                type: string;
            };
            openBeadCount: {
                type: string;
            };
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            checkName: {
                type: string;
                enum: string[];
                description: string;
            };
            autoConfirm: {
                type: string;
                default: boolean;
                description: string;
            };
            mode: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            planSlug: {
                type: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            planSlug: {
                type: string;
                description: string;
            };
            planPath: {
                type: string;
                description: string;
            };
            action: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            editIntent: {
                type: string;
                description: string;
                properties: {
                    kind: {
                        type: string;
                        enum: string[];
                    };
                    text: {
                        type: string;
                        description: string;
                    };
                };
                required: string[];
            };
            force: {
                type: string;
                description: string;
            };
            goal?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            graderStdout?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            planSlug: {
                type: string;
                description: string;
            };
            force: {
                type: string;
                description: string;
            };
            graderStdout: {
                type: string;
                description: string;
            };
            goal?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            section?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: {
            cwd: {
                type: string;
                description: string;
            };
            section: {
                type: string;
                enum: string[];
                default: string;
                description: string;
            };
            goal?: undefined;
            force?: undefined;
            ideas?: undefined;
            mode?: undefined;
            planFile?: undefined;
            planContent?: undefined;
            source?: undefined;
            action?: undefined;
            advancedAction?: undefined;
            remediation?: undefined;
            until_convergence_score?: undefined;
            max_rounds?: undefined;
            beadId?: undefined;
            parallelSafe?: undefined;
            beadIds?: undefined;
            threshold?: undefined;
            parallelism?: undefined;
            skipEnv?: undefined;
            afterTask?: undefined;
            closedBeadIds?: undefined;
            maxNextWave?: undefined;
            confirmImplModels?: undefined;
            skipImplModelsGate?: undefined;
            confirmAction?: undefined;
            reviewBeadId?: undefined;
            confirmWrapUp?: undefined;
            step?: undefined;
            coveredSections?: undefined;
            totalSections?: undefined;
            missingSections?: undefined;
            overlapPairs?: undefined;
            focus?: undefined;
            top?: undefined;
            output?: undefined;
            confirmDuelModels?: undefined;
            skipDuelModelsGate?: undefined;
            commitBatchThreshold?: undefined;
            query?: undefined;
            operation?: undefined;
            content?: undefined;
            entryId?: undefined;
            refreshRoot?: undefined;
            includeBodyInText?: undefined;
            name?: undefined;
            sinceDays?: undefined;
            coordinatorAgent?: undefined;
            variant?: undefined;
            recentPlanPaths?: undefined;
            isFirstRun?: undefined;
            phase?: undefined;
            openBeadCount?: undefined;
            checkName?: undefined;
            autoConfirm?: undefined;
            planSlug?: undefined;
            planPath?: undefined;
            editIntent?: undefined;
            graderStdout?: undefined;
        };
        required: string[];
    };
})[];
export declare function validateToolArgs(toolName: string, args: Record<string, unknown>): ToolValidationError | null;
export declare function emitOrchDeprecationWarning(toolName: string): boolean;
/** Test-only — reset the once-per-tool warning ledger. */
export declare function _resetOrchDeprecationLedger(): void;
export declare function createCallToolHandler(dependencies: CallToolHandlerDependencies): (request: {
    params: {
        name: string;
        arguments?: Record<string, unknown>;
    };
}) => Promise<McpToolResult>;
export declare function createServer(): Server;
export declare const server: Server<{
    method: string;
    params?: {
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
            progressToken?: string | number | undefined;
            "io.modelcontextprotocol/related-task"?: {
                taskId: string;
            } | undefined;
        } | undefined;
    } | undefined;
}, {
    method: string;
    params?: {
        [x: string]: unknown;
        _meta?: {
            [x: string]: unknown;
            progressToken?: string | number | undefined;
            "io.modelcontextprotocol/related-task"?: {
                taskId: string;
            } | undefined;
        } | undefined;
    } | undefined;
}, {
    [x: string]: unknown;
    _meta?: {
        [x: string]: unknown;
        progressToken?: string | number | undefined;
        "io.modelcontextprotocol/related-task"?: {
            taskId: string;
        } | undefined;
    } | undefined;
}>;
export {};
//# sourceMappingURL=server.d.ts.map