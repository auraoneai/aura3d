# Sketchfab Asset Corpus Results

Generated: 2026-05-29T07:54:41.187Z

This document records authenticated Sketchfab CC0 asset evidence for the
`ProductContextPRD.md` bring-your-own-assets claim. Downloaded model files
live only under ignored `tests/reports/` workspace paths and are not
committed.

## Summary

| Check | Result | Detail |
|---|---:|---|
| `sketchfab-api-token-present` | pass | SKETCHFAB_API_TOKEN was supplied through the process environment and was not written to disk. |
| `sketchfab-download` | pass | Mermaid2 glb downloaded into ignored test workspace (6382264 bytes). |
| `sketchfab-assets-add` | pass | Added sketchfabCc0 -> /aura-assets/sketchfabCc0.3b9749a3.glb; Wrote aura.assets.json; Wrote src/aura-assets.ts |
| `sketchfab-assets-validate` | pass | manifest asset format=glb, materials=1, textures=2, animations=0 |
| `sketchfab-typegen-created` | pass | src/aura-assets.ts generated for the Sketchfab asset. |

## Source And License

- Source: Sketchfab API model `Mermaid2` (`01371cd3990f4d9587d40244b5e2a0a8`).
- License: CC0 Public Domain.
- Imported asset path: `assets/external/sketchfab-cc0/model.glb`.
- Format tested: glb.
- Local workspace: `tests/reports/sketchfab-asset-corpus-workspace`.

## Verdict

Authenticated Sketchfab CC0 download, asset add, validation, and typegen pass.

