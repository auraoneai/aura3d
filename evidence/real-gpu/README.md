# Real-GPU verification status (2026-10-26)

**No real-GPU frames could be captured by agents.** Every available path was checked and is blocked:

| Path | Result |
| --- | --- |
| GCP L4 VMs (`gcp-gpu-*`, project auraone-493412) | `gcloud-credits` CLI and the `gcp-google-cloud-credits` MCP both fail: `Reauthentication failed. cannot prompt during non-interactive execution`. Policy forbids `gcloud auth login`. GitHub also lists all `gcp-gpu-*` runners as offline now. Owner action: re-authenticate `gcloud-credits` (gchahal@auraone.ai). |
| Azure (`az-auraone-gurbaksh`) | GPU quota is 0 in eastus, eastus2, westus2, westus3, centralus, southcentralus, northeurope, westeurope (NCASv3_T4 limit 0). |
| AWS (`auraone-production-operator`) | The only sanctioned launch pattern is a CPU-only launch template (`lt-001ac3e8c702c66d7`); GPU instance types are not allowed by it. |
| Local Mac | Policy forbids agents running local Playwright/Chrome. |

## What was built instead

`tools/real-gpu/run.sh` + `capture.mjs`: opens the live games in Chrome at DPR 2, records `UNMASKED_RENDERER_WEBGL`, refuses to run on a software renderer, writes screenshots and `report.json`. It is untested end-to-end (syntax-checked only) because no GPU machine was reachable.

## The one command that gives real-GPU evidence

On the owner's Mac (real GPU, retina), from `platforms/aura3d`:

```sh
REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all
```

Then `evidence/real-gpu/<date>/` holds 7 games of screenshots plus `report.json` (renderer string, page errors, failed requests). Commit that folder or send me the screenshots and I read them.

Nothing in this folder says any game is visually correct on a real GPU.
