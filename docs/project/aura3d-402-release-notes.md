# Aura3D 4.0.2

Released 2026-10-19. All public packages ship the same version.

## Highlights

- **15 showcase games restored on 4.0.2.** The full playable slate is rebuilt on de-interleaved 16-bit Meshy 3D assets, with boot-gated readiness and route-health evidence.
- **New playable routes.** Iron Crown, Pip's Big Leap, Aura Hoops 3D, Aura Diamond 3D, Aura FC 3D, Red Zone 3D, Aura Links 3D, Bunker Zero, Slingshot Siege, Dot Dash 3D, and Cross Hop join the four flagship games.
- **Character and runtime fixes.** Rigged Meshy GLBs pass the skeletal acceptance checks; arm/torso skinning tears and hand flapping are fixed; device-killing scene remounts are eliminated; focused buttons no longer consume game keys.
- **Engine and asset fixes.** Primitive builders never emit NaN matrices from two-element sizes, WebGL2 device render targets support save/restore, and legacy SHA-256 manifest entries normalize to the canonical hash format.
- **Site and brand.** The marketing and docs surface runs the light Daylight design with licensed Graphik, DIN Pro, and TT Commons Pro Mono, plus new social preview renders.

## Install

```bash
npm install @aura3d/engine@4.0.2
# or
pnpm add @aura3d/engine@4.0.2
```

```bash
npx create-aura3d@4.0.2 my-scene --template product-viewer
```

## Verification

- Public packages: `npm view <package>@4.0.2 version` resolves for every published package.
- Scaffold: `npx create-aura3d@4.0.2 my-scene --template product-viewer` installs and boots from a clean cache.
- Route health and visual evidence: see the showcase evidence in the repository and `aura3d check-deploy`.

## Links

- Repository: https://github.com/auraoneai/aura3d
- npm: https://www.npmjs.com/package/@aura3d/engine
- Documentation: https://aura3d.auraone.ai/docs/agent-quickstart.html
- Full 4.0 release notes: https://github.com/auraoneai/aura3d/blob/main/docs/project/aura3d-400-release-notes.md
