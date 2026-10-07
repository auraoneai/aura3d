# Sprite and flipbook palettes per genre

Hue and luminance targets so hand-drawn or generated sprites land inside the
route's look instead of reading as pasted stickers.

| Genre look | Sprite family | Hues (sRGB) | Emissive target |
| --- | --- | --- | --- |
| `outdoor-day` | pickups, coins, springs | gold #FFC53D, leaf green #5DBB63, sky blue #56B4F0 | 3× ground luminance |
| `golden-hour` | brake glow, exhaust, UI accents | amber #FF9E3D, burnt orange #D96C2C, charcoal #2B2623 | 4× asphalt |
| `arena-fight` | hit sparks, meter fills, KO flash | impact orange #FF7A2B, meter cyan #46E8FF, KO white #FFFFFF | 5× arena floor |
| `neon-arcade` | pieces, line-clear flash, grid glow | cyan #2EE6FF, magenta #FF3DE8, lime #B8FF2E, violet #8A5BFF | 4× board |
| `night-city` | signs, window glow, puddle decals | sodium #FFB84D, neon red #FF2E6E, cool cyan #4DD8FF | 3× wet street |
| `space` | lasers, shields, engine trails | laser magenta #FF4DFF, shield teal #3DFFE8, trail white | 6× starfield |
| `underwater` | bubbles, biolume, fauna glints | deep teal #1FA8A0, biolume #7DFFD4, coral #FF8A6B | 3× water |
| `product-studio` | callouts, tag glyphs, swatches | brand accent + neutral greys | none — flat read |

## Drawing rules

- Desaturate sprite fills slightly vs. the accent — the grade re-saturates and
  pure-primary fills clip to flat color.
- Keep alpha edges dark-tolerant: a white halo invisible in the texture viewer
  blooms against `night-city` fog.
- Flipbook frames must carry their own lighting direction matching the look's
  key (a spark sheet lit from below fights a `golden-hour` key).
- UI glyphs in DOM HUD use the look's foreground color, not the world palette.
