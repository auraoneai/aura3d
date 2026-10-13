# Mech Hangar

**Label:** `prototype` · **Route:** `/apps/showcase-mech-hangar/`

Single-path rebuild: `src/main.ts` boots at every URL via `createGame`; the
former legacy/v2 dispatcher, gameplay shims and the MH-2M parts catalog are
deleted.

## Honest loop

Assemble → test-drive checklist → rating.

1. **Assemble.** `1` selects the chassis slot, `2` the support slot; arrow
   keys cycle the part. Only slots backed by a real typed asset ship: three
   rigged Quaternius robot GLBs as whole-chassis options, and an optional
   flying gun-drone support attachment. No separable chassis/arms/legs/weapon
   GLB parts exist in the repo, so none are offered — the missing typed asset
   is a rigged modular mech-part set with authored sockets.
2. **Lock.** `Enter` locks the build and starts the test drive. Stats are
   limited to what the loop consumes: speed drives lane move speed, power
   drives strike damage (`src/parts.ts`).
3. **Test drive.** `A`/`D` (or arrows) move along the hangar lane; `J` strikes.
   Down all three target dummies (rigged robot GLBs) to finish.
4. **Rating.** S ≤ 20 s, A ≤ 35 s, B otherwise. `R` returns to assembly.

There is no rival bout. The previous route-local fighting sim and its
MH-2M part binds were trashed with the catalog; a bout is not faked here.

## Evidence

`window.__aura3dGameSnapshot` publishes `framed`, `state`, `attachedParts`,
`stats`, mech position, the checklist, elapsed time and rating every frame.

## Claim boundary

Prototype. Chassis bounds/scales are authored approximations from the GLB
joint spans; visual scale and clip playback are UNVERIFIED in a browser for
this rebuild. Independent human visual review is pending.
