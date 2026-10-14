# Gallery Shift

Gallery Shift is a top-down stealth heist rebuilt single-path (B5 PORT) on
its salvaged vision core. Every URL boots `src/main.ts`; the former
legacy/v2 dispatcher is deleted.

## What travelled, what was trashed

The salvaged modules `src/gameplay/{vision,guard,thief,floor}.ts` travel
whole from the previous route, with their 37 deterministic unit cases
(`tests/unit/apps/gallery-shift-{vision,patrols}.test.ts`) unchanged.
`floor.ts` travels whole — not as layout-data extraction — because it
imports nothing but public `physics` and carries the Rapier builder whose
real `world.raycast` occlusion is the vision system's headline proof.
Only `gallery-world-candidate.ts` (the trashed GLB-interior catalog
binding) and the v2 scene were deleted. The museum interior in
`src/main.ts` is fresh construction from the salvaged `FloorLayout`
rects — the same rects that build the physics colliders — rendered with
two admitted typed props (`aura.assets.json`): the Quaternius crate and
modular wall panel. Thief/guard figures are tinted instances of the same
typed crate; the salvaged clip-name constants (`GUARD_CLIPS`,
`THIEF_CLIPS`) wait for admitted rigs with matching clips (see
`art/direction.ts` stand-ins). No reusable stealth/AI kit is claimed.

## Mission

On Floor 1 "Marble Hall": lift both exhibits (hold **E** by a pedestal,
1.2 s), then reach the north service exit. Guard vision is the salvaged
cone + line-of-sight system — 90° cones, 12 m range, occlusion through
public-physics raycasts against the visible walls/cases/pedestals, and a
distance/light-scaled detection meter. Detection at 100% is caught.
Walking emits authored noise (3 m), sprinting 6 m, sneaking 0 m; each
lift escalates guard routes and speed deterministically.

Controls: **WASD/arrows** move, **C** sneak (hold), **Shift** sprint,
**E** hold to lift, **R** reset the round. Caught/escaped counters
persist across resets. `?debug=1` exposes the salvaged thief's test
teleport for deterministic browser specs.

Evidence is published every frame on `window.__aura3dGameSnapshot`:
framed, state, the real detection value, score, caught/escaped counters,
and guard/thief positions. Playable and route-health proofs live in
`tests/playable.spec.ts` and `tests/route-health.spec.ts`.
