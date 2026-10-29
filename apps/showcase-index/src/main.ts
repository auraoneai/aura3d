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
    notes: "High-speed sunset freeway racer with sky-lane traffic, cold-gas thrusters, barrel rolls and carrier launch ramps."
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
    notes: "San Francisco robotaxi shifts: stop at kerb beacons to pick up and drop off five fares, five driver-assist levels, AI rival cars, signals and a scored results screen."
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
    notes: "5v5 streetball: check ball, a timed shot meter, contested dunks and team kits across six courts from Rucker asphalt to the Orbit dome. Dunk Lab, Handles Lab, a squad picker and a 32-team Street Tour."
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
  },
  {
    id: "showcase-strange-orbit-port",
    route: "/apps/showcase-strange-orbit-port/",
    routeHealth: "/apps/showcase-strange-orbit-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Moon-rim bike racing: a seven-lap cup race against five rivals with route splits, checkpoints and a rescue budget. Simulation parity verified against a recorded seven-lap run; procedural art, no career, garage or audio."
  },
  {
    id: "showcase-splat-rush-port",
    route: "/apps/showcase-splat-rush-port/",
    routeHealth: "/apps/showcase-splat-rush-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Colour-gate ball runner with power-ups, colour switching and a splatter game-over; every simulation field matches a recorded reference run. No audio; platform SDKs are not included."
  },
  {
    id: "showcase-serpentine-sky-run-port",
    route: "/apps/showcase-serpentine-sky-run-port/",
    routeHealth: "/apps/showcase-serpentine-sky-run-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Endless runner on a serpentine sky road: eight stages with boost rungs, roll sections and traffic hazards; the outbound run matches a recorded reference. Outbound run only (no menus, audio or later phases); primitive avatars and a gradient sky."
  },
  {
    id: "showcase-drift-and-deliver-port",
    route: "/apps/showcase-drift-and-deliver-port/",
    routeHealth: "/apps/showcase-drift-and-deliver-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Arcade drift driving through a block city: coin pickups, 84 traffic cars, bloom and a chase camera; all four recorded scenarios reproduce exactly. Headlight beam cone does not draw yet; collision response untested; no audio, story or shadows."
  },
  {
    id: "showcase-heatsink-port",
    route: "/apps/showcase-heatsink-port/",
    routeHealth: "/apps/showcase-heatsink-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Anti-gravity time trial on the Vesper course with boost pads, pickups, barrels and heat management; the state replay matches the recorded reference within 1e-6. the art is generated; Time Trial only, no AI or audio."
  },
  {
    id: "showcase-ninja-runner-port",
    route: "/apps/showcase-ninja-runner-port/",
    routeHealth: "/apps/showcase-ninja-runner-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Lane-running combat with twelve skinned clones, form changes and a full course win; the recorded 106-second run replays event for event. A single soldier model tinted per form, procedural environment, no audio."
  },
  {
    id: "showcase-last-train-port",
    route: "/apps/showcase-last-train-port/",
    routeHealth: "/apps/showcase-last-train-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Train-driving loop with day and night, passengers, fares and tips; loop length and score match a recorded loop and memory stays flat over three loops. No garage wear or requests; Gold is graded on comfort and catches only; night is a sky blend plus surface tints."
  },
  {
    id: "showcase-roadster-hours-port",
    route: "/apps/showcase-roadster-hours-port/",
    routeHealth: "/apps/showcase-roadster-hours-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Coastal highway drive with jumps, traffic and relay gates. 33 to 35 vehicles per route, one batched mesh per vehicle model, with sun shadows; a recorded 6,124-step run replays to the original's final state."
  },
  {
    id: "showcase-where-the-wind-wanders-port",
    route: "/apps/showcase-where-the-wind-wanders-port/",
    routeHealth: "/apps/showcase-where-the-wind-wanders-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Meadow walk collecting three letters and ringing a bell; the walking trajectory matches the recorded reference within 1e-9 over 2,098 steps. Meadow only: no boat voyage, island, journal or audio; procedural art."
  },
  {
    id: "showcase-silt-and-signal-port",
    route: "/apps/showcase-silt-and-signal-port/",
    routeHealth: "/apps/showcase-silt-and-signal-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Free-ride flying over a silt world; three recorded rides reproduce the recorded simulation state to 1e-9. Stand-in ground, canal, rings and rider; no chapters, colliders or voiced scenes."
  },
  {
    id: "showcase-cloud-runner-port",
    route: "/apps/showcase-cloud-runner-port/",
    routeHealth: "/apps/showcase-cloud-runner-port/route-health.json",
    classification: "prototype",
    publicShowcase: true,
    primaryAssetStatus: "primitive-only",
    primitiveStatus: "primary-subject-proxy",
    claimStatus: "bounded",
    notes: "Obstacle runner on a cloud: the first chapter's run model matches a recorded reference run to 1e-12. Chapter-one run only: no creatures, boulders, finale or audio; procedural art."
  }
] as const;

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
  image.srcset = `${primarySrc} 1x, /previews/showcase-index/${canonicalPreviewSlug}@2x.webp 2x`;
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
  gameCount: document.querySelectorAll(".showcase-card.is-game").length,
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
