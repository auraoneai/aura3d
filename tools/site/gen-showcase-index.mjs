#!/usr/bin/env node
// Regenerates the game-count text and the genre-grouped card sections of apps/showcase-index/index.html
// from docs/workflows/game-inventory.json and tools/site/games.catalog.json. --check fails on drift.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = process.argv.includes("--check");
const target = join(repoRoot, "apps", "showcase-index", "index.html");
const inventory = JSON.parse(readFileSync(join(repoRoot, "docs", "workflows", "game-inventory.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(repoRoot, "tools", "site", "games.catalog.json"), "utf8"));
const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const N = inventory.liveGameCount;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textByApp = new Map(catalog.games.map((g) => [g.appFolder, g.text]));
// Overrides keep showcase-index copy aligned with 100% native @aura3d/engine procedural art in 5.5.3+
// even before tools/site/games.catalog.json is refreshed.
const CARD_COPY_OVERRIDES = new Map([
  [
    "showcase-strange-orbit-port",
    "Moon-rim bike racing: a seven-lap cup race against five rivals with route splits, checkpoints and a rescue budget. Simulation parity verified against a recorded seven-lap run; lit sci-fi look with multi-material procedural bikes, riders and rim props, audio and a difficulty selector; single cup race (no career or garage)."
  ],
  [
    "showcase-splat-rush-port",
    "Colour-gate ball runner with power-ups, colour switching and a splatter game-over; every simulation field matches a recorded reference run. Native multi-material procedural backdrop islands and pickups, procedural audio, effects and touch/keyboard play."
  ],
  [
    "showcase-serpentine-sky-run-port",
    "Endless runner on a serpentine sky road: eight stages with boost rungs, roll sections and traffic hazards; the outbound run matches a recorded reference. Multi-material procedural runner, gate and hazards with title, pause, results and audio; outbound course only."
  ],
  [
    "showcase-drift-and-deliver-port",
    "Arcade drift driving through a block city: coin pickups, 84 traffic cars, headlight beams, bloom and a chase camera; all four recorded scenarios reproduce exactly with multi-material procedural vehicles, city blocks and street props."
  ],
  [
    "showcase-heatsink-port",
    "Anti-gravity time trial on the Vesper course with boost pads, pickups, barrels and heat management; the state replay matches the recorded reference within 1e-6. Native multi-material procedural craft, pylons and canyon scenery; solo Time Trial course."
  ],
  [
    "showcase-ninja-runner-port",
    "Lane-running combat with up to twelve clones, form changes and a full course win; the recorded 106-second run replays event for event with articulated multi-material procedural warriors, dojo rooftops and course props."
  ],
  [
    "showcase-last-train-port",
    "Train-driving loop with day and night, passengers, fares and tips; loop length and score match a recorded loop and memory stays flat over three loops. Multi-material procedural tram, townhouses, landmarks and passengers on a continuous route (no garage or level select)."
  ],
  [
    "showcase-roadster-hours-port",
    "Coastal highway drive with jumps, traffic and relay gates. 33 to 35 multi-material procedural vehicles per route, batched per vehicle class with sun shadows; a recorded 6,124-step run replays to the reference final state."
  ],
  [
    "showcase-where-the-wind-wanders-port",
    "Meadow walk collecting three letters and ringing a bell; the walking trajectory matches the recorded reference within 1e-9 over 2,098 steps. Multi-material procedural traveller, cottages and trees with the boat epilogue, journal and audio."
  ],
  [
    "showcase-silt-and-signal-port",
    "Free-ride flying over a silt world; three recorded rides reproduce the recorded simulation state to 1e-9. Multi-material procedural glider, ring beacons and ruins with Chapter 0 terrain colliders and procedural dune chapters beyond (free-flight exploration, no NPCs or minimap)."
  ],
  [
    "showcase-cloud-runner-port",
    "Obstacle runner on a cloud: the first chapter's run simulation matches a recorded reference run to 1e-12. Multi-material procedural hero, creatures, boulders and sky scenery across the run, duel and finale with audio."
  ]
]);
const cardCopy = (appFolder) => CARD_COPY_OVERRIDES.get(appFolder) ?? textByApp.get(appFolder);
const badge = (g) => (g.verification === "replay-verified" ? "Replay-verified" : "Playable game");

const sections = Object.entries(inventory.genres)
  .map(([key, label]) => {
    const games = inventory.games.filter((g) => g.status === "live" && g.genre === key);
    if (games.length === 0) return "";
    const cards = games
      .map(
        (g) =>
          `          <a class="showcase-card is-game" href="${g.url}" data-preview="${g.slug}" data-badge="${badge(g)}"><strong>${esc(g.title)}</strong><small>${cardCopy(g.appFolder)}</small></a>`
      )
      .join("\n");
    return `      <section class="catalog-section" id="genre-${key}" aria-labelledby="genre-${key}-title">
        <div class="section-head"><div><p class="eyebrow">${games.length} ${games.length === 1 ? "game" : "games"}</p><h2 id="genre-${key}-title">${esc(label)}</h2></div></div>
        <div class="library games-library">
${cards}
        </div>
      </section>`;
  })
  .filter(Boolean)
  .join("\n\n");

const lead = `      <section class="catalog-section" id="games" aria-labelledby="games-title">
        <div class="section-head"><div><p class="eyebrow">Playable games, Aura3D ${version}</p><h2 id="games-title">All ${N} games</h2></div><p>${N} independent games built on <code>@aura3d/engine@${version}</code> with 100% native multi-material procedural art (zero external or AI-generated GLBs), a WebGPU-first runtime with automatic WebGL2 fallback across desktop and Safari/iOS, <code>RuntimeQualityGovernor</code>, mobile touch controls, and first-gesture audio unlock. Cards marked Replay-verified have a recorded reference run that the simulation reproduces; each card states its own scope, and none is affiliated with any other game or studio.</p></div>
      </section>`;

const block = `<!-- games:start (generated by tools/site/gen-showcase-index.mjs) -->\n${lead}\n\n${sections}\n      <!-- games:end -->`;

let html = readFileSync(target, "utf8");
const START = "<!-- games:start";
if (html.includes(START)) {
  html = html.replace(/<!-- games:start[\s\S]*?<!-- games:end -->/, block);
} else {
  const from = html.indexOf('<section class="catalog-section" aria-labelledby="games-title">');
  const to = html.indexOf("</main>");
  if (from < 0 || to < 0) throw new Error("showcase-index: cannot locate the catalog sections to replace");
  const indent = html.lastIndexOf("\n", from) + 1;
  html = `${html.slice(0, indent)}      ${block}\n    ${html.slice(to)}`;
}

const rules = [
  [/<span class="nav-version">v[^<]*<\/span>/, `<span class="nav-version">v${version}</span>`],
  [/<p class="eyebrow">Built with Aura3D [^<]*<\/p>/, `<p class="eyebrow">Built with Aura3D ${version}</p>`],
  [/Explore \d+ (?:studio-grade )?playable 3D browser games built on <code>@aura3d\/engine@[^<]*<\/code>/, `Explore ${N} playable 3D browser games built on <code>@aura3d/engine@${version}</code>`],
  [/<a class="hero-secondary" href="#(?:ports|games)">[^<]*<\/a>/, `<a class="hero-secondary" href="#games">Browse all ${N} games</a>`],
  [/<span><strong>\d+<\/strong> (?:studio-grade|playable) 3D games<\/span>/, `<span><strong>${N}</strong> playable 3D games</span>`],
  [/<span><strong>@aura3d\/engine@[^<]*<\/strong><\/span>/, `<span><strong>@aura3d/engine@${version}</strong></span>`],
  [/<aside class="hero-gallery" aria-label="Featured Aura3D [^"]*"/, `<aside class="hero-gallery" aria-label="Featured Aura3D ${version} games"`],
  [/>npm [0-9]+\.[0-9]+\.[0-9]+<\/a>/, `>npm ${version}</a>`]
];
for (const [pattern, replacement] of rules) {
  if (!pattern.test(html)) throw new Error(`showcase-index: pattern not found: ${pattern}`);
  html = html.replace(pattern, replacement);
}
if (!/<meta name="description"/.test(html)) {
  html = html.replace('<link rel="canonical"', `<meta name="description" content="${N} playable 3D browser games built on Aura3D: racing, sports, action, platformers and arcade, each with its own limits stated." />\n    <link rel="canonical"`);
} else {
  html = html.replace(/<meta name="description" content="\d+ playable 3D browser games[^"]*" \/>/, `<meta name="description" content="${N} playable 3D browser games built on Aura3D: racing, sports, action, platformers and arcade, each with its own limits stated." />`);
}

if (CHECK) {
  const current = readFileSync(target, "utf8");
  if (current !== html) {
    console.error("apps/showcase-index/index.html is stale: run `node tools/site/gen-showcase-index.mjs`");
    process.exit(1);
  }
  console.log(`gen-showcase-index --check: OK (${N} games)`);
} else {
  writeFileSync(target, html, "utf8");
  console.log(`wrote apps/showcase-index/index.html (${N} games, ${Object.keys(inventory.genres).length} genres)`);
}
