declare global {
  interface Window {
    __AURA3D_SHOWCASE_INDEX__?: {
      readonly status: "ready";
      readonly appCount: number;
      readonly gameCount: number;
      readonly routes: readonly string[];
      readonly remediation: {
        readonly schema: "aura3d-showcase-route-health-index/1.0";
        readonly generatedAt: string;
        readonly launchReady: false;
        readonly routeHealthRequired: true;
        readonly apps: readonly ShowcaseIndexEntry[];
      };
    };
  }
}

type ShowcaseClassification =
  | "candidate"
  | "diagnostic-candidate"
  | "internal-diagnostic"
  | "prototype-blocked"
  | "prototype"
  | "rebuild-required"
  | "blocked";

interface ShowcaseIndexEntry {
  readonly id: string;
  readonly route: string;
  readonly routeHealth: string;
  readonly classification: ShowcaseClassification;
  readonly publicShowcase: boolean;
  readonly primaryAssetStatus:
    | "typed-primary-assets"
    | "typed-supporting-assets"
    | "release-validated-typed-primary-assets"
    | "compiler-selected-primary-asset"
    | "compiler-selected-diagnostic-anchor"
    | "primitive-only";
  readonly primitiveStatus: "within-stated-role" | "heavy-set-dressing" | "primary-subject-proxy" | "blocked-primitive-primary";
  readonly claimStatus: "bounded" | "demoted" | "blocked";
  readonly notes: string;
}

const apps = [
  {
    id: "showcase-product-configurator",
    route: "/apps/showcase-product-configurator/",
    routeHealth: "/apps/showcase-product-configurator/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Typed headphones pass retained route-primary and release/deploy asset evidence; procedural exploded pieces remain bounded staging, not authored internals."
  },
  {
    id: "showcase-material-asset-inspector",
    route: "/apps/showcase-material-asset-inspector/",
    routeHealth: "/apps/showcase-material-asset-inspector/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Typed headphones pass retained route-primary and release/deploy asset evidence; material panels remain bounded metadata inspection, not PBR parity."
  },
  {
    id: "showcase-data-galaxy",
    route: "/apps/showcase-data-galaxy/",
    routeHealth: "/apps/showcase-data-galaxy/route-health.json",
    classification: "internal-diagnostic",
    publicShowcase: false,
    primaryAssetStatus: "compiler-selected-diagnostic-anchor",
    primitiveStatus: "heavy-set-dressing",
    claimStatus: "demoted",
    notes: "Compiler-selected ParticleCore anchor replaces rejected DataStation; deploy passes, but route-primary still fails as too small and low-readability, so this remains internal diagnostic."
  },
  {
    id: "showcase-smart-city-control",
    route: "/apps/showcase-smart-city-control/",
    routeHealth: "/apps/showcase-smart-city-control/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "heavy-set-dressing",
    claimStatus: "bounded",
    notes: "Typed command vehicle passes retained route-primary and release/deploy asset evidence; procedural city, telemetry, and controls remain bounded supporting context."
  },
  {
    id: "showcase-cinematic-architecture",
    route: "/apps/showcase-cinematic-architecture/",
    routeHealth: "/apps/showcase-cinematic-architecture/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "removed-from-primary-composition",
    claimStatus: "bounded",
    notes: "SkylineCity replaced rejected TeaHouse and VoxelBuilding; the route now frames the typed architectural district without clipping, passes retained route-primary and deploy evidence, and keeps postprocess, HDR, and architectural-photography claims out of scope."
  },
  {
    id: "showcase-digital-twin-ops",
    route: "/apps/showcase-digital-twin-ops/",
    routeHealth: "/apps/showcase-digital-twin-ops/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "supporting-workcell-set-dressing",
    claimStatus: "bounded",
    notes: "Compiler-selected OrangeIndustrialRobot replaces rejected AssemblyLine and is staged in a restrained workcell with live route-primary plus deploy evidence; telemetry remains deterministic sample state, not real facility integration."
  },
  {
    id: "showcase-webgpu-particle-lab",
    route: "/apps/showcase-webgpu-particle-lab/",
    routeHealth: "/apps/showcase-webgpu-particle-lab/route-health.json",
    classification: "internal-diagnostic",
    publicShowcase: false,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "demoted",
    notes: "Deploy passes for ParticleCore, but route-primary remains clipped and native WebGPU adapter, compute dispatch, backend, and pixel proof are absent; treat as internal Aura particle diagnostic."
  },
  {
    id: "showcase-blockfall-reactor",
    route: "/apps/showcase-blockfall-reactor/",
    routeHealth: "/apps/showcase-blockfall-reactor/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Bounded falling-block candidate with passing route-primary, deploy/release, and gameplay proof."
  },
  {
    id: "showcase-skyline-runner",
    route: "/apps/showcase-skyline-runner/",
    routeHealth: "/apps/showcase-skyline-runner/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "blocked",
    notes: "Removed from public examples by the game stop decision. Current assets and engine APIs do not prove public-quality character/world binding, grounded contact, scale, or platformer framing; keep direct route access as a prototype diagnostic only."
  },
  {
    id: "showcase-turbo-drift-circuit",
    route: "/apps/showcase-turbo-drift-circuit/",
    routeHealth: "/apps/showcase-turbo-drift-circuit/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "blocked",
    notes: "Removed from public examples by the game stop decision. Current assets and engine APIs do not prove public-quality car-to-road binding, racing composition bounds, or camera/track framing; keep direct route access as a prototype diagnostic only."
  }
] as const;

const publicApps = apps.filter((entry) => entry.publicShowcase);
const routes = publicApps.map((entry) => entry.route);

window.__AURA3D_SHOWCASE_INDEX__ = {
  status: "ready",
  appCount: publicApps.length,
  gameCount: publicApps.filter((entry) => entry.id === "showcase-blockfall-reactor").length,
  routes,
  remediation: {
    schema: "aura3d-showcase-route-health-index/1.0",
    generatedAt: "2026-06-21",
    launchReady: false,
    routeHealthRequired: true,
    apps
  }
};

document.documentElement.dataset.showcaseIndexReady = "true";
