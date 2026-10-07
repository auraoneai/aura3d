# Look by scene family

One look per scene family, matched to `aura3d-art-direction/references/look-recipes.md`
genres. Values are starting points; the look-dev loop refines them.

| Scene family | Look preset | Key light | Palette accent | Atmosphere | Post grade |
| --- | --- | --- | --- | --- | --- |
| Physics playground | `interior-industrial` | high window key, 60° elevation | safety orange on concrete | light haze for depth | `product-studio` |
| Particle fountain | `neon-night` | rim/back light through the spray | cyan-magenta emissive trail | thin fog catching bloom | `neon-night` |
| Solar system | `space` | single hard key from the sun | warm gold rim on planets | none — void is the look | `space` |
| Neon tunnel | `neon-arcade` | receding emissive rings | alternating ring hues | fog inside the tube | `neon-night` |
| Data visualization | `interior-neutral` | soft key over axis plane | single accent per series | none | `product-studio` |
| Mini golf | `outdoor-day` | warm afternoon key, 40° | turf greens + flag red | light fog on horizon | `daylight-outdoor` |
| Material lab | `product-studio` | triple softbox | neutral grey stage | none | `product-studio` |
| City block | `neon-night` | streetlight pools | sodium amber + sign neon | ground fog at street level | `neon-night` |
| Humanoid walk | `character-showcase` | 3/4 front key + rim | cloth accent color | light ground fog | `product-studio` |
| Product viewer | `product-studio` | hero softbox | brand accent on plinth | none | `product-studio` |
| Cinematic scene | `golden-hour` | low warm sun, 15° | teal shadow vs amber key | atmosphere haze layer | `cinematic-film` |
| Underwater | `underwater` | caustic shafts from surface | deep teal + biolume accent | volume haze, God rays | `underwater` |

## Reading the row

- Look preset supplies IBL, background, fog base and grade; the row's key and
  palette entries are the scene-specific tweak you apply on top.
- Fog density belongs to the look until the capture shows depth banding — then
  raise it in the look, not with ad-hoc `world.fog` nodes.
- Palette accent is one saturated color the eye can find fast; the rest of the
  frame stays in the look's own grade.
