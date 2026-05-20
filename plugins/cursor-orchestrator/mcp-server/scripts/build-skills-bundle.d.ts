#!/usr/bin/env node
interface Frontmatter {
    name?: string;
    description?: string;
    [k: string]: unknown;
}
export interface SkillBundleEntry {
    name: string;
    path: string;
    frontmatter: Frontmatter;
    body: string;
    srcSha256: string;
    sizeBytes: number;
    bundledAt: string;
}
export interface SkillsBundle {
    bundleVersion: 1;
    generatedAt: string;
    generator: string;
    manifestSha256: string;
    entries: SkillBundleEntry[];
}
type BundleProfile = "full" | "cursor-native" | "cursor";
export interface BuildResult {
    bundle: SkillsBundle;
    outputPath: string;
    totalBytes: number;
}
export declare function build(opts: {
    sourceRoot: string;
    outputPath: string;
    maxTotal: number;
    maxEntry: number;
    profile?: BundleProfile;
}): Promise<BuildResult>;
export declare function main(argv: string[]): Promise<number>;
export {};
//# sourceMappingURL=build-skills-bundle.d.ts.map