export const assetRoleUsage =
  "hero|character|vehicle|enemy|world|environment|track|product|weapon|prop|set-dressing|backdrop|proxy|hdri|texture-set|vfx-atlas|audio|debug|abstract|unknown";

export function assetsAddHelp(): string {
  return `Usage: aura3d assets add ./model.glb --name robot [options]
       aura3d assets add ./grade.cube --name venueGrade --type lut   (3-D .cube LUT for effects.colorGrade({ lut: assets.venueGrade }))

Options:
  --type model|texture|environment|audio|navigation|lut
  --license CC0-1.0
  --license-name "CC0 1.0 Universal"
  --license-url URL
  --license-raw TEXT
  --source-page URL
  --download-url URL
  --source-url URL
  --author NAME
  --source-family NAME
  --attribution TEXT
  --provenance-evidence TEXT (repeatable)
  --retrieved-at ISO-8601
  --quality ungraded|blocked|prototype|candidate
  --role ${assetRoleUsage}
  --suitability TEXT
  --art-direction ID (assets/art-direction/<id>.json)
  --loudness-lufs N (--type audio)
  --true-peak-db N (--type audio)
  --rendered-probe-json tests/reports/asset.probe.json
  --rendered-probe /aura-assets/probe.png
  --orientation-json tests/reports/asset.orientation.json
  --public-path /aura-assets/name.glb
  --output public/aura-assets`;
}

