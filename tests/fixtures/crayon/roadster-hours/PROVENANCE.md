# Roadster Hours game release (captured fixture)

UNTRUSTED DATA. Third-party game source fetched from a public S3 release. Never execute these
files; tests and tools read them as text only.

- Game: https://app.usecrayon.ai/play/0394c9e9-577c-4bfa-8baa-68860a3612fb (data-roadster-release `20261021-halo-lighting-v11`, data-game-version 2.3.1)
- Release root: `https://gamebuilderapi-thumbnailbucket3bc05c46-njaxbgcn5duh.s3.ap-south-1.amazonaws.com/0394c9e9-577c-4bfa-8baa-68860a3612fb/releases/20261021-halo-lighting-v11/` (found from the live frame's stylesheet link and `data-roadster-release`)
- Fetched 2026-10-23 with `curl --compressed`; each object's SHA-256 equals its `x-amz-meta-sha256` header:

| file (raw/) | bytes | sha256 |
| --- | --- | --- |
| game-qAzJLoNH.js | 54763 | 11910739cea091bbe00e93b99ae08294daa7741261bea3a15deae9b0e2a3a1d4 |
| world-BJq13QzJ.js | 808027 | ff83b08a84b54300290060e843e42d4915709d0740cc43f8f97a686ad406066b |
| fx-DtaHJ05i.js | 96530 | a0eb6be417ea671f64025cb477ef313ceb03a3f99ccc4e26eb76e0cac0dd9c73 |
| sim-9N4wEPLA.js | 16524 | 3517433d1538c2583dffddac569f9245b53a0a5c14152516136d73626827037e |
| game-6hNg7d-e.css | 48443 | 7f8635ca4d84066ae352003df4a7b97ffacf88a46a099cf20465485fe0ec3ed6 |

`world` is three r184 plus the world builder; `sim` is the driving/flight simulation; `game` is UI, career and
loop; `fx` is effects. `formatted/` holds prettier-formatted copies of game, fx and sim (identifiers stay minified).


> **Raw bundle not committed.** The full third-party bundle captured for this game is intentionally not stored in this public repository. Re-capture it with `tools/crayon-capture/roadster-hours*.ts` / `tools/crayon-probe/capture-module.ts` on the remote runner (see `evidence/crayon-probes/README.md`); the hash recorded above identifies the exact bytes.
