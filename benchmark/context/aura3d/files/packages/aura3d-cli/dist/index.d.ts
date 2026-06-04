export type AuraCliAssetType = "model" | "texture" | "environment" | "audio";
export interface AuraCliAssetManifest {
    readonly schema: "aura3d.assets/1.0";
    readonly assetBasePath: string;
    readonly outputDir: string;
    readonly typegen: string;
    readonly assets: readonly AuraCliAssetEntry[];
}
export interface AuraCliAssetEntry {
    readonly id: string;
    readonly type: AuraCliAssetType;
    readonly format: string;
    readonly source: string;
    readonly outputPath: string;
    readonly url: string;
    readonly hash: string;
    readonly sizeBytes: number;
    readonly bounds?: readonly [number, number, number];
    readonly materials: readonly string[];
    readonly animations: readonly string[];
    readonly textures: readonly string[];
    readonly dependencies?: readonly string[];
    readonly thumbnailUrl?: string;
    readonly warnings: readonly string[];
}
export interface AddAssetOptions {
    readonly projectDir?: string;
    readonly file: string;
    readonly name: string;
    readonly type?: AuraCliAssetType;
    readonly publicPath?: string;
    readonly outputDir?: string;
    readonly typegen?: string;
    readonly copy?: boolean;
}
export interface AssetCliResult {
    readonly ok: boolean;
    readonly manifestPath: string;
    readonly manifest: AuraCliAssetManifest;
    readonly messages: readonly string[];
}
export interface AssetValidationResult extends AssetCliResult {
    readonly failures: readonly string[];
    readonly warnings: readonly string[];
}
export declare const DEFAULT_AURA_ASSET_MANIFEST = "aura.assets.json";
export declare const DEFAULT_AURA_ASSET_OUTPUT_DIR = "public/aura-assets";
export declare const DEFAULT_AURA_ASSET_PUBLIC_PATH = "/aura-assets/";
export declare const DEFAULT_AURA_ASSET_TYPEGEN = "src/aura-assets.ts";
export declare function addAsset(options: AddAssetOptions): AssetCliResult;
export declare function scanAssets(options: {
    readonly projectDir?: string;
    readonly directory: string;
}): AssetCliResult;
export declare function validateAssets(options?: {
    readonly projectDir?: string;
}): AssetValidationResult;
export declare function writeTypedAssets(projectDir: string, manifest?: AuraCliAssetManifest): string;
export declare function listAssets(options?: {
    readonly projectDir?: string;
}): readonly AuraCliAssetEntry[];
export declare function createAssetThumbnails(options?: {
    readonly projectDir?: string;
}): AssetCliResult;
export declare function doctor(options?: {
    readonly projectDir?: string;
}): AssetValidationResult;
export declare function checkDeploy(options?: {
    readonly projectDir?: string;
    readonly distDir?: string;
}): AssetValidationResult;
export declare function initAgentFiles(options: {
    readonly projectDir?: string;
    readonly agent: "claude" | "cursor" | "copilot" | "generic" | "all";
}): readonly string[];
export declare function readAssetManifest(projectDir: string): AuraCliAssetManifest;
export declare function writeAssetManifest(projectDir: string, manifest: AuraCliAssetManifest): void;
//# sourceMappingURL=index.d.ts.map