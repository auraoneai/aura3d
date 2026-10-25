# Bunker Zero: sidearm model, weapon label, enemy and pickup readability (2026-10-24)

Branch `game-rework`. Remote software WebGL2 (SwiftShader). Compare sheets: before (left, `evidence/showcase-bunker-zero/screens/2026-10-24`) and after (right). 0 console errors, 0 bad responses in the final capture.

## What was wrong

1. The "PISTOL" in the HUD was drawn with the pulse-rifle model: the `pistol` and `mg` viewmodels both used `corridorPulseRifleMeshy`. The HUD name was already derived from the active weapon (`WEAPONS[p.weapon].name`); the mismatch was the model in hand.
2. Enemies, the armor vest, keys, treasure, barrels and ammo read as flat tinted silhouettes. The pickups replaced their whole material with `material.emissive(...)` (textures gone); the hostiles used a multiply tint plus an emissive flood. The underlying textures are near black (mean brightness 35 to 53 out of 255), which a multiply tint cannot brighten, so the emissive was all that showed.

## What changed

- **A real pistol.** No sidearm exists in the catalog (`aura3d assets search` found none), so one was generated: text prompt "a compact futuristic semi-automatic sidearm pistol, matte graphite grey polymer body with a thin teal glowing accent strip along the slide, short barrel, ergonomic grip, side view, game-ready first-person viewmodel weapon, clean stylised PBR, no logos, no text, no markings", Meshy through Kiro Prism, preview task `01a170bd-92fe-74be-a2bf-c4cab80359ff`, refine task `01a170be-3def-7666-b22a-ad1cf19ae1b8`, 2k PBR, 2026-10-25 (UTC), **30 credits** (ledger, `bunker-zero` tag, cap 120). Optimised to 15,708 vertices and 0.82 MB (`--tex 1024`). Admitted in an isolated project (`aura3d assets import-meshy` then `assets validate --require-license`: no failures; the orientation warning is expected). Rights basis: the generating account's Meshy plan terms at generation time, not CC0, no exclusivity claimed. Evidence under `apps/showcase-bunker-zero/aura-evidence/meshy/`.
- **One table decides the model in hand.** `src/weapons-view.ts`: `VIEWMODEL_ASSET` (one distinct catalog key per weapon), `VIEWMODEL_YAW_OFFSET` (the pistol's muzzle is at +X, the rifle's at -X, so the pistol is turned 180 degrees; the first capture showed it pointing at the player) and `weaponHudLabel` (reads `WEAPONS[id].name`). The rocket pickup now uses the rocket launcher model, not the pulse rifle.
- **Enemies and pickups keep their textures.** Seven near-black models (gunner, guard, hound, warden boss, armor, crate, barrel) get a Bunker Zero-local copy with the base-colour atlas gamma-lifted to a mean near 90 (`tools/bunker-zero-lift/lift.mjs`; geometry, skeleton and clips unchanged; the shared root catalog is untouched). They are typed local assets (`src/aura-assets.local.ts`, `aura.assets.json`, derivation records in `aura-evidence/lift/`). The full-material replacements on pickups are now `materialOverrides` (multiply tint plus a faint emissive) and the hostile emissive is 0.08.

## Tests

`tests/unit/bunker-zero/weapons-view.test.ts` (one distinct model per weapon, the HUD name comes from the weapon definition, the sidearm is not the rifle, yaw table complete) and `local-assets.test.ts` (hash, size, url, license and evidence for all eight local assets). `public-example-boundary` still passes.

## Not done / honest limits

- At gameplay distance the corridor is dark and enemies are small, so the gain in the frames is moderate: the armor vest and the gunners now show surface detail instead of one flat colour, but the key and treasure still look like small gold blobs. No close-up was captured (no hook to place the camera next to an enemy).
- Enemy readability against the dark corridor now depends on the lifted textures and a small emissive; a rim light or per-enemy light would help and was not added.
- The modes panel still shows a stale "Aura3D 4.0.2" label (not in scope here).
- Nobody has judged the feel of the weapon swap or the viewmodel position by hand.
