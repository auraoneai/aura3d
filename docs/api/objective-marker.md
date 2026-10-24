# Objective marker, compass and canvas minimap

Extracted from the Silt & Signal beacon and compass and the Drift & Deliver minimap (4.1.3).

## `prefabs.objectiveMarker(options)`

Returns scene nodes for a ring, rim, expanding halo and light column (plus an optional arrow). Parts carry runtime ids `<id>-ring`, `<id>-rim`, `<id>-halo`, `<id>-beam`, `<id>-arrow`.

| Option | Default | Meaning |
|---|---|---|
| `id` | `"objective"` | runtime id prefix |
| `diameter` | `4` | ring diameter; every other size scales from it |
| `beamHeight` | `5.45` | column height as a multiple of the diameter |
| `color`, `rimColor`, `haloColor`, `bodyColor` | cyan palette | emissive colours |
| `arrow` | `false` | add a bobbing arrow above the ring |
| `hiddenPosition` | `[0, -400, 0]` | where parts sit when there is no active objective |

```ts
builder.addMany(prefabs.objectiveMarker({ id: "beacon", diameter: 66 }));
// every frame:
const poses = prefabs.objectiveMarkerPoses(active ? [x, y, z] : null, time, { diameter: 66 });
for (const part of ["ring", "rim", "halo", "beam"] as const) {
  const h = app.nodes.require(`beacon-${part}`);
  h.setPosition(...poses[part]!.position);
  h.setScale([...poses[part]!.scale]);
}
```

`objectiveMarkerPoses` is pure: the ring pulses +-3.5%, the halo ripples outward every 1.25 s, the beam sits 170/360 of its height above the target.

## `@aura3d/engine/game`: `compassBearing`, `compassRotationDeg`, `updateCompass`

`updateCompass(needleElement, from, to, yaw)` rotates a needle that is drawn pointing up so it points at `to`, and returns the bearing. Dead ahead (-z at yaw 0) is 0.

## `@aura3d/engine/game`: `drawCanvasMinimap(ctx, spec)`

Redraws a square canvas minimap from a spec: `size`, world `bounds [x0, z0, x1, z1]`, optional `background { fill, radius }`, ordered `layers` (`rect`, `lines`, `points`) and a rotating `marker`. World to pixel is linear over `bounds`. The context type is structural, so a recording fake works in node tests.