export function mainHelp(profileUsage: string): string {
  return `Aura3D CLI

Commands:
  aura3d assets add ./model.glb --name robot [--type model|texture|environment|audio|navigation|lut] [--license CC0-1.0] [--license-url URL] [--source-page URL] [--download-url URL] [--source-url URL] [--author NAME] [--retrieved-at ISO-8601] [--quality ungraded|blocked|prototype|candidate] [--role ${assetRoleUsage}] [--suitability TEXT] [--rendered-probe-json tests/reports/asset.probe.json] [--rendered-probe /aura-assets/probe.png] [--orientation-json tests/reports/asset.orientation.json]
  aura3d assets admit <id> --quality prototype|candidate|release
  aura3d assets import-meshy artifacts/meshy/run --name assetKey --rights-evidence artifacts/meshy/run/rights.json [--file model.glb] [--thumbnail thumbnail.png] [--profile prop|environment|vehicle|humanoid] [--allowed-root artifacts/meshy] [--quality candidate] [--role ${assetRoleUsage}]
      Local-only candidate ingestion: confines paths, validates GLB/metadata, reports profile budgets, retains a local thumbnail without signed URLs, and never certifies release quality.
  aura3d assets import-meshy artifacts/meshy/run --into examples/<game>/assets --prefix <game> --name <role> [--rights-evidence rights.json] [--profile prop|environment|vehicle|humanoid] [--overwrite] [--keep-temp]
      Isolated mode (the default inside the Aura3D monorepo): admits in a temporary project and copies only the hashed GLB and its evidence into the game folder; shared root manifests are never written (pass --shared-manifest to opt out).
  aura3d assets optimize --file in.glb --out out.glb [--role hero|vehicle|character|prop|background] [--max-verts N] [--tex N] [--no-simplify] [--meshopt] [--json]
  aura3d assets optimize --hdri <1k|2k> [--rgb9e5-cube] --file in.hdr --out out_1k.hdr [--json]
      HDRI delivery: writes a downsized .hdr (2k sources to <= 1.5 MB at 1k) and, with --rgb9e5-cube, an RGB9E5 cube map for environments.hdri(...).
  aura3d assets merge-clips --base rigged.glb --out hero.glb run=animation_run.glb idle=animation_idle.glb [--keep-base-animations] [--tex 1024] [--json]
  aura3d meshy ledger status|reserve|settle|reconcile|baseline|list [--ledger path] [--global-cap N] [--game-cap N]   (caps are opt-in; default uncapped)
      Spend is uncapped by owner decision (2026-10-25): credits are tracked for visibility, caps are opt-in; reserve --game <tag> --op preview|refine|remesh|rigging|animate|retexture [--cap N] [--est N] [--dry-run] (a cap you set is a hard stop that prints the flag that raises it; config --global-cap N|off --game-cap N|off persists or removes one); settle --rid <id> --status ok|failed|unconfirmed|--exit-code N [--task-id T] [--task-status S] [--error-text text] [--actual N] [--note text]; reconcile --rid <id> --status ok|failed; reconcile [--apply] [--pool-json file] (ledger vs the Prism pool); baseline [--pool-json file]; list [--game <tag>]. It never calls Meshy; only reconcile/baseline read the Prism pool balance (AURA3D_PRISM_KEY or AURA3D_PRISM_KEY_FILE, never printed).
  aura3d assets scan ./assets
  aura3d assets inspect ./model.glb [--animation] [--humanoid] [--skeleton] [--morphs] [--license]
  aura3d assets validate [--asset assetId|--no-assets] [--source [src]] [--release] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-game [--profile fighting-character] [--asset fighter] [--output artifacts/aura3d/game-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-animation-studio [--episode] [--asset character] [--output artifacts/aura3d/animation-studio-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate --skin [file.glb] [--asset id] [--clips Walk,Run] [--strict] [--json]   (skinned-mesh stretch, flaps, weights, bind-pose mismatch; known defects in aura.skin-allow.json)
  aura3d assets repair-skin <file.glb|assetId> [--out file.glb] [--normalize] [--prune-distant] [--smooth-bridges] [--cut-stretch 2] [--rebuild-limbs] [--refit-skeleton] [--keep-clips Idle_Loop,Walk_Loop]
  aura3d assets validate-animation --clips Idle_Loop,Walk_Loop,Sprint_Loop --map idle=Idle_Loop,walk=Walk_Loop,run=Sprint_Loop [--require idle,walk,run] [--require-rig]
  aura3d assets assemble-character --name hero --body bodyAsset --part hair=hairAsset
  aura3d assets list
  aura3d assets typegen
  aura3d assets bind-game-route-evidence --route <id> --category racing|platformer --assets <id,id,...> --screenshot <png> --geometry-report <json> --composition-report <json> --visual-review <json>
  aura3d assets certify-game-geometry --asset <id> --category racing|platformer|sports|fighting|arena|puzzle
  aura3d assets certify-game-geometry --assets <id,id,...> --category racing|platformer|sports|fighting|arena|puzzle
  aura3d assets thumbnail
  aura3d assets search <query> [--profile ${profileUsage}] [--license cc0|cc-by] [--max-tris N] [--animated] [--json]
  aura3d assets resolve <query> --name <name> [--profile ${profileUsage}] [--license cc0|cc-by] [--max-tris N] [--animated] [--index N] [--candidate-id ID]
  aura3d animation plan|preview|render|package|review|verify [--dry-run]
  aura3d animation scene <new|show|cast add|prop add|set|block|camera|shot|dialogue|render|...>  (agent-native Scene-Tool CLI)
  aura3d doctor
  aura3d check-deploy --dist dist [--release] [--source [src]] [--asset assetId|--no-assets]
      Static check of the build output against aura.assets.json (hashed assets, unreferenced files, licence gates with --release).
  aura3d check-deploy --dist dist --browser [--route /path ...] [--browser-timeout ms] [--browser-settle ms]
      Also loads each route (default /) from a local static server in headless Chromium and fails on HTTP errors, failed requests, uncaught errors and console errors. Needs Playwright in your project (npm i -D playwright, npx playwright install chromium).
  aura3d init --agent all [--skills core|all|none] [--template <create-aura3d template>]
      Writes agent instruction files, Aura3D agent skills (per client skills dir), and llms.txt; never overwrites user-edited files.`;
}
