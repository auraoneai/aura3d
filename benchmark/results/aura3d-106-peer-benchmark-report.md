# Aura3D 1.0.6 Scoped Peer Benchmark Report

Status: scoped-pass

This report records the current benchmark evidence that is available inside the repository for the 1.0.6/1.0.9 game-runtime work. It is intentionally scoped to Aura3D public agent API evidence and a low-level Three.js-style comparison metrics file. It is not Unity, Unreal, or Babylon parity evidence.

## Metrics

Source: `tests/reports/agent-api-side-by-side-comparison.json`

| Metric | Value |
| --- | ---: |
| Aura draw calls | 333 |
| Aura non-dark pixels | 45,866 |
| Three.js-style children | 75 |
| Three.js-style non-dark pixels | 13,289 |

## Screenshot Evidence

| Screenshot | Bytes | SHA-256 |
| --- | ---: | --- |
| `tests/reports/current-route-health/screenshots/apps-hello-world-typed-asset.png` | 76,063 | `86a0cd80a904412964b32e3530df2f3e60437d2e22b59efe208372d13a82ca40` |
| `tests/reports/current-route-health/screenshots/apps-camera-path.png` | 63,147 | `31ee40ac0ed12bb505e37eb61e1b380b345bf00092a8478c18b99fc881bc04bd` |
| `tests/reports/current-route-health/screenshots/apps-material-lighting.png` | 81,887 | `efc8d801e1b161c561337e05ee727fd26b19928e64726f0aa9e511bad85568bf` |

## Claim Boundary

This report proves that benchmark reporting has current screenshot artifacts and machine metrics. It does not rank Aura3D above Unity, Unreal, or Babylon. Real Unity/Unreal baseline reports remain separate external-editor work and must include their own screenshot hashes and runner metrics before parity claims are allowed.
