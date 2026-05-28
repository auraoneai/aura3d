# Cinematic Export Bundle

The cinematic previs export bundle packages the generated scene and the evidence needed to inspect it. It should make clear what came from a fixture, a mock provider, a live provider, local assets, procedural assets, or fallbacks.

## Bundle Contents

Recommended export layout:

```text
cinematic-export/
  scene.ir.json
  scene-patches.json
  provider-provenance.json
  asset-provenance.json
  diagnostics.json
  quality-report.json
  screenshots/
    viewport.png
    timeline-frame-0000.png
  manifest.json
  README.md
```

The browser template may export a single JSON file that contains these sections inline. A production route can export a zip or directory with separate artifacts.

## Required Fields

`scene.ir.json`:

- schema version;
- prompt;
- quality target;
- provider mode;
- camera, lighting, environment, material, object, VFX, and timeline intent;
- asset requirements;
- diagnostics.

`provider-provenance.json`:

- provider mode;
- provider family, when live mode is used;
- model name, if configured and safe to expose;
- generated time;
- prompt hash;
- fallback status;
- network usage flag;
- validation result.

`asset-provenance.json`:

- asset manifest schema;
- asset IDs;
- roles;
- paths or procedural identifiers;
- tags;
- resolved, generated, or placeholder status;
- unresolved asset diagnostics.

`quality-report.json`:

- quality gate schema;
- generated time;
- provider mode;
- backend;
- pass/fail;
- failures;
- screenshot references;
- secret audit result;
- claim boundary result.

## Secret Handling

Exports must never include:

- raw provider API keys;
- authorization headers;
- cookies;
- bearer tokens;
- server environment dumps;
- full upstream provider request objects that include credentials.

Live provider exports can include provider family and model metadata when safe, but should not include server-only transport details.

## Claim Boundary

An export bundle is evidence for realtime previs and diagnostics. It is not proof of final-film quality. README files inside bundles should use this boundary:

> This export contains an Aura3D cinematic realtime previs scene, diagnostics, quality evidence, and asset provenance. It is not a final-film render or studio-final asset package.

## Failure Exports

When generation fails, export should still be useful. Include:

- the last valid fixture or mock scene;
- sanitized provider error;
- fallback reason;
- validation failures;
- unresolved asset diagnostics;
- quality gates that failed.

Do not export a blank scene as if it were a successful live provider result.
