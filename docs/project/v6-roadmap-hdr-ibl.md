# HDR IBL

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 HDR setup uses real Radiance HDR files from `fixtures/environment-corpus/manifest.json`. The PBR/HDR pipeline builds renderer lighting resources from pinned HDR files and records environment id, source path, intensity, exposure, tone mapping, and texture bytes.

Example setup:

```ts
const hdrPipeline = createV6PbrHdrPipelineFromRadiance(hdrBytes, {
  id: "studio-small-08",
  label: "Studio Small 08",
  intensity: 1.15,
  backgroundIntensity: 0.85,
  rotation: 0.15,
  toneMapping: { operator: "filmic", exposure: 1, whitePoint: 11.2 }
});
```

Every accepted flagship screenshot must include a real HDR environment id.

Primary evidence:

- `tests/reports/production-runtime-pbr-hdr-readiness.json`
- `tests/reports/production-runtime-gallery-readiness.json`
