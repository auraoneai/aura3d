export const assetRoleUsage =
  "character|vehicle|world|environment|track|product|weapon|prop|set-dressing|debug|abstract|unknown";

export function assetsAddHelp(): string {
  return `Usage: aura3d assets add ./model.glb --name robot [options]

Options:
  --type model|texture|environment|audio|navigation
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
  --quality ungraded|blocked|prototype|candidate|release
  --role ${assetRoleUsage}
  --suitability TEXT
  --rendered-probe-json tests/reports/asset.probe.json
  --rendered-probe /aura-assets/probe.png
  --orientation-json tests/reports/asset.orientation.json
  --public-path /aura-assets/name.glb
  --output public/aura-assets`;
}

export function mainHelp(profileUsage: string): string {
  return `Aura3D CLI

Commands:
  aura3d assets add ./model.glb --name robot [--type model|texture|environment|audio|navigation] [--license CC0-1.0] [--license-url URL] [--source-page URL] [--download-url URL] [--source-url URL] [--author NAME] [--retrieved-at ISO-8601] [--quality ungraded|blocked|prototype|candidate|release] [--role ${assetRoleUsage}] [--suitability TEXT] [--rendered-probe-json tests/reports/asset.probe.json] [--rendered-probe /aura-assets/probe.png] [--orientation-json tests/reports/asset.orientation.json]
  aura3d assets import-meshy artifacts/meshy/run --name assetKey --rights-evidence artifacts/meshy/run/rights.json [--file model.glb] [--thumbnail thumbnail.png] [--profile prop|environment|vehicle|humanoid] [--allowed-root artifacts/meshy] [--quality candidate] [--role ${assetRoleUsage}]
      Local-only candidate ingestion: confines paths, validates GLB/metadata, reports profile budgets, retains a local thumbnail without signed URLs, and never certifies release quality.
  aura3d assets scan ./assets
  aura3d assets inspect ./model.glb [--animation] [--humanoid] [--skeleton] [--morphs] [--license]
  aura3d assets validate [--asset assetId|--no-assets] [--source [src]] [--release] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-game [--profile fighting-character] [--asset fighter] [--output artifacts/aura3d/game-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-animation-studio [--episode] [--asset character] [--output artifacts/aura3d/animation-studio-assets.json] [--no-placeholders] [--require-license] [--provenance evidence.json]
  aura3d assets validate-animation --clips Idle_Loop,Walk_Loop,Sprint_Loop --map idle=Idle_Loop,walk=Walk_Loop,run=Sprint_Loop [--require idle,walk,run] [--require-rig]
  aura3d assets assemble-character --name hero --body bodyAsset --part hair=hairAsset
  aura3d assets list
  aura3d assets typegen
  aura3d assets bind-game-route-evidence --route <id> --category racing|platformer --assets <id,id,...> --screenshot <png> --geometry-report <json> --composition-report <json> --visual-review <json>
  aura3d assets certify-game-geometry --asset <id> --category racing|platformer
  aura3d assets certify-game-geometry --assets <id,id,...> --category racing|platformer
  aura3d assets thumbnail
  aura3d assets search <query> [--profile ${profileUsage}] [--license cc0|cc-by] [--max-tris N] [--animated] [--json]
  aura3d assets resolve <query> --name <name> [--profile ${profileUsage}] [--license cc0|cc-by] [--max-tris N] [--animated] [--index N] [--candidate-id ID]
  aura3d animation plan|preview|render|package|review|verify [--dry-run]
  aura3d animation scene <new|show|cast add|prop add|set|block|camera|shot|dialogue|render|...>  (agent-native Scene-Tool CLI)
  aura3d doctor
  aura3d check-deploy --dist dist [--release] [--source [src]] [--asset assetId|--no-assets]
  aura3d init --agent all`;
}
