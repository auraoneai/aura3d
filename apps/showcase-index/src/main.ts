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
    notes: "Bounded falling-block candidate with passing route-primary, deploy/release, and gameplay proof; ships a synthesized nine-cue audio pass with additive level stems, an instanced two-pool board view, reduced-motion-gated clear FX and camera punch, extruded wall scoreboards, and tuned retained-bloom stills."
  },
  {
    id: "showcase-skyline-runner",
    route: "/apps/showcase-skyline-runner/",
    routeHealth: "/apps/showcase-skyline-runner/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Public platformer candidate with a typed Kenney character, mesh-derived verdant-world surfaces, grounded contact, follow-camera framing, and retained gameplay evidence."
  },
  {
    id: "showcase-turbo-drift-circuit",
    route: "/apps/showcase-turbo-drift-circuit/",
    routeHealth: "/apps/showcase-turbo-drift-circuit/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Public racing candidate with a typed Kenney race car, mesh-derived neon-circuit topology, certified car-to-road binding, evidence-selected framing, and retained gameplay evidence."
  },
  {
    id: "showcase-siege-golf",
    route: "/apps/showcase-siege-golf/",
    routeHealth: "/apps/showcase-siege-golf/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Nine-hole route-local Rapier demolition-golf prototype with typed ball and structure props, complete machine evidence, and public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-aurora-lander",
    route: "/apps/showcase-aurora-lander/",
    routeHealth: "/apps/showcase-aurora-lander/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "typed-primary-assets-with-current-root-probes",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Three-site authored arcade landing prototype with typed probe/beacons, static Rapier terrain contact, bounded prediction, and public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-neon-swarm",
    route: "/apps/showcase-neon-swarm/",
    routeHealth: "/apps/showcase-neon-swarm/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Five-wave abstract horde-survival prototype with a typed courier and street props, deterministic route-local steering, a real 320-instance finale, and public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-gravity-post",
    route: "/apps/showcase-gravity-post/",
    routeHealth: "/apps/showcase-gravity-post/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "typed-primary-assets-pending-current-release-probes",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Four-delivery authored arcade-gravity courier prototype with a typed mail pod and dock beacons, fixed-step prediction telemetry, real dock sensors, and public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-courier-rush",
    route: "/apps/showcase-courier-rush/",
    routeHealth: "/apps/showcase-courier-rush/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Five-dispatch arcade courier prototype with typed van, parcel, traffic, and zone landmarks; machine evidence is complete and public promotion remains held for independent exact-artifact review."
  },
  {
    id: "showcase-pulse-tunnel",
    route: "/apps/showcase-pulse-tunnel/",
    routeHealth: "/apps/showcase-pulse-tunnel/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Explicitly abstract 90-second tunnel runner with 13 typed audio assets and a measured deterministic pattern fallback; no typed visual-primary claim, and public promotion remains held for independent exact-artifact review."
  },
  {
    id: "showcase-mech-hangar",
    route: "/apps/showcase-mech-hangar/",
    routeHealth: "/apps/showcase-mech-hangar/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe hangar-to-arena prototype with a deterministic original CC0 16-part MH-2M family, validated rigid socket assembly, route-local combat, and public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-vault-breakers",
    route: "/apps/showcase-vault-breakers/",
    routeHealth: "/apps/showcase-vault-breakers/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe route-local pinball prototype with typed original cabinet, mechanism overlay, ball, flipper, and vault-door assets on public Rapier contacts; public promotion remains held for independent exact-artifact review."
  },
  {
    id: "showcase-rooftop-buckets",
    route: "/apps/showcase-rooftop-buckets/",
    routeHealth: "/apps/showcase-rooftop-buckets/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe five-heat rooftop shooting prototype with an original CC0 typed court, backboard, rim, regulation-scaled ball, and player-shaped defender standee; public promotion remains held for independent exact-artifact review."
  },
  {
    id: "showcase-bank-shot",
    route: "/apps/showcase-bank-shot/",
    routeHealth: "/apps/showcase-bank-shot/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe three-rack billiards prototype with an original CC0 typed table, cue, and individually marked 16-ball family on public Rapier contacts; public promotion remains held for independent exact-artifact review."
  },
  {
    id: "showcase-gallery-shift",
    route: "/apps/showcase-gallery-shift/",
    routeHealth: "/apps/showcase-gallery-shift/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe two-floor stealth prototype with six original CC0 museum/exhibit assets, public-physics LOS and sensors, authored route-local hearing/patrol navigation, and public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-deep-recovery",
    route: "/apps/showcase-deep-recovery/",
    routeHealth: "/apps/showcase-deep-recovery/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe route-local submarine salvage prototype with five original CC0 typed sub, wreck, standard/heavy pod, and buoy assets; authored thrust, drag, buoyancy, collision, sonar, oxygen, and tow rules; public promotion held for independent exact-artifact review."
  },
  {
    id: "showcase-patrol-wing",
    route: "/apps/showcase-patrol-wing/",
    routeHealth: "/apps/showcase-patrol-wing/route-health.json",
    classification: "prototype-blocked",
    publicShowcase: false,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Root-safe route-local authored arcade-flight patrol with four original CC0 typed aircraft, drone, and pad assets; Rapier-backed route-local sensors, root combat-world hits, and public promotion held for independent exact-artifact review."
  }
] as const;

const GAME_APP_IDS = new Set([
  "showcase-turbo-drift-circuit",
  "showcase-skyline-runner",
  "showcase-blockfall-reactor",
  "aura-clash-showcase",
  "neon-corridor-strike",
  "showcase-siege-golf",
  "showcase-neon-swarm",
  "showcase-aurora-lander",
  "showcase-gravity-post",
  "showcase-courier-rush",
  "showcase-pulse-tunnel",
  "showcase-mech-hangar",
  "showcase-vault-breakers",
  "showcase-bank-shot",
  "showcase-patrol-wing",
  "showcase-gallery-shift",
  "showcase-deep-recovery",
  "showcase-rooftop-buckets"
]);

const publicApps = apps.filter((entry) => entry.publicShowcase);
const routes = publicApps.map((entry) => entry.route);

document.querySelectorAll<HTMLAnchorElement>(".showcase-card").forEach((card, index) => {
  const title = card.querySelector("strong")?.textContent?.trim() ?? `Aura3D experience ${index + 1}`;
  const description = card.querySelector("small");
  const previewSlug = card.dataset.preview;
  const badgeText = card.dataset.badge || "Experience";

  const media = document.createElement("figure");
  media.className = "showcase-card__media";

  const image = document.createElement("img");
  const primarySrc = previewSlug
    ? `/previews/showcase-index/${previewSlug}.webp`
    : `/previews/showcase-index/${String(index + 1).padStart(2, "0")}.webp`;
  image.src = primarySrc;
  image.alt = `${title} live preview`;
  image.width = 720;
  image.height = 450;
  image.loading = index < 6 ? "eager" : "lazy";
  image.decoding = "async";
  image.onerror = () => {
    if (previewSlug && !image.dataset.retried) {
      image.dataset.retried = "true";
      image.src = `/previews/${previewSlug}.webp`;
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
