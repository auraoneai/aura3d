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
  | "game-layer-diagnostic"
  | "removed-from-public-showcase"
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
    classification: "removed-from-public-showcase",
    publicShowcase: false,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Retained typed-asset inspection tool. It is accessible but no longer promoted because Product Configurator already uses the same headphone hero."
  },
  {
    id: "showcase-smart-city-control",
    route: "/apps/showcase-smart-city-control/",
    routeHealth: "/apps/showcase-smart-city-control/route-health.json",
    classification: "removed-from-public-showcase",
    publicShowcase: false,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "heavy-set-dressing",
    claimStatus: "bounded",
    notes: "Retained command vehicle route; trimmed from promoted gallery in favor of Cinematic Architecture Tour."
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
    id: "showcase-data-galaxy",
    route: "/apps/showcase-data-galaxy/",
    routeHealth: "/apps/showcase-data-galaxy/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Interactive 3D data galaxy showcase with orbital telemetry nodes, cluster focus, and 4.0.0 post-processing."
  },
  {
    id: "showcase-webgpu-particle-lab",
    route: "/apps/showcase-webgpu-particle-lab/",
    routeHealth: "/apps/showcase-webgpu-particle-lab/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-supporting-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Accelerated GPU particle field lab with interactive attractors, presets, and 4.0.0 bloom post-processing."
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
    notes: "Bounded falling-block candidate with passing route-primary, deploy/release, and gameplay proof; ships a synthesized nine-cue audio pass with additive level stems, an instanced two-pool board view, reduced-motion-gated clear FX and camera punch, extruded wall scoreboards, and tuned retained-bloom stills."
  },
  {
    id: "showcase-aurora-lander",
    route: "/apps/showcase-aurora-lander/",
    routeHealth: "/apps/showcase-aurora-lander/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Precision lunar lander showcase with Meshy lander craft, habitat domes, lunar rovers, thruster vectoring, and touchdown scoring."
  },
  {
    id: "showcase-vault-breakers",
    route: "/apps/showcase-vault-breakers/",
    routeHealth: "/apps/showcase-vault-breakers/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Cyber-vault pinball showcase with Meshy cabinet, pop bumpers, slingshots, vault core, and Rapier hinge flippers."
  },
  {
    id: "showcase-bank-shot",
    route: "/apps/showcase-bank-shot/",
    routeHealth: "/apps/showcase-bank-shot/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Three-rack billiards showcase with typed table, cue, and individually marked 16-ball family on public Rapier contacts."
  },
  {
    id: "showcase-top-tennis",
    route: "/apps/showcase-top-tennis/",
    routeHealth: "/apps/showcase-top-tennis/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "1:1 Aura3D port of TopTennisGame.com with 2-bone IK articulated athletes, 6 courts, Smash Lab, and 32-player World Tour."
  },
  {
    id: "showcase-roadster-rush",
    route: "/apps/showcase-roadster-rush/",
    routeHealth: "/apps/showcase-roadster-rush/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "1:1 Aura3D port of Roadster Rush with 11 typed vehicle GLBs, cold-gas thrusters, barrel rolls, carrier launch ramps, and sky-lane dogfights."
  },
  {
    id: "showcase-turbo-ball",
    route: "/apps/showcase-turbo-ball/",
    routeHealth: "/apps/showcase-turbo-ball/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "2v2 Rocket League-style car soccer arena with 10 custom Meshy 3D assets, Ball-Cam/Car-Cam toggle, rocket boost, and power-hop strikes."
  },
  {
    id: "showcase-kart-havoc",
    route: "/apps/showcase-kart-havoc/",
    routeHealth: "/apps/showcase-kart-havoc/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Desert canyon Mario Kart-style item racing with 12 custom Meshy 3D assets, drift mini-turbo boost, homing canisters, and oil traps."
  },
  {
    id: "showcase-bean-brawl-race",
    route: "/apps/showcase-bean-brawl-race/",
    routeHealth: "/apps/showcase-bean-brawl-race/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Fall Guys-style 3D obstacle course knockout race with 11 custom Meshy 3D assets, 4 rigged humanoid beans, spinning sweepers, and pendulums."
  },
  {
    id: "aura-clash-showcase",
    route: "/showcase/aura-clash/playable/",
    routeHealth: "/showcase/aura-clash/playable/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "3D arena fighting showcase with Meshy PBR combatants, obsidian dragon dojo stage, combo cancels, and hit-spark VFX."
  }
] as const;

const GAME_APP_IDS = new Set([
  "showcase-blockfall-reactor",
  "aura-clash-showcase",
  "showcase-aurora-lander",
  "showcase-bank-shot",
  "showcase-vault-breakers",
  "showcase-top-tennis",
  "showcase-roadster-rush",
  "showcase-turbo-ball",
  "showcase-kart-havoc",
  "showcase-bean-brawl-race"
]);

const publicApps = apps.filter((entry) => entry.publicShowcase);
const routes = publicApps.map((entry) => entry.route);

document.querySelectorAll<HTMLAnchorElement>(".showcase-card").forEach((card, index) => {
  const title = card.querySelector("strong")?.textContent?.trim() ?? `Aura3D experience ${index + 1}`;
  const description = card.querySelector("small");
  const previewSlug = card.dataset.preview;
  const canonicalPreviewSlug = previewSlug ?? title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const badgeText = card.dataset.badge || "Experience";

  const media = document.createElement("figure");
  media.className = "showcase-card__media";

  const image = document.createElement("img");
  const primarySrc = `/previews/showcase-index/${canonicalPreviewSlug}.webp`;
  image.src = primarySrc;
  image.alt = `${title} live preview`;
  image.width = 720;
  image.height = 450;
  image.loading = "eager";
  image.decoding = "sync";
  image.onerror = () => {
    if (!image.dataset.retried) {
      image.dataset.retried = "true";
      image.src = `/previews/${canonicalPreviewSlug}.webp`;
    }
  };

  const label = document.createElement("span");
  label.className = "showcase-card__label";
  label.textContent = badgeText;
  media.append(image, label);
  card.insertBefore(media, description ?? null);

  const launch = document.createElement("em");
  launch.className = "showcase-card__launch";
  launch.innerHTML = "Open live experience <span aria-hidden=\"true\">↗</span>";
  card.append(launch);
});

window.__AURA3D_SHOWCASE_INDEX__ = {
  status: "ready",
  appCount: publicApps.length,
  gameCount: apps.filter((entry) => GAME_APP_IDS.has(entry.id)).length,
  routes,
  remediation: {
    schema: "aura3d-showcase-route-health-index/1.0",
    generatedAt: "2026-08-22",
    launchReady: false,
    routeHealthRequired: true,
    apps
  }
};

document.documentElement.dataset.showcaseIndexReady = "true";
