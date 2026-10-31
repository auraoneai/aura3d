# Real-GPU attempt for IC-07, LIVE-1 and P-3 (2026-10-30)

`probe.mjs` drives production in Chrome on a real GPU (`--use-angle=vulkan`) and prints one `RG <json>` line per sample:

- IC-07: Iron Crown with `?vfx=on&vfxdebug=1&autoplay=1` for 3 minutes; emitter and particle counts from `window.__AURA_VFX_DEBUG__()`, plus any `VFX_LINGERING_PARTICLES` / `VFX_UNSTOPPED_EMITTER` code in `app.diagnostics()`. Remove the `effects.runtime = "off"` override in `apps/showcase-iron-crown/src/main.ts` if no lingering code appears and particle counts fall back between hits.
- LIVE-1: Aura Diamond 3D autoplay for 15 minutes, a new park every 150 s; JS heap, renderer `crash` events and page errors.
- P-3: Serpentine Sky Run in a run; centre (runner) against border luma.

Run: `npm i playwright-core@1.59.1`, then `node probe.mjs ic07,live1,p3` on a machine with an NVIDIA or Apple GPU, Chrome at `/usr/bin/google-chrome-stable` (edit `executablePath` on a Mac) and internet access.

Why it did not run here: Azure (`az-auraone-gurbaksh`) has no NC/NV quota in any region; GCP (`gcloud-credits`) needs an interactive re-login; on AWS the gated runner template (`lt-001ac3e8c702c66d7`) launched `g6.xlarge` (`i-0d1d957d121818e48`) and `g6.2xlarge` (`i-08f052f627aa105a4`) in `us-west-2d`, but that subnet reaches only the allowlisted package proxy and an S3 gateway endpoint, so the SSM agent on the NVIDIA Deep Learning AMI timed out (`dial tcp ...:443: i/o timeout` to `ssm.us-west-2.amazonaws.com`). Both instances were terminated; 0 instances and 0 volumes remain.
