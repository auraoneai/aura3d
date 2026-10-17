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
    id: "showcase-top-tennis",
    route: "/apps/showcase-top-tennis/",
    routeHealth: "/apps/showcase-top-tennis/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Championship 3D tennis stadium featuring 2-bone IK articulated athletes, 6 courts, Smash Lab, and 32-player World Tour."
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
    notes: "High-speed sunset freeway & sky-lane combat racer featuring 11 typed vehicle GLBs, cold-gas thrusters, barrel rolls, carrier launch ramps, and sky-lane dogfights."
  },
  {
    id: "showcase-heatsink",
    route: "/apps/showcase-heatsink/",
    routeHealth: "/apps/showcase-heatsink/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "1:1 Aura3D port of THERMAL DRIFT with 7 armed Ramjet racing drones, megacity highway circuits, twin laser cannons, thermal overdrive management, and 26 typed GLBs."
  },
  {
    id: "showcase-teleoperator",
    route: "/apps/showcase-teleoperator/",
    routeHealth: "/apps/showcase-teleoperator/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "release-validated-typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "1:1 Aura3D port of Grid Dispatch with Apex Lidar Cruiser, Tesla Cyber Coupe, Titan EV, Corvette ZR1X, L5 self-driving robotaxi fares, vector minimap, and multiplayer peer tags."
  }
] as const;

const GAME_APP_IDS = new Set([
  "showcase-top-tennis",
  "showcase-roadster-rush",
  "showcase-heatsink",
  "showcase-teleoperator"
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
