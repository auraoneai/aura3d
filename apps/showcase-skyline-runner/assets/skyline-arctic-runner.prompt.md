# Skyline arctic runner source record

Generated on 2026-08-29 with the built-in OpenAI image generation tool for
Aura3D's renderer-owned Skyline Runner hero. The retained transparent PNG is
`skyline-arctic-runner.png`
(`sha256-c45049db9e8dd2092ca6193364f5c9b002f1f600621f3097ba2412e5233d8e3d`).

The character is project-original output and is released by the project under
CC0-1.0. It does not imitate a named game, franchise, character, or artist.

The generator did not emit alpha directly. A correction pass placed the same
character on a chroma-green field; deterministic ImageMagick chroma removal
(`-fuzz 18% -transparent #00ff00 -trim`) created the retained alpha PNG.

## Final character prompt

```text
Create one original premium indie-game side-scroller hero sprite on a fully transparent background (true alpha, no floor, no shadow rectangle, no scenery). A charming small arctic relay runner in crisp stylized low-poly 3D: compact athletic silhouette, deep navy insulated suit, icy-cyan scarf streaming backward, warm coral utility belt and relay badge, pale lavender face with expressive dark eyes, short boots and mitten hands, clearly airborne in a dynamic forward jump toward screen-right. Three-quarter side view so face and running direction are readable. Faceted geometry, polished PBR-like material highlights, coherent with a cobalt winter mountain game world, strong dark/light separation, distinctive silhouette, game-ready cutout, centered with generous transparent padding. No text, no logo, no HUD, no platform, no extra character, no circle frame, no white outline, no glow halo, no watermark, no background color.
```

## Chroma correction prompt

```text
Preserve the exact arctic runner character design, low-poly materials, colors, face, baton, scarf, pose, proportions, and right-facing direction. Replace the entire background, vignette, glow, floor, and shadow with one perfectly uniform flat chroma green field, exact solid RGB #00FF00 from edge to edge. No gradient, no lighting on the background, no texture, no checkerboard, no shadow, no halo, no outline, no extra object, no text, no UI, no watermark. Keep generous green padding around every extremity so the green can be removed deterministically.
```
