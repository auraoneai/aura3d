# Agent prompts — Aura3D Quality Rebuild

These are ready-to-paste prompts for running the rebuild with coding agents (Claude Code, Codex, Kiro, OpenCode). Each prompt is self-contained. It points the agent at its PRD, at `CONTRACTS.md` and at the master plan, and carries the lane's owned paths, contracts, flags, scope, first PRs, acceptance gate and working rules.

## How to run all 15 in parallel

1. Start `PR-00-contract-bootstrap.prompt.md` first. It pushes the PR 0a branch within hours.
2. Start all 15 `LANE-NN-*.prompt.md` prompts at the same time, each in its own agent session and its own git worktree or clone, for example `git worktree add ../aura3d-lane02 main`.
   - Lanes branch from the PR 0a branch once it is pushed. Before that, they work in new lane-owned files.
   - No lane waits for another lane or for PR 0 to merge.
3. Lane 15 owns PR 0. If you run `LANE-15` and `PR-00` as separate agents, the lane-15 agent coordinates through the PR 0a branch instead of redoing it.
4. Every Thursday from 2026-10-15, integration checkpoints run the 18 benchmark scenes and 18 games with all flags on and off, on GitLab macOS. Every 4th checkpoint (IC-4, IC-8, IC-12, …) is a G-PANEL round, the only place visual acceptance is decided. Checkpoints never block lane work.

## CI: GitHub plus GitLab

All CI routing is in `../CI-ROUTING.md`, and every prompt points agents there.
- **PR gates** run on GitHub Actions; the repo is public, so they're free.
- **Captures, benchmarks and perf runs** go to the GitLab mirror's macOS runners, which have a 50,000-minute monthly quota. They go through `.github/workflows/qr-gitlab-ci.yml`, which syncs the branch, triggers the pipeline and brings results back as a GitHub check plus an artifact.
- **Budget:** each lane gets about 2,400 GitLab compute minutes a month.

| Prompt | Lane |
|---|---|
| `PR-00-contract-bootstrap.prompt.md` | PR 0 contract bootstrap (lane 15, days 0-2) |
| `LANE-01-rendering-core-color-hdr-pbr.prompt.md` | Rendering core, scene graph, color, HDR, PBR |
| `LANE-02-lighting-ibl-reflection-shadows.prompt.md` | Lighting, IBL, reflections, shadows |
| `LANE-03-postprocessing-aa-tonemap-cinematic.prompt.md` | Post, AA, tone mapping, cinematic |
| `LANE-04-materials-textures-gltf-fidelity.prompt.md` | Materials, textures, glTF fidelity |
| `LANE-05-asset-pipeline-technical-art-toolchain.prompt.md` | Asset pipeline and technical-art toolchain |
| `LANE-06-animation-characters-skinning-ik.prompt.md` | Animation, characters, skinning, IK |
| `LANE-07-vfx-particles-atmospherics.prompt.md` | VFX, particles, atmospherics |
| `LANE-08-camera-controls-game-feel.prompt.md` | Camera, controls, game feel |
| `LANE-09-shared-game-runtime-route-extraction.prompt.md` | Shared game runtime and route-local extraction |
| `LANE-10-world-building-environment-systems.prompt.md` | World building and environment systems |
| `LANE-11-webgpu-gpu-architecture-performance-tiers.prompt.md` | WebGPU, GPU architecture, quality tiers |
| `LANE-12-visual-benchmark-regression-infrastructure.prompt.md` | Visual benchmark, regression, review panel |
| `LANE-13-agent-authoring-skills-templates-defaults.prompt.md` | Agent authoring, skills, templates, defaults |
| `LANE-14-eighteen-game-rebuild-program.prompt.md` | The 18-game rebuild |
| `LANE-15-api-package-architecture-consolidation.prompt.md` | API and package consolidation, contract custodian |

## Regenerating

The lane prompts are generated from `AURA3D-QUALITY-MASTER-PLAN.md` §2A, §2B and §8 and from each PRD's section headings. If those tables change, regenerate the prompts so they never disagree with the plan.
