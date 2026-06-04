import type { AuraApp, AuraDiagnostics, AuraSceneSnapshot } from "../agent-api/index.js";
export interface AuraRouteHealth {
    readonly status: "ready" | "error";
    readonly drawCalls: number;
    readonly diagnostics: AuraDiagnostics;
    readonly scene: AuraSceneSnapshot;
}
export declare function createAuraRouteHealth(app: AuraApp): AuraRouteHealth;
export declare function assertAuraRouteReady(health: AuraRouteHealth): void;
//# sourceMappingURL=routeHealth.d.ts.map