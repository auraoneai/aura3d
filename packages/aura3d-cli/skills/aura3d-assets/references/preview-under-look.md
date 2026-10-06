# Previewing assets under a look

A GLB that survives a neutral viewer can still fail the real scene's lighting.
Evaluate candidates under the route's look preset.

| Look | What it exposes | Reject signal |
| --- | --- | --- |
| `product-studio` | material honesty, silhouette edge quality | faceted normals, muddy PBR, bad pivot on plinth |
| `golden-hour` | warm key + teal shadow separation | specular wash, albedo too dark to read at dusk |
| `night-city` | neon rim, wet reflections, dark pools | silhouette disappears into shadow, emissive bloom-out |
| `outdoor-day` | full daylight exposure, horizon fog | washed-out albedo, no AO at contact points |
| `interior-warm` | warm pools, wood/fabric pairing | cold grey materials fight the grade |
| `space` | single hard key, black void | anything mid-grey vanishes; no fill light forgiving |
| `underwater` | teal volume, caustic shimmer | high-contrast speculars shimmer to noise |
| `arena-fight` | top spot + rim, dark crowd | midtones crush to black outside the pool |

## Checks at preview time

1. Spin the model `orbit` once under the look — a silhouette that dies at
   three-quarter back is a bad candidate.
2. Contact: feet/wheels/anchor inside the look's ground shadow, not beside it.
3. Emissive parts bloom only where the grade expects glow (pickups, signage);
   an unbounded emissive channel reads as a bug.
4. Palette: the asset's dominant hue must sit inside the genre palette or be
   the declared accent — clashing saturation reads as wrong-asset even when
   the mesh is fine.
