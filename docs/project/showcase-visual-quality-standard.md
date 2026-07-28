# Showcase Visual Quality Standard

This standard separates technical route evidence from public demo quality. A route-primary probe, deploy check, or gameplay proof can prove a lower-level gate while the browser view still fails as a public example.

Current status (2026-07-27): Turbo Drift Circuit and Skyline Runner retain
bounded geometry/gameplay evidence, but public-ready wording is held while the
required retained racing visual-QA unit gate is non-passing. The configured
7/7 route-library result does not override that failure.

## Global Acceptance Criteria

- The typed primary asset is readable within 3 seconds at a desktop browser viewport.
- The composition reads as the stated category without relying on README copy.
- UI panels are useful, aligned, and contained; text must not overflow or overlap.
- The route avoids giant proof markers, locator disks, clipped debug primitives, and empty proof-object staging.
- DOM and CSS remain UI only; all 3D subjects and visual claims come from Aura3D-rendered pixels.
- Public wording stays bounded to proven root `createAuraApp` capability. No unsupported PBR, HDR, postprocess, WebGPU, shadow, animation, or reusable game-kit claims.
- Internal diagnostics may retain visible blockers, but public release candidates may not.

## Game Category Template Gate

A route-local game proof is not enough for public game quality. Racing and
platformer examples can be public only when the category template itself proves
asset selection, asset-to-gameplay alignment, camera behavior, level or track
pacing, and visual review as a complete game slice.

Minimum expectations:

- The selected primary assets must be right for the category, not only valid
  GLBs with release metadata.
- Gameplay collision/path data must visibly align to the typed world or track
  asset.
- The scene must have a meaningful duration and objective, not a short
  state-proof loop.
- The camera must preserve both the player/vehicle readability and the
  route context.
- Visual review must pass from current screenshots; route-primary, deploy, and
  input proof do not substitute for public game quality.
- Public racing and platformer examples must retain proof of at least 30 seconds
  of asset-aligned lap or level length. Quick state-change loops remain prototype
  evidence only.
- Racing public examples require retained mesh-road topology derived from the
  typed track/circuit asset; authored route overlays are prototype-only.
- Platformer public examples require retained playable-surface evidence derived
  from the typed stage/world asset; authored route rectangles are prototype-only.

## Product Configurator Public Standard

A public-quality Aura3D product configurator must:

- Show one clear typed product hero occupying the main viewport.
- Keep product controls readable and outside the product evidence area.
- Present material, variant, and focus options as clean controls with visible selected state.
- Keep route evidence secondary to the shopping/configuration experience.
- Avoid cramped panels, text overflow, raw JSON dumps, and debug-looking primitives.
- Avoid fake PBR, HDR, postprocess, shadow, or commerce claims beyond current evidence.
- Show that the route is generated and validated through Aura3D evidence gates without making those gates the main visual.
- Pass visual review only when the current screenshot would be acceptable as a public demo.

## Product / Configurator

Minimum expectations:

- Product asset is the unmistakable hero, centered or intentionally offset with clear negative space.
- Configurator controls are easy to scan and do not cover the product.
- Material/color controls are grouped and stateful.
- Evidence metadata is secondary.

Disallowed patterns:

- Product hidden by sidebars or floating below the viewport.
- UI-only color chips pretending to prove material rendering.
- Release-ready wording without asset/deploy/probe proof.

## Material Asset Inspector Public Standard

A public-quality material/asset inspector must:

- Present the inspected typed asset as the clear hero subject, not as a side effect of a debug harness.
- Organize material, mesh, texture, and provenance metadata into readable cards.
- Avoid raw debug-wall layouts, raw JSON blocks, overflowing text, and overlapping labels.
- Avoid clipped primitives; procedural samples must be intentionally staged and secondary.
- Show diagnostics as polished insight that helps a user evaluate asset quality.
- Keep public claims bounded to proven root material support; no unsupported PBR, HDR, shadow, postprocess, or editor claims.
- Pass visual review only when the current retained screenshot looks like a public inspector demo.

## Material Inspector

Minimum expectations:

- Inspected asset is the central subject and remains readable in every view mode.
- Material cards and evidence JSON stay inside scrollable, clipped panels.
- Diagnostic primitives are either neatly staged as comparison samples or removed from the public view.
- Long material names, texture slots, and JSON snippets wrap safely.

Disallowed patterns:

- Right-panel text overlap.
- Clipped spheres or debug proxies at the bottom edge.
- Raw JSON dominating the route.

## Smart City Control Public Standard

A public-quality smart-city control demo must:

- Present a readable typed vehicle or city-control asset as the clear scene subject.
- Make the page read as an operations/control surface within 3 seconds.
- Use clean status cards, map/control panels, and telemetry only where they support the scene.
- Keep UI outside the primary evidence area.
- Avoid random floating primitives or proof markers as primary visuals.
- Avoid claiming real city simulation, GIS data, traffic-control fidelity, HDR, shadows, or postprocess unless behavior and pixel evidence exists.
- Keep claims bounded to visual operations/demo evidence.
- Pass visual review only when the current retained screenshot looks like a polished public smart-city/control demo.

