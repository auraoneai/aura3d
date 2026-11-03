# Bundled environment probe sources

These probe assets are historical Aura-baked stand-ins. Their recorded input
images are the CC0 HDR files included in `../hdri/`; the image-source details
and digests are listed in `../hdri/ATTRIBUTION.md`. The independence of the
complete historical bake pipeline has not been established. An independent
rebake from the recorded inputs remains required. Each manifest records its
input source, historical bake reference, and the SHA-256 digests of its probe
files.

- `studio` uses `studio_small_08_1k.hdr`.
- `outdoor` uses `autumn_field_puresky_1k.hdr`.
- `sunset` uses `kloppenheim_06_puresky_1k.hdr`.
- `night` uses `kloppenheim_06_puresky_1k.hdr` at intensity 0.05 and 140 degrees of yaw.
- `indoor` currently reuses the `studio` probe bytes as a labeled stand-in. A distinct independently sourced indoor bake is still required.

The assets are copied into a look-authoring project together with the HDR
attribution. This metadata describes their recorded origin and does not assert
visual quality or device verification.
