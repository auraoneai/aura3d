# `effects.toon`

A cel pass over the final image: luma banding plus a Sobel outline, promoted from the Silt & Signal port. It returns a post pass for `app.post.addPostPass(...)` (it is `effects.shaderPass` with the toon fragment prefilled), inserted after tone mapping.

```ts
app.post?.addPostPass?.(effects.toon({ name: "cel", bands: 5, outline: 0.75, size: [canvas.width, canvas.height] }));
// on resize, keep the outline one pixel wide:
app.post?.setPassUniform?.("cel", "u_texel", [1 / canvas.width, 1 / canvas.height]);
```

| Option | Default | Meaning |
|---|---|---|
| `name` | `"toon"` | Pass name, used with `setPassUniform` |
| `bands` | 5 | Luma steps, 2 to 64 |
| `bandMix` | 0.75 | 0 smooth image, 1 fully banded |
| `outline` | 0.75 | Outline strength, 0 disables |
| `ink` | `[0.05, 0.09, 0.11]` | Outline colour, linear RGB |
| `edgeStart`, `edgeEnd` | 0.26, 0.6 | Sobel magnitude where the outline starts and is fully on |
| `size` | `[1280, 720]` | Render-target size in device px, sets `u_texel` |
| `order` | `"after-tonemap"` | Post slot |

Out-of-range or non-finite options throw `invalid-material-spec` instead of being ignored. This is a screen-space approximation of toon shading: materials stay PBR, so it bands the lit result rather than the light terms. It does not replace Toon or Matcap materials.
