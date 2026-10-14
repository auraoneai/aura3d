# Deep Recovery

Deep Recovery is a `createAuraApp` root-safe prototype with route-local submarine salvage rules. The route uses five original typed CC0 models for the player submarine, wreck, standard pod, heavy pod, and recovery buoy, plus eleven typed original CC0 audio cues.

## Mission

Descend and pulse sonar, approach the wreck, grapple and bank a blue standard pod, survive a collision breach, explicitly repair inside the buoy service zone, recover the higher-value amber heavy pod under greater tow drag, and surface before oxygen depletion causes blackout. The mission has keyboard and touch controls, pause, a fail state, a win state, and a full reset.

## Controls

- `W` / `S` or arrows: forward/reverse thrust
- `A` / `D` or arrows: turn
- `Q` / `E`: dive/surface heave
- `Shift`: sprint thrust at increased oxygen cost
- `Space`: sonar pulse
- `F`: grapple or release one pod
- `C`: repair an active breach while inside the buoy service zone
- `P`: pause/resume
- `R`: full mission reset

The mobile HUD exposes held thrust, turn, dive, and surface buttons plus sonar, grapple, repair, pause, and reset controls. All interactive buttons have a minimum 44 px target.

## Exact ownership and claim boundary

- Rendering mounts once through public `createAuraApp` APIs from `@aura3d/engine`. This route is a root-safe prototype, not a production renderer, reusable submarine kit, or engine-parity claim.
- Thrust, linear/angular drag, neutral buoyancy, six-axis authored input, speed caps, world bounds, wreck collision pushout, oxygen, hull damage, breach, repair, grapple spring, tow mass, banking, and mission progression are deterministic route-local TypeScript. They are not Rapier or Recast behavior.
- Sonar is a route-local spherical query over the exact live coordinates of typed buoy, wreck, and unbanked salvage targets. Authored wreck spheres perform line-segment occlusion filtering. Wrecks themselves return; a crate behind an intervening wreck volume does not. The route does not claim acoustic propagation, fluid simulation, generic physics queries, or reusable sonar.
- The expanding pulse, temporary contact rings, warm lamp volumes, bioluminescent silt, breach beacon, and grapple line are Aura3D scene nodes. Contact rings are positioned from the same world coordinates returned by the query. The DOM only mirrors contact labels and distances accessibly.
- Standard and heavy pods use distinct typed assets, value, and mass. The 120 kg standard pod contributes `0.12` authored tow drag; the first 280 kg heavy pod contributes `0.28`, reducing acceleration and speed cap by the shared authored motion formula.
- Banking requires both the submarine and attached pod to be inside the buoy radius and above the depth threshold. Repair is a separate explicit action and cannot occur outside that service zone.
- Reduced-motion mode suppresses decorative pulse/drift amplitude and warning animation while preserving sonar contacts, cooldown text, breach text, oxygen state, objective state, and audio-event evidence.

## Evidence

- Unit: `tests/unit/apps/deep-recovery-{sonar,oxygen,salvage,sub}.test.ts`
- Browser mission and exact artifacts: `tests/browser/deep-recovery-playable.spec.ts`
- Scene/browser smoke: `tests/browser/deep-recovery-scene.spec.ts`
- Exact artifact receipt: `tests/reports/deep-recovery/playable/browser-evidence.json`
- Mission state record: `tests/reports/deep-recovery/playable/mission-touch.json`
- Asset probes: `tests/reports/showcase-release-asset-probes/deepRecovery*.json`
- Route-primary proof: `tests/reports/showcase-route-primary-probes/showcase-deep-recovery.json`
- Strict deployment: `apps/showcase-deep-recovery/deploy-report.json`
- Performance: `apps/showcase-deep-recovery/performance-report.json`
- Aggregate machine gate: `apps/showcase-deep-recovery/route-health.json`

Machine evidence does not approve the exact visual artifacts. Public promotion remains blocked until an independent human reviews the hash-bound descent, sonar, wreck, grapple, heavy tow, breach, low oxygen, surface, blackout, mobile, and reduced-motion frames and records that verdict in the PRD ledger.
