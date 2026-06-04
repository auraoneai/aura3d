export declare const CREATE_AURA3D_TEMPLATES: readonly ["product-viewer", "cinematic-scene", "mini-game"];
export type CreateA3DTemplate = (typeof CREATE_AURA3D_TEMPLATES)[number];
export interface CreateA3DProjectOptions {
    readonly targetDir: string;
    readonly template?: CreateA3DTemplate;
    readonly packageVersion?: string;
    readonly rootDir?: string;
}
export interface CreateA3DProjectResult {
    readonly targetDir: string;
    readonly template: CreateA3DTemplate;
    readonly files: readonly string[];
}
export declare function createA3DProject(options: CreateA3DProjectOptions): CreateA3DProjectResult;
export declare function writeCreateA3DReport(path: string, result: CreateA3DProjectResult): void;
//# sourceMappingURL=index.d.ts.map