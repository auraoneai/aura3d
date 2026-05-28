# Troubleshooting

- Missing canvas: ensure the selector passed to `createAuraApp("#app", ...)`
  exists or pass a real canvas element.
- Missing asset: run `assets add` and import the generated `assets` object.
- Failed GLB/glTF load: run `assets validate` and check file paths.
- Unsupported texture: use png, jpg, jpeg, webp, or ktx2.
- Deployment missing files: run `check-deploy` and upload hashed assets.
