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
    notes: "Cyberpunk anti-gravity combat drone racing with 7 armed drones, megacity highway circuits, twin laser cannons, thermal overdrive management, and 26 typed GLBs."
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
    notes: "San Francisco autonomous fleet & street teleoperation with Apex Lidar Cruiser, Cyber Coupe, Titan EV Truck, Vortex GT, L5 self-driving robotaxi fares, vector minimap, and multiplayer peer tags."
  },
  {
    id: "showcase-iron-crown",
    route: "/apps/showcase-iron-crown/",
    routeHealth: "/apps/showcase-iron-crown/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "2.5D arena fighter — six fighters across six stages, best-of-3 rounds with metered specials, Crown Ladder bracket, Combo Lab, and Player Studio palettes."
  },
  {
    id: "showcase-pips-big-leap",
    route: "/apps/showcase-pips-big-leap/",
    routeHealth: "/apps/showcase-pips-big-leap/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "3D mascot platformer — Pip leaps six worlds collecting sun-seeds with double-jump, dive, glide, and ground-pound, Jump Academy gauntlet, time trials, and a Brambleback boss."
  },
  {
    id: "showcase-aura-hoops-3d",
    route: "/apps/showcase-aura-hoops-3d/",
    routeHealth: "/apps/showcase-aura-hoops-3d/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "3v3 streetball — ankle-breaker jukes, alley-oops, and a press-hold-release shot meter across six courts from Rucker asphalt to the Orbit dome. Dunk Lab, Handles Lab, 8 squads, 32-team Street Tour."
  },
  {
    id: "showcase-aura-diamond-3d",
    route: "/apps/showcase-aura-diamond-3d/",
    routeHealth: "/apps/showcase-aura-diamond-3d/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Three-inning baseball — PCI × timing at-bats, four pitch types, and launch-angle moonshots across six ballparks from Harbor Sandlot to Lunar Park. Derby Lab, Bullpen Lab, 8 clubs, 32-team World Classic."
  },
  {
    id: "showcase-aura-fc-3d",
    route: "/apps/showcase-aura-fc-3d/",
    routeHealth: "/apps/showcase-aura-fc-3d/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "5v5 street-and-stadium soccer — driven passes, curling finishers, and skill moves across six pitches from the Favela Cage to the Glacier Arena. Shootout Lab, Touch Lab, 8 clubs, 32-team World Circuit."
  },
  {
    id: "showcase-red-zone-3d",
    route: "/apps/showcase-red-zone-3d/",
    routeHealth: "/apps/showcase-red-zone-3d/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "7v7 arcade football — play-calling, QB reads, and hit-stick defense across six stadiums from Friday Night Lights to the Altitude Bowl. Route Lab, Tackle Lab, 8 clubs, 32-team Gridiron Series."
  },
  {
    id: "showcase-aura-links-3d",
    route: "/apps/showcase-aura-links-3d/",
    routeHealth: "/apps/showcase-aura-links-3d/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Three-click arcade golf — ball-flight sim with wind, lies and shot-shaping across six courses from Scottish dunes to the lunar Mare crater. Range Lab, Putting Lab, Skins match, and a 32-player Pro Circuit."
  },
  {
    id: "showcase-bunker-zero",
    route: "/apps/showcase-bunker-zero/",
    routeHealth: "/apps/showcase-bunker-zero/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Retro corridor FPS — six floors from Stone Gatehouse to the Bunker Zero silo, four weapons, three enemy types plus the Iron Warden, push-wall secrets, keys and par medals."
  },
  {
    id: "showcase-slingshot-siege",
    route: "/apps/showcase-slingshot-siege/",
    routeHealth: "/apps/showcase-slingshot-siege/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Cartoon physics destruction — drag-back slingshot launches, 30 levels across six chapters, five ammo types with mid-air powers, wood/stone/glass material breakage, and three-star scoring."
  },
  {
    id: "showcase-dot-dash-3d",
    route: "/apps/showcase-dot-dash-3d/",
    routeHealth: "/apps/showcase-dot-dash-3d/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Neon maze chase — Byte outruns four Specter personalities (Blitz, Sly, Flick, Dim) across six circuit mazes; Power Orb chain hunts, fruit schedule, dash, Ghost School target overlays, Circuit Map, Player Studio."
  },
  {
    id: "showcase-cross-hop",
    route: "/apps/showcase-cross-hop/",
    routeHealth: "/apps/showcase-cross-hop/route-health.json",
    classification: "candidate",
    publicShowcase: true,
    primaryAssetStatus: "typed-primary-assets",
    primitiveStatus: "within-stated-role",
    claimStatus: "bounded",
    notes: "Endless lane hopper — four-direction hops across roads, tram lines, rivers, rails, and lava; six remixed themes, twelve unlockable Meshy critters, idle-hawk pressure, coin and rescue-pod economy. Timing School, World Tour, Player Studio, and Critterdex."
  }
] as const;

const GAME_APP_IDS = new Set([
  "showcase-top-tennis",
  "showcase-roadster-rush",
  "showcase-heatsink",
  "showcase-teleoperator",
  "showcase-iron-crown",
  "showcase-pips-big-leap",
  "showcase-aura-hoops-3d",
  "showcase-aura-diamond-3d",
  "showcase-aura-fc-3d",
  "showcase-red-zone-3d",
  "showcase-aura-links-3d",
  "showcase-bunker-zero",
  "showcase-slingshot-siege",
  "showcase-dot-dash-3d",
  "showcase-cross-hop"
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
  launch.textContent = "Open live experience";
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