## Smart City

Minimum expectations:

- Typed vehicle and city context are both readable.
- Controls read as a bounded operations dashboard, not a claim of real simulation.
- Camera modes remain useful without hiding the vehicle.

Disallowed patterns:

- Real simulation/control claims without evidence.
- UI covering the vehicle.
- Primitive city blocks becoming the primary subject instead of the typed vehicle.

## Architecture

## Cinematic Architecture Public Standard

A public-quality Aura3D architecture demo must:

- Present the typed building as a clear architectural subject, not as a flat proof asset.
- Create depth through camera angle, grounding, framing, and set composition.
- Use restrained gallery, plaza, light-well, and section-plane set dressing only as secondary context.
- Keep UI minimal and outside the building evidence area.
- Avoid debug labels, proof markers, random primitive clutter, and route telemetry dominating the view.
- Avoid fake HDR, shadow, postprocess, IBL, or PBR claims unless root evidence proves them.
- Read as an architecture tour or architectural presentation within 3 seconds.

Minimum expectations:

- Architecture asset is framed like a public presentation: grounded, readable, and intentionally lit.
- Set dressing may add plaza, section planes, light wells, or guide rails, but the typed building remains primary.
- Copy describes bounded architecture staging, not cinematic renderer features that lack proof.

Disallowed patterns:

- Isolated low-detail model floating on black.
- Claims of HDR, global illumination, postprocess, or production shadows without root proof.
- UI panel visually stronger than the building.

## Digital Twin / Industrial

Minimum expectations:

- Industrial hero asset is readable and grounded in a workcell or operations context.
- Workcell set dressing is organized into legible floor, conveyor, sensor, and zone systems rather than scattered decorative primitives.
- The operations floor must read as one bounded cell; it should not float as a small island in a black void or clip against the evidence crop.
- UI reads as a bounded visual ops dashboard.
- Telemetry is deterministic route-local evidence, not a claim of live simulation.

Disallowed patterns:

- Fake real-time control or simulation claims.
- Hologram/primitive clutter obscuring the typed industrial subject.
- Dashboard text wrapping awkwardly inside controls.

## Arcade / Blockfall

Minimum expectations:

- The board/cabinet and active gameplay surface are readable.
- Controls are clear and never clipped by the browser edge.
- The screenshot reads as an arcade game view, not only as proof geometry.
- Gameplay evidence for movement, rotation, drop, scoring/loop, and reset remains current.

Disallowed patterns:

- Bottom controls partially outside the viewport.
- Cabinet or board hidden behind HUD panels.
- Primitive blocks replacing the typed cabinet/arcade subject.

## Platformer

Minimum expectations:

- Character and stage are both readable.
- Stage edges and platforms form a coherent side-scroller space.
- Empty sky or flat background does not dominate the screenshot.
- Gameplay evidence for move, jump, progression/checkpoint, and reset remains current.
- The primary character must be a release-certified, category-appropriate game avatar, not merely a technically valid GLB.
- The level must present a playable slice with start, traversal, obstacle, reward, and checkpoint/failure meaning; a compressed proof route does not qualify.
- Procedural ledges, coins, drones, and checkpoints may clarify the route, but they cannot be the visual substitute for a real platformer world template.
- Playable surfaces must be retained as asset-derived stage/world evidence for
  public status; hand-authored rectangles remain prototype-only.

Disallowed patterns:

- Character tiny relative to HUD.
- World asset shoved offscreen or clipped by the side panel.
- Primitive-only character or world stand-ins.
- Release/public wording while the chosen runner asset lacks release metadata, orientation evidence, or retained release probes.
- Treating deterministic movement/jump proof as public platformer quality.

## Racing

Minimum expectations:

- Car is readable at first glance; the longest visible axis should generally exceed 160px on desktop evidence.
- Track/circuit is visible enough to read as a racing environment.
- Gameplay HUD supports the action but does not dominate the canvas.
- Locator disks, proof rings, and contact markers must be subtle enough not to read as the main subject.
- Gameplay evidence for throttle, steering, checkpoint/lap/progression, and reset remains current.
- The track route must align to the visible typed circuit, not an unrelated synthetic loop.
- Public racing status requires retained mesh-road topology from the typed track;
  authored 2D route overlays remain prototype-only.
- The game loop must be a meaningful time-trial or race slice with a sensible lap duration, ordered gates, reset, and readable rival/ghost behavior; a 2-5 second proof loop does not qualify.
- The racing template must frame both the vehicle and circuit as the category subject, not a small car on an empty stage.

Disallowed patterns:

- Tiny vehicle centered in empty space.
- Track invisible or unreadable.
- Large bright locator disk dominating the screenshot.
- Calling a route public-quality while it is only a route-local proof of `game.racing`.
