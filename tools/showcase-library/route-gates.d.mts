/** Public contracts for the checked route registry in route-gates.mjs. */
export type ShowcaseReleaseClass = "release-ready candidate" | "internal-diagnostic" | "game-layer-diagnostic" | "prototype-blocked" | "index-route" | "removed-from-public-showcase";
export interface ShowcaseRouteGate {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly globalName: string;
  readonly published: boolean;
  readonly releaseClass: ShowcaseReleaseClass;
  readonly primaryAssets: readonly string[];
  readonly primaryAssetRoles?: Readonly<Record<string, string>>;
  readonly routePrimaryHeroAsset?: string;
  readonly secondaryPrimaryAssets?: readonly string[];
  readonly primitiveBudget: number;
  readonly requiresTypedPrimaryAssets: boolean;
  readonly requiresRoutePrimaryProbe?: boolean;
  readonly requiresKeyboardDelta?: boolean;
  readonly requiresAuraParticles?: boolean;
  readonly nativeWebGpuAllowed?: boolean;
  readonly retainedEvidenceFrozen?: boolean;
  readonly requiresAnimationSubjectDelta?: boolean;
  readonly animationSubjectDelta?: {
    readonly relativeCrop: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly minChangedRatio: number;
    readonly minStrongChangedRatio: number;
    readonly minMeanChannelDelta: number;
  };
  readonly gameTemplateStatus?: {
    readonly category: string;
    readonly publicTemplateReady: boolean;
    readonly blocker?: string;
    readonly requiredBeforePublic?: readonly string[];
    readonly evidence?: readonly string[];
  };
}
export interface ShowcaseRouteGateConfig {
  readonly schema: "aura3d-showcase-route-gates/1.0";
  readonly routes: readonly ShowcaseRouteGate[];
}
export const defaultRepoRoot: string;
export const routeGateConfigRelativePath: "tools/showcase-library/route-gates.json";
export function getShowcaseRouteGateConfigPath(root?: string): string;
export function readShowcaseRouteGateConfig(root?: string): ShowcaseRouteGateConfig;
export function listShowcaseRouteGates(root?: string, options?: { readonly publishedOnly?: boolean }): ShowcaseRouteGate[];
export function showcaseRouteGateHash(root?: string): string;
export function showcaseRouteById(id: string, root?: string): ShowcaseRouteGate;
