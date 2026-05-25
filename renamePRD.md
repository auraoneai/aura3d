# Aura3D Rename PRD

Status: planning artifact
Generated: 2026-05-25
Repository root audited: `/Users/gurbakshchahal/G3D`
Target repository identity: `/Users/gurbakshchahal/Aura3D`

## Objective

Rename the entire application, package surface, developer tooling, documentation, examples, tests, generated outputs, and release artifacts from the legacy Galileo3D/G3D identity to the Aura3D/A3D identity.

The final state must not contain legacy Galileo, Galileo3D, G3D, g3d, `@galileo3d`, `create-g3d`, `@g3d`, or `.g3d` names anywhere in the codebase, generated artifacts, package metadata, test fixtures, docs, or tracked release bundles. Any historical evidence that must preserve old names must be moved outside the codebase or rebuilt into a new Aura3D artifact; it must not remain as tracked legacy text or path content if the final gate is strict.

## Audit Method

Six parallel read-only audit slices were run against the current worktree:

1. Filesystem identity and root/package configuration.
2. Core packages and public/runtime APIs under `packages/**`.
3. Applications and user-visible frontend surfaces under `apps/**`.
4. Examples, templates, benchmarks, and `packages/create-g3d/templates/**`.
5. Tests, tools, docs, CI, root PRDs, reports, and workflows.
6. Repository-wide hidden/no-ignore legacy term inventory with generated/static artifacts included and dependency directories pruned.

The worktree was already dirty when audited. This PRD treats the current worktree as authoritative and does not revert or rewrite existing changes.

## Current Evidence Snapshot

Repository-wide hidden/no-ignore text scan, with `.git` and every `node_modules` tree pruned:

| Term | Text Occurrences | Text Files | Path Entries |
| --- | ---: | ---: | ---: |
| `Galileo3D` | 1,075 | 289 | 0 |
| `galileo3d` | 4,498 | 1,372 | 1 |
| `GALILEO3D` | 1,091 | 195 | 0 |
| `Galileo` | 1,983 | 336 | 0 |
| `galileo` | 6,618 | 1,516 | 79 |
| `GALILEO` | 1,092 | 196 | 0 |
| `G3D` | 9,658 | 1,035 | 78 |
| `g3d` | 8,436 | 1,137 | 152 |
| `@g3d` | 6 | 6 | 0 |
| `create-g3d` | 603 | 84 | 150 |
| `.g3d` | 660 | 176 | 0 |

Repository-wide legacy text impact:

| Classification | Occurrences | Files | Notes |
| --- | ---: | ---: | --- |
| Generated/evidence artifact | 18,870 | 1,203 | `dist/`, `packages/*/dist`, `tests/reports`, `release-artifacts`, source maps, patches, packaged artifacts. |
| Runtime class/symbol | 8,901 | 813 | `G3D*` classes, shader symbols, CSS/data keys, env vars, globals, diagnostics. |
| Package/import identifier | 4,530 | 681 | `@galileo3d/*`, `@g3d/*`, `create-g3d`, package exports, lockfile, config aliases. |
| User-facing copy | 3,346 | 510 | README/docs/HTML/titles/issue templates/PRD text. |
| False-positive/needs-human-decision | 73 | 30 | Benchmark labels, historical comparison lanes, one accidental `G3D` byte sequence in a glTF base64 payload. |

Extension classification is required before implementation starts. Use the inventory to assign each legacy hit to a source owner, generated-output owner, asset owner, docs owner, or historical-artifact decision:

```bash
rg --hidden --no-ignore -a -l -F \
  -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
  -e 'Galileo' -e 'galileo' -e 'GALILEO' \
  -e 'G3D' -e 'g3d' -e '@g3d' -e 'create-g3d' -e '.g3d' \
  . -g '!**/.git/**' -g '!**/node_modules/**' |
  awk '
    function ext(path, base,n,a) {
      n=split(path,a,"/");
      base=a[n];
      if (base !~ /\./) return "[no extension]";
      sub(/^.*\./,"",base);
      return "." base;
    }
    {count[ext($0)]++}
    END {for (e in count) print count[e], e}
  ' | sort -nr
```

Tracked or path-level legacy names found:

| Type | Count |
| --- | ---: |
| Legacy path entries across full scan | 309 |
| Legacy file paths | 260 |
| Legacy directory paths | 49 |
| Source/control paths requiring direct rename | 27 primary path groups |
| Generated/dependency/archive paths requiring clean, rebuild, remove, or external archival | 150+ path entries |

Second-pass root-level file counts with legacy text from the local scan. This pass included generated `dist/**` output and this PRD itself, so the final cleanup plan must account for both:

| Root | Files With Hits |
| --- | ---: |
| `.github` | 8 |
| `.gitignore` | 1 |
| `CHANGELOG.md` | 1 |
| `FinalPRD.md` | 1 |
| `README.md` | 1 |
| `apps` | 203 |
| `benchmarks` | 30 |
| `dist` | 845 |
| `docs` | 201 |
| `eslint.config.js` | 1 |
| `examples` | 262 |
| `execute.md` | 1 |
| `fixtures` | 3 |
| `index.html` | 1 |
| `package.json` | 1 |
| `packages` | 481 |
| `playwright.config.ts` | 1 |
| `pnpm-lock.yaml` | 1 |
| `prompt.md` | 1 |
| `release-artifacts` | 105 |
| `renamePRD.md` | 1 |
| `templates` | 83 |
| `tests` | 362 |
| `tools` | 272 |
| `tsconfig.base.json` | 1 |
| `vite.config.ts` | 1 |
| `vitest.config.ts` | 1 |

### Second-Pass Newly Explicit Scope

The first audit already identified the core rename. The second pass made these additional risk areas explicit:

- `CHANGELOG.md` and `.gitignore` contain root-level legacy branding and must be included in the root doc/config pass.
- `pnpm-lock.yaml` contains old package keys, workspace links such as `link:packages/create-g3d`, and package snapshots. It must be regenerated from renamed manifests, then checked for old keys; do not hand-edit it except as a last-resort lockfile repair.
- Earlier audit output and release handoff manifests contained legacy-bearing script aliases such as `v4:templates`, `v5:templates`, `v6:templates`, `verify:v3-rendering`, `verify:v4-codebase-root`, `verify:v4-codebase-root-contracts`, and `verify:v4-rendering`; the current root `package.json` script names are listed in the third-pass section below.
- `fixtures/**` and `tests/assets/**` contain semantic fixture metadata, schema assertions, glTF generator strings, and one accidental `G3D` sequence inside a base64 data URI. These need a structured asset pass, not only a source-code rename.
- `dist/**` is a major tracked/generated root with path-level and text-level old names, including compiled test files and `three-compat` migration output. A clean rebuild or removal of tracked generated output is mandatory.
- `release-artifacts/**` contains both text evidence handoff files and a package tarball with old package metadata. Tarball contents must be inspected, not just filenames.
- `renamePRD.md` necessarily contains legacy terms as a planning artifact. Before the final strict zero-legacy gate, this file must be moved outside the tracked repo, removed, or replaced by a sanitized completion record that does not contain old names.
- Hidden/system artifacts such as `.DS_Store`, `tests/.DS_Store`, and `tests/reports/.DS_Store` should be removed if tracked or staged, and ignored if not already ignored. They are not semantic rename targets, but they add audit noise.

### Third-Pass Newly Explicit Scope

The third pass focused on rename surfaces that were still too implicit:

- Current root script names in this checkout are not the earlier `v4:*`/`v5:*` names. The legacy-bearing script keys observed now are `external-parity:templates`, `three-compat:templates`, `production-runtime:templates`, `verify:foundation-rendering`, `verify:external-parity-codebase-root`, `verify:external-parity-codebase-root-contracts`, and `verify:external-parity-rendering`, plus `wow:screenshots` and `advanced-gallery`.
- GitHub and external-evidence workflows include env vars beyond browser/WebGPU vars: `G3D_PUBLIC_DEMO_URL`, `G3D_UNITY_EDITOR`, `G3D_UNITY_SEARCH_ROOTS`, `G3D_UNITY_PROJECT_PATH`, `G3D_UNREAL_EDITOR`, `G3D_UNREAL_SEARCH_ROOTS`, `G3D_UNREAL_PROJECT_PATH`, `G3D_EXTERNAL_ASSET_IMPORT_SAMPLE`, and `G3D_RUN_UNITY_UNREAL_CLI_SMOKE`.
- Tooling/report env vars include `G3D_RELEASE_RUN_ID`, `G3D_GITHUB_REPOSITORY`, `G3D_EXTERNAL_DEMO_EXPORT_DIR`, `G3D_EXTERNAL_DEMO_MANIFEST`, `G3D_INDEPENDENT_REPRODUCTION`, `G3D_INDEPENDENT_REPRODUCTION_EVIDENCE`, `G3D_FAKE_PNPM_LOG`, and `G3D_FAKE_PNPM_EXIT`.
- Release handoff/runbook material contains the old GitHub repo slug `gchahal1982/G3D2025` and public URL examples such as `https://gchahal1982.github.io/G3D2025/`. A canonical Aura3D GitHub slug must be chosen before these can be rewritten.
- Runtime/report ids are broader than the initial schema examples. High-frequency ids include `g3d-v2-execution-state`, `g3d-static-demo-integrity-v1`, `g3d-public-demo-deployment-v1`, `g3d-v4-external-evidence-handoff-package-v1`, `g3d-v4-external-evidence-transfer-v1`, `g3d-v4-external-baseline-command-plan-v1`, `g3d-v9-*parity/v1`, `g3d-v8-threejs-parity/v1`, and `g3d-product-configurator-*`.
- DOM/CSS/id tokens are broader than the known v6 classes. Additional families include `g3d-template-canvas`, `g3d-brand`, `g3d-app`, `g3d-viewport*`, `g3d-statusline`, `g3d-sidebar`, `g3d-scene-*`, `g3d-inspector*`, `g3d-workbench`, and `g3d-diagnostics*`.
- Test-only package fixtures include `@galileo3d/restore-target`, `@galileo3d/external-host-fixture`, and `@galileo3d/test`; these are generated inside unit tests and must be renamed even though they are not real packages.
- Package subpath imports are not limited to top-level packages. Observed subpaths include `@galileo3d/engine/advanced-runtime`, `@galileo3d/engine/production-runtime`, `@galileo3d/engine/workflows/production`, `@galileo3d/engine/rendering/v6`, `@galileo3d/engine/rendering/v9`, `@galileo3d/engine/assets/asset-corpus`, `@galileo3d/engine/assets/advanced-gallery`, `@galileo3d/engine/create-g3d`, `@galileo3d/engine/animation/browser`, and `@galileo3d/three-compat/{controls,loaders,postprocessing}`.
- Additional fixture/data metadata keys include `g3d_generated_asset_id`, `g3d_acceptance_role`, `g3d_transparency_sort_unit`, `g3d_texcoord0`, and provenance strings like `g3d-prov-*`.
- Raw text scans can surface accidental base64-like tokens beyond the known `terrain.gltf` hit, such as `YG3DvixbSj`. The final strategy must be raw-text clean, not only semantically clean.

### Fourth-Pass Newly Explicit Scope

The fourth pass focused on packaging, raw byte/text scans, generated reports, and code that intentionally preserves old names:

- `rg -a` raw text scanning finds more impacted files than normal text scanning, especially under `tests/**` and `fixtures/**`. The final audit must include a raw/binary-aware gate, not only the default `rg` gate, because default `rg` can skip binary-like files.
- Generated Jest/Vitest/Playwright JSON reports such as `tests/reports/integration.json`, `tests/reports/unit.json`, `tests/reports/visual*.json`, and release-handoff reports contain absolute paths like `/Users/gurbakshchahal/G3D/...`. Regenerate or remove these after the repo path rename; do not manually patch stale test reports.
- Handoff/runbook/test fixtures contain branch refs such as `preserve/g3d-v2-execution-state`, `refs/heads/preserve/g3d-v2-execution-state`, and commands like `git push origin preserve/g3d-v2-execution-state`. Rename those to the chosen Aura3D branch convention or externalize the historical handoff files.
- `.npmignore` has no legacy text today, but it intentionally keeps `dist/` and `package.json` in publish output. Because `dist/` currently contains old generated paths and text, package publishing must be verified with a dry-run pack gate after regeneration.
- `tools/naming-taxonomy/**` and the contextual-alias tooling contain compatibility decisions that explicitly allow keeping old `create-g3d`/template aliases until proven. Those allowlists must be revised so they fail on old names in the final state.
- Visual parity tools still use variables and fixtures such as `galileoScreenshotPath`, `galileoPath`, `galileo-product.png`, and local engine lists like `galileo,threejs,babylon`. These are not only prose; they are report contracts and visual-baseline file/path fields.
- Unit tests synthesize old temporary directories and bad fixture content, for example `mkdtempSync(..., "g3d-tools-")`, `g3d-v3-validation-`, `g3d-v9-report-audit-*`, and files containing `Galileo3D is better than Three.js.`. Rename those test-generated strings too.
- External demo bundles under `release-artifacts/**/external-demos/**` can contain minified old runtime strings such as `vendor:"galileo3d"`. These must be rebuilt from renamed source or removed; line-oriented scans are noisy here, so use `rg -a -l` or tar/string inspection.
- Absolute placeholder commands such as `/absolute/path/to/G3D` appear in release handoff package tests and runbooks. Replace with `/absolute/path/to/Aura3D` or externalize those historical files.

### Fifth-Pass Newly Explicit Scope

The fifth pass focused on destructive-change failure modes that can survive a source-only rename:

- Compressed release archives are broader than the single npm-style `.tgz` package. Current archive inventory includes `release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz`, `release-artifacts/v4-external-evidence-handoff.tar.gz`, and `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`. The `.tar.gz` currently contains legacy path names such as `galileo-postprocess.png`, `galileo-hdr.png`, `galileo-pbr.png`, `galileo-product.png`, and `galileo-shadow.png`; the checksum sidecar embeds the old archive filename. Rename/rebuild archives and regenerate checksum sidecars together.
- Operational Git metadata is not covered by repo text scans because `.git/**` is excluded. Current local config still points `origin` to `https://github.com/gchahal1982/G3D2025.git` and `branch.master.merge` to `refs/heads/master`. After the target Aura3D repo/branch policy is chosen, update local remotes/upstreams and any release automation credentials before pushing or publishing.
- Package manifest metadata must be audited as structured JSON, not only with string replacement. Check `name`, `bin`, `exports`, `files`, `typesVersions`, `repository`, `bugs`, `homepage`, `publishConfig`, `keywords`, `description`, scripts, and every dependency bucket. Current high-risk manifest fields include root `exports["./create-g3d"]`, root `files: ["dist/create-g3d"]`, and `packages/create-g3d/package.json` `bin: {"create-g3d":"./dist/cli.js"}`.
- Create-tool contract verifiers are part of the public API surface. `tools/v4-package-smoke/index.ts` and `tools/v4-template-readiness/index.ts` currently assert `@galileo3d/engine/create-g3d`, `./create-g3d`, `dist/create-g3d`, `packages/create-g3d/**`, and `npm create g3d@latest`; update those verifiers in the same commit as the manifest/source rename.
- Editor persisted-contract strings include exact MIME/plugin/provenance values: `galileo3d-browser-editor`, `@galileo3d/editor-runtime`, `application/x-galileo3d-node`, `application/x-galileo3d-asset`, `galileo.default-authoring`, and `g3d-prov-*`. Tests must assert the new values and fixture project JSON must be migrated, not just source constants.
- Runtime/tool schema coverage must include `tools/v5-static-preview-smoke/index.ts` values `G3D V5 Static Preview`, `window.__g3dStaticPreview`, `g3d-v5-static-preview-smoke/v1`, and `tools/v5-claim-registry/index.ts` schema `g3d-v5-claim-registry/v1`.
- Generated naming-taxonomy reports and docs such as `docs/project/naming-taxonomy-migration-report.md` can preserve old "keep alias" decisions even after source tools are renamed. Regenerate or rewrite those reports so the final evidence proves old aliases are absent.
- `examples/node_modules/g3d` and package-local `node_modules/@galileo3d` entries can create recursive scan/test failures, including symlink-loop `ELOOP` failures in JSON test reports. Remove package-local dependency trees before tests and before final scans; do not follow symlinks in custom audit scripts.
- Final verification needs both a tracked-only gate and a whole-worktree gate. The tracked-only gate proves the committed library is clean; the whole-worktree gate catches untracked generated artifacts, local release bundles, reports, and stale dependency folders that can still break pack/publish workflows.

### Sixth-Pass Newly Explicit Scope

The sixth pass focused on Markdown/docs coverage, editor-runtime persisted contracts, release URL surfaces, and test-only shader/runtime markers:

- Markdown coverage must be treated as a first-class workstream, not a subset of docs prose. Current inventory has roughly 350 `*.md`/`*.mdx` files across root docs, apps, examples, packages, templates, fixtures, release artifacts, and generated reports. Every Markdown file must be scanned and either migrated, regenerated, sanitized, or moved outside the tracked repository.
- Use the Markdown pass as a codebase-freshness pass, not only a rename pass. Every updated Markdown file must be checked against the latest current codebase behavior, package exports, API symbols, scripts, examples, routes, generated report names, release process, and claim boundaries before it is considered complete.
- `docs/**` is large enough to need its own pass. High-risk families include `docs/api/**`, `docs/comparisons/**`, `docs/concepts/**`, `docs/project/v*-roadmap-*`, `docs/project/*claim*`, `docs/project/*release*`, `docs/project/*migration*`, `docs/project/*status*`, `docs/rendering/**`, and `docs/templates/create-g3d-templates.md`. Many files contain import snippets, package names, claim language, screenshot paths, generated report paths, old branch refs, and absolute local paths.
- Public documentation/distribution surfaces include more than GitHub Pages. Search and update `demo.galileo3d.com`, `demo.galileo3d.example-host.com`, Codecov flag names such as `codecov-g3d`, npm install snippets, create commands, badge URLs, npm registry links, CDN references, and any `github.com/.../G3D2025` or `github.io/G3D2025` URL.
- Editor-runtime persisted/export contracts were under-specified. Additional exact values include `galileo3d:editor-state:v4`, `galileo3d-prefab-v1`, `g3d-editor-project/v1`, DOM selectors `#galileo-export` and `#galileo-export-status`, shader graph symbols `g3dSurface.*`, and exported example files under `examples/editor-authored-*`.
- Test-only rendering markers include `galileo3d-test` and `@galileo3d-test:*` in unit shader/hot-path/resource-leak tests. These markers are intentionally test scoped, but they still fail the final zero-legacy gate and must move to `aura3d-test`/`@aura3d-test:*`.
- Blender/Python and MJS asset generators have helper names and generated metadata such as `loc_g3d`, `scale_g3d`, `G3D procedural ...`, `Generated by Galileo3D ...`, `g3d_semantic_role`, and `g3d_transparency_sort_unit`. These scripts regenerate fixtures, so source and generated assets must be renamed together.
- Handoff patches are broader than the earlier `*handoff*.patch` and `*evidence*.patch` patterns. Current patch inventory includes `release-artifacts/v4-current-handoff-supplement.patch` and nested copies; under a zero-legacy policy, treat every `release-artifacts/**/*.patch` file as historical unless rebuilt from renamed source.
- Branch-provenance labels such as `oldBranch*`, `origin-master-*`, and docs that reference `master:` are not legacy brand tokens, but they are rename-adjacent if the project changes default branch or repository identity. Decide whether they remain as historical provenance, move them outside the repo, or update them consistently; do not let them silently conflict with the new Aura3D repo policy.

### Seventh-Pass Newly Explicit Scope

The seventh pass focused on surfaces that are easy to miss because they are not regular TypeScript source or Markdown documentation:

- Static and nonstandard text files must be a first-class workstream. Current inventory includes hundreds of `*.html`, `*.css`, `*.scss`, `*.yml`, `*.yaml`, `*.py`, `*.cs`, `*.mjs`, `*.cjs`, and `*.sh` files outside the core TypeScript/docs buckets. These files contain titles, canvas ids, DOM ids, CSS classes, test ids, workflow artifact names, external-editor paths, generated report schemas, and command strings.
- Static HTML coverage must include `apps/**/index.html`, `examples/**/index.html`, `templates/**/index.html`, `packages/create-aura3d/templates/**/index.html`, `tests/browser/*harness.html`, `tools/**/index.html`, and release/demo HTML under `release-artifacts/**`. Rename `<title>`, visible labels, canvas ids, `aria-*`, `data-testid`, inline CSS selectors, route registry copy, and browser-test selectors together.
- External Unity/Unreal baseline scripts are not only evidence prose. Files under release handoff fixtures can contain paths such as `Assets/Galileo3D/...`, `/Game/Galileo3D/...`, `/Game/Galileo3D_V4_...`, old log text, and `G3D_UNITY_*`/`G3D_UNREAL_*` env vars. Rename, regenerate, or externalize those fixtures before final gates.
- Package-manager metadata must include `pnpm-workspace.yaml` as well as `package.json`, `pnpm-lock.yaml`, `.pnpmfile.cjs`, `.npmignore`, and any present or future `.npmrc`, `.yarnrc*`, `.pnp.*`, `package-lock.json`, `npm-shrinkwrap.json`, or `yarn.lock`. Workspace package globs, dependency hooks, publish filters, and lockfile links can preserve old names even when source imports are clean.
- Source maps and declaration maps are not authoritative source. Delete and regenerate `*.js.map`, `*.d.ts.map`, and declaration-map-producing output after the source rename, then scan `sources`, `sourcesContent`, `file`, `sourceMappingURL`, and generated declaration paths for old package names, old directory names, and old absolute paths.
- CLI executable contracts need an explicit check. The create-tool rename must verify package `bin`, shebang preservation, executable bits where relevant, generated `dist/cli.js`, `npm create`, `npm exec`, `npx`, `pnpm create`, and `pnpm dlx` examples/tests all point to `create-aura3d`/Aura3D.
- Non-source filesystem noise can defeat broad audits or packaging checks. Root/test `.DS_Store`, stale `test-results/**`, copied dependency trees, and symlinked package-local `node_modules` must be absent from the final tracked and audited worktree.

### Eighth-Pass Newly Explicit Scope

The eighth pass focused on extension-level and release-state gaps that broad string scans can find but humans may not assign to an owner:

- Framework component files must be included explicitly. Current inventory includes `templates/react/src/main.tsx` and `templates/svelte/src/App.svelte` with old package imports. Treat `*.tsx`, `*.jsx`, `*.svelte`, `*.vue`, and any future component-file extension as source code for import/API rename purposes.
- Vector and shader source files need their own pass. Current inventory includes roughly 50 `*.svg` thumbnail assets, 11 `*.glsl` shader files, and 3 `*.wgsl` shader files. Rename SVG metadata/ids/classes if present, and rename shader marker comments, structs, constants, helper functions, WebGPU labels, entry-point-adjacent identifiers, and tests in one batch.
- Binary rich assets and generated caches can contain old names in embedded metadata or arbitrary raw bytes. Current inventory includes `*.glb`, `*.blend`, `*.ktx2`, `*.hdr`, screenshot `*.png`, and `__pycache__/*.pyc` files. Delete bytecode caches, regenerate generated screenshots/reports, and inspect GLB/Blend/image metadata with asset-aware tooling rather than editing binary payloads directly.
- Raw binary hits are not automatically semantic hits. A raw `rg -a` match inside compressed image pixels or binary buffers must be classified as metadata, generated evidence, third-party asset content, or accidental byte sequence. Under the strict zero-legacy policy, generated/report binaries should be regenerated or moved outside the final audited tree; third-party canonical assets should not be destructively mutated without replacing them with verified equivalent assets.
- Git state extends beyond remotes. Check local branches, remote-tracking branches, tags, worktree paths, and submodule metadata for old names. The current worktree path still contains `/Users/gurbakshchahal/G3D`; that must be resolved or explicitly blocked before final release/publish validation.
- Public package and release registry state is outside repo text but can break consumers. Before publishing, verify the target npm scope/package names, publish access, provenance/signature settings, dist-tags, GitHub release tags, changelog links, deprecation plan for old `@galileo3d/*` packages, and any migration/codemod package names.

## Canonical Naming Decisions

Use these mappings consistently. Do not use a blind global search/replace where serialized data, schemas, package names, shader identifiers, or public APIs need migration logic.

| Legacy Form | Canonical Replacement | Notes |
| --- | --- | --- |
| `Galileo3D` | `Aura3D` | Human-facing product name, docs, titles, diagnostic prose, generated metadata. |
| `galileo3d` | `aura3d` | Lowercase package scope, vendor ids, slugs, MIME strings, provenance ids. |
| `GALILEO3D` | `AURA3D` | Uppercase globals or env-like identifiers where the full brand is used. |
| `Galileo` | `Aura3D` | Use `Aura3D` when it means the product/engine. Use `Aura` only for plain-English variable names if `Aura3D` would be awkward. |
| `galileo` | `aura3d` | Use for benchmark engine ids, plugin namespaces, lowercase ids. |
| `GALILEO` | `AURA3D` | Uppercase product ids. |
| `G3D` | `A3D` | Public TypeScript symbols, uppercase constants, UI short brand, env vars, repo slugs when the short brand is intentional. |
| `g3d` | `a3d` | Internal ids, CSS prefixes, schema prefixes, globals, shader functions, telemetry values, lowercase slugs. |
| `G3D2025` | chosen Aura3D repo slug | Decide exact target before rewriting GitHub commands. `Aura3D`, `Aura3D2025`, or another owner-approved slug must replace every old repo slug consistently. |
| Package scope `@galileo3d/*` | `@aura3d/*` | Update every package manifest, import, alias, generated doc, lockfile. |
| `@galileo3d/create-g3d` | `@aura3d/create-aura3d` | Package name for the create tool. |
| `create-g3d` | `create-aura3d` | Directory, bin, package export, docs, tests, report names. |
| `createG3DProject` | `createA3DProject` | Public API symbol. |
| `CreateG3D*` | `CreateA3D*` | Public API types. |
| `G3DRenderer`, `G3DScene`, `G3DAppLifecycle` | `A3DRenderer`, `A3DScene`, `A3DAppLifecycle` | Public API classes and file basenames. |
| `G3D_*` env/constants | `A3D_*` | Env vars, constants, CI variable names. |
| `__GALILEO3D_*__` globals | `__AURA3D_*__` | Browser-visible globals. |
| `__G3D_*__`, `__g3d*` globals | `__A3D_*__`, `__a3d*` | Browser-visible globals. |
| `g3d-webgl2`, `g3d-webgpu` | `a3d-webgl2`, `a3d-webgpu` | Runtime telemetry/report values. |
| `@galileo3d-shader:*` | `@aura3d-shader:*` | Shader marker strings. |
| `@g3d-v*-shader:*` | `@a3d-v*-shader:*` | Shader marker strings. |
| `g3d-v*-.../v1` schemas | `a3d-v*-.../v1` or bumped schema version | Treat as schema migration, not prose. |

Compatibility aliases may be used inside intermediate migration commits to keep tests passing, but the final state for this objective requires removing those legacy aliases before completion.

## Direct Filesystem Renames

These are source/control paths that should be renamed with `git mv` or equivalent so history is preserved.

### Repository Root

| Current Path | Target Path |
| --- | --- |
| `/Users/gurbakshchahal/G3D` | `/Users/gurbakshchahal/Aura3D` |

If the workspace root path is changed, update all absolute paths embedded in generated reports, `prompt.md`, docs, test reports, local instructions, and any scripts that reference `/Users/gurbakshchahal/G3D`.

### Package And CLI Directory

| Current Path | Target Path |
| --- | --- |
| `packages/create-g3d/` | `packages/create-aura3d/` |

All references to `packages/create-g3d` in `package.json`, `tsconfig.base.json`, `vite.config.ts`, `vitest.config.ts`, docs, tests, generated declarations, and lockfile entries must move to `packages/create-aura3d`.

### Engine Source File Basenames

| Current File | Target File |
| --- | --- |
| `packages/engine/src/G3DApp.ts` | `packages/engine/src/A3DApp.ts` |
| `packages/engine/src/G3DQualityPresets.ts` | `packages/engine/src/A3DQualityPresets.ts` |
| `packages/engine/src/v9/G3DAppLifecycle.ts` | `packages/engine/src/v9/A3DAppLifecycle.ts` |
| `packages/engine/src/v9/G3DRenderer.ts` | `packages/engine/src/v9/A3DRenderer.ts` |
| `packages/engine/src/v9/G3DScene.ts` | `packages/engine/src/v9/A3DScene.ts` |
| `packages/three-compat/src/migration/ThreeToG3DAdapter.ts` | `packages/three-compat/src/migration/ThreeToA3DAdapter.ts` |

All imports and exports from these files must be updated in the same batch:

- `packages/engine/src/index.ts`
- `packages/engine/src/v9/index.ts`
- `docs/api/readme.md`
- `docs/api/public-api.md`
- `tests/unit/engine/**`
- `tests/unit/public-api-contracts.test.ts`
- Browser/apps importing `G3DRenderer` or `G3DScene`
- Tools importing `migrateThreeToG3D`

### Benchmark Directory And File Renames

| Current Path | Target Path |
| --- | --- |
| `benchmarks/galileo/` | `benchmarks/aura3d/` |
| `benchmarks/foundation/galileo/` | `benchmarks/foundation/aura3d/` |
| `benchmarks/foundation/galileo/render-galileo-scene.ts` | `benchmarks/foundation/aura3d/render-aura3d-scene.ts` |
| `benchmarks/external-parity/galileo/` | `benchmarks/external-parity/aura3d/` |
| `benchmarks/three-compat/galileo/` | `benchmarks/three-compat/aura3d/` |
| `benchmarks/production-runtime/g3d/` | `benchmarks/production-runtime/aura3d/` |

Update relative imports in:

- `benchmarks/threejs/src/scenes/v8-flagship-viewer.ts`
- `benchmarks/foundation/aura3d/{asset-scene,interactive-scene,material-scene,product-scene}.ts`
- `tools/compare-engines/index.ts`
- `tools/v3-benchmarks/index.ts`
- `tools/v4-benchmarks/index.ts`
- `tools/v8-threejs-parity/index.ts`
- Any report generator that reads `engine: "galileo"` or `engine: "g3d"`

### Create Tool Docs And Tests

| Current File | Target File |
| --- | --- |
| `docs/templates/create-g3d-templates.md` | `docs/templates/create-aura3d-templates.md` |
| `tests/integration/v4-create-g3d.test.ts` | `tests/integration/v4-create-aura3d.test.ts` |
| `tests/integration/v5-create-g3d.test.ts` | `tests/integration/v5-create-aura3d.test.ts` |
| `tests/integration/v6-create-g3d.test.ts` | `tests/integration/v6-create-aura3d.test.ts` |

Update all root `package.json` scripts, docs links, generated report names, and readiness tools that reference these old filenames.

### Generated Or Archival Path Names

Do not manually rename generated or dependency output. Clean, regenerate, replace, or remove it after source rename:

| Current Path Class | Final Action |
| --- | --- |
| `dist/create-g3d` | Remove and regenerate as `dist/create-aura3d`. |
| `dist/packages/create-g3d` | Remove and regenerate as `dist/packages/create-aura3d` if generated output is still tracked. |
| `dist/**/G3D*.{js,d.ts,map}` | Remove and regenerate from renamed source. |
| `packages/*/dist/**/G3D*.{js,d.ts,map}` | Remove and regenerate from renamed source. |
| `packages/three-compat/dist/migration/ThreeToG3DAdapter.*` | Remove and regenerate as `ThreeToA3DAdapter.*`. |
| `packages/create-g3d/dist/**` | Remove and regenerate under `packages/create-aura3d/dist/**`. |
| `tests/reports/v4-create-g3d*.json` | Regenerate with `v4-create-aura3d*.json` or remove if obsolete. |
| `release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz` | Replace with a new `aura3d-engine-...tgz` artifact or move outside the tracked repo. |
| `examples/node_modules/g3d` | Dependency/link artifact; remove and regenerate via install. |
| `packages/*/node_modules/@galileo3d` | Dependency/link artifact; remove and regenerate via install. |

Generated source/declaration maps need special handling. Do not treat old names in `*.map` or `*.d.ts.map` as harmless because they can ship in packages, expose old source paths, and make publish scans fail. Remove and regenerate them from renamed source, then inspect `sources`, `sourcesContent`, `sourceMappingURL`, and generated declaration references.

## Root Package And Config Work

### Files

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `eslint.config.js`
- `index.html`
- `.gitignore`
- `.npmignore`
- `.pnpmfile.cjs`
- `CHANGELOG.md`
- `README.md`
- `FinalPRD.md`
- `execute.md`
- `prompt.md`
- `renamePRD.md` while this planning file remains tracked
- `.github/workflows/*.yml`
- `.github/ISSUE_TEMPLATE/*.yml`

### Required Renames

- `package.json` name: `@galileo3d/engine` -> `@aura3d/engine`.
- Root `package.json` workspace dependency keys: every `@galileo3d/*` -> `@aura3d/*`.
- Root `package.json` `@galileo3d/create-g3d` -> `@aura3d/create-aura3d`.
- Root `package.json` `files`: `dist/create-g3d` -> `dist/create-aura3d`.
- Root `package.json` export `./create-g3d` -> `./create-aura3d`.
- Root publish surface:
  - `.npmignore` currently keeps `dist/`, `package.json`, `README.md`, and `LICENSE`. After rebuild, verify the packed file list does not include `dist/create-g3d`, old source maps, old declarations, old package names, or old docs.
  - `.pnpmfile.cjs` currently has no legacy name, but keep it in the audit because package dependency hooks can rewrite dependencies during install.
- Package manager workspace/config surface:
  - `pnpm-workspace.yaml` must be audited with the same strictness as package manifests. If package globs or workspace aliases change during the directory rename, update them before regenerating the lockfile.
  - If `.npmrc`, `.yarnrc*`, `.pnp.*`, `package-lock.json`, `npm-shrinkwrap.json`, or `yarn.lock` appear during the migration, include them in the same manifest/lockfile gate rather than treating them as unrelated generated files.
  - After package and directory renames, run the package manager from a clean state so `pnpm-lock.yaml` records `packages/create-aura3d` links and `@aura3d/*` package keys only.
- Root scripts:
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER` -> `A3D_DISABLE_SYSTEM_WEBGPU_BROWSER`.
  - `G3D_ADVANCED_GALLERY_EVIDENCE_MODE` -> `A3D_ADVANCED_GALLERY_EVIDENCE_MODE`.
  - `G3D_WEBGPU_PARITY_REPORT` -> `A3D_WEBGPU_PARITY_REPORT`.
  - Every `tests/integration/*create-g3d*` path -> `*create-aura3d*`.
- Root `package.json` exact script touchpoints from the third pass:
  - `wow:screenshots` uses `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER`.
  - `advanced-gallery` uses `G3D_ADVANCED_GALLERY_EVIDENCE_MODE` and `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER`.
  - `external-parity:templates` references `tests/integration/v4-create-g3d.test.ts`.
  - `three-compat:templates` references `tests/integration/v5-create-g3d.test.ts`.
  - `production-runtime:templates` references `tests/integration/v6-create-g3d.test.ts`.
  - `verify:foundation-rendering` writes `G3D_WEBGPU_PARITY_REPORT`.
  - `verify:external-parity-codebase-root` writes `G3D_WEBGPU_PARITY_REPORT`.
  - `verify:external-parity-codebase-root-contracts` writes `G3D_WEBGPU_PARITY_REPORT`.
  - `verify:external-parity-rendering` writes `G3D_WEBGPU_PARITY_REPORT`.
  - Historical or release-handoff package manifests may still contain older aliases such as `v4:templates`, `v5:templates`, `v6:templates`, `verify:v3-rendering`, `verify:v4-codebase-root`, `verify:v4-codebase-root-contracts`, and `verify:v4-rendering`; rewrite or remove those artifacts too.
- `pnpm-lock.yaml` must be regenerated after every manifest and directory rename. Verify it no longer contains `@galileo3d/*`, `@galileo3d/create-g3d`, `packages/create-g3d`, or `link:packages/create-g3d`.
- `.gitignore`: `# G3D 5.0 - Git Ignore Rules` -> `# A3D 5.0 - Git Ignore Rules`.
- `CHANGELOG.md`: brand heading/prose `Galileo3D` -> `Aura3D`.
- `tsconfig.base.json`, `vite.config.ts`, `vitest.config.ts`: all `@galileo3d/*` aliases -> `@aura3d/*`; `@galileo3d/create-g3d` -> `@aura3d/create-aura3d`; path target `packages/create-g3d/src/index.ts` -> `packages/create-aura3d/src/index.ts`.
- `vite.config.ts` plugin name `g3d-contextual-taxonomy-aliases` -> `a3d-contextual-taxonomy-aliases`.
- `vite.config.ts` env var `G3D_VITE_TEST_SERVER` -> `A3D_VITE_TEST_SERVER`.
- `playwright.config.ts` env vars:
  - `G3D_WEBGPU_BROWSER_EXECUTABLE` -> `A3D_WEBGPU_BROWSER_EXECUTABLE`.
  - `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER` -> `A3D_DISABLE_SYSTEM_WEBGPU_BROWSER`.
- Third-pass env var inventory. Rename every occurrence in source, tests, docs, workflows, release handoff files, and generated reports:
  - Browser/test server: `G3D_WEBGPU_BROWSER_EXECUTABLE`, `G3D_DISABLE_SYSTEM_WEBGPU_BROWSER`, `G3D_VITE_TEST_SERVER`, `G3D_ADVANCED_GALLERY_EVIDENCE_MODE`, `G3D_WEBGPU_PARITY_REPORT`.
  - External engine baseline: `G3D_UNITY_EDITOR`, `G3D_UNITY_SEARCH_ROOTS`, `G3D_UNITY_PROJECT_PATH`, `G3D_UNREAL_EDITOR`, `G3D_UNREAL_SEARCH_ROOTS`, `G3D_UNREAL_PROJECT_PATH`, `G3D_EXTERNAL_ASSET_IMPORT_SAMPLE`, `G3D_RUN_UNITY_UNREAL_CLI_SMOKE`.
  - Public demo and GitHub readiness: `G3D_PUBLIC_DEMO_URL`, `G3D_GITHUB_REPOSITORY`.
  - Release/report identity: `G3D_RELEASE_RUN_ID`.
  - External demo tools: `G3D_EXTERNAL_DEMO_EXPORT_DIR`, `G3D_EXTERNAL_DEMO_MANIFEST`.
  - Clean checkout evidence: `G3D_INDEPENDENT_REPRODUCTION`, `G3D_INDEPENDENT_REPRODUCTION_EVIDENCE`.
  - Test helper env vars: `G3D_FAKE_PNPM_LOG`, `G3D_FAKE_PNPM_EXIT`.
- `eslint.config.js` restricted import patterns:
  - `@galileo3d/*/src/*` -> `@aura3d/*/src/*`.
  - `@galileo3d/*/*` -> `@aura3d/*/*`.
- `index.html` visible title/header/copy:
  - `G3D Local Route Registry` -> `A3D Local Route Registry`.
  - `Dedicated G3D-only route` -> `Dedicated A3D-only route`.
  - `G3D glTF animation pipeline` -> `A3D glTF animation pipeline`.
- `.github/workflows/*.yml`:
  - `codecov-g3d` -> `codecov-a3d`.
  - `g3d-coverage` -> `a3d-coverage`.
  - `release/g3d-${{ github.ref_name }}.tar.gz` -> `release/aura3d-${{ github.ref_name }}.tar.gz`.
  - `.github/workflows/release.yml` release name/body text such as `G3D ...`, changelog text such as `Initial release of G3D 5.0`, and install snippets such as `npm install g3d@...` or `pnpm add g3d@...` -> Aura3D/A3D equivalents.
  - `G3D_*` env vars -> `A3D_*`.
  - Install snippets `g3d@...` -> `aura3d@...` if the package name is used.
  - GitHub repo commands `--repo gchahal1982/G3D2025` -> the chosen Aura3D repo slug.
  - GitHub Pages URLs containing `G3D2025` -> the chosen Aura3D Pages URL.
- `.github/ISSUE_TEMPLATE/*.yml`:
  - `Galileo3D` -> `Aura3D`.

### Root Config Checklist

- [ ] Rename package name and workspace dependency keys in root `package.json`.
- [ ] Rename create package export from `./create-g3d` to `./create-aura3d`.
- [ ] Update every script that references `create-g3d`, `g3d`, `G3D_*`, or old integration test filenames.
- [ ] Update `tsconfig.base.json` path aliases to `@aura3d/*`.
- [ ] Update `vite.config.ts` aliases and plugin/env names.
- [ ] Update `vitest.config.ts` aliases.
- [ ] Update `playwright.config.ts` env names.
- [ ] Update `eslint.config.js` import restriction rules.
- [ ] Regenerate `pnpm-lock.yaml`; do not hand-edit it.
- [ ] Audit `pnpm-workspace.yaml`, `.pnpmfile.cjs`, `.npmignore`, and any package-manager config/lockfile added during migration.
- [ ] Update `.github` workflow artifact names, env vars, package install snippets, and issue templates.
- [ ] Update `index.html` registry copy.
- [ ] Update root docs and PRD files that are active; remove or externalize historical legacy artifacts if final zero legacy gate is strict.
- [ ] Move or remove `renamePRD.md` before the final strict scan, or replace it with a sanitized Aura3D completion document with no legacy tokens.

### Operational Git Metadata Checklist

This is intentionally separate from tracked source changes. Broad repo scans exclude `.git/**`, but release and CI workflows can still fail if local remotes or upstream branches point at the old repository.

- [ ] Decide the target Aura3D repository slug, Pages URL, default branch, and release branch naming convention before changing remotes.
- [ ] Update local remote URLs after the target repo exists, for example `git remote set-url origin https://github.com/<owner>/<Aura3D-repo>.git`.
- [ ] Update branch upstreams if the default or release branch changes, for example `git branch --set-upstream-to=origin/<target-branch> <local-branch>`.
- [ ] Check `git config --get-regexp '^(remote\..*\.url|branch\..*\.(remote|merge)|init\.defaultBranch|github\.)'` for `G3D2025`, `G3D`, `g3d`, `galileo`, and old branch names before the first push.
- [ ] Check branches, tags, worktree paths, and submodule metadata before the final publish run; repository text scans do not cover these Git states.
- [ ] Confirm GitHub Actions secrets, package publish tokens, Codecov project slugs, Pages settings, and release automation target the Aura3D repository before publishing renamed packages.

## Package Scope And Public API Work

### Package Manifests

Every package manifest under `packages/*/package.json` must be updated:

| Current Package | Target Package |
| --- | --- |
| `@galileo3d/animation` | `@aura3d/animation` |
| `@galileo3d/apps` | `@aura3d/apps` |
| `@galileo3d/assets` | `@aura3d/assets` |
| `@galileo3d/audio` | `@aura3d/audio` |
| `@galileo3d/controls` | `@aura3d/controls` |
| `@galileo3d/core` | `@aura3d/core` |
| `@galileo3d/create-g3d` | `@aura3d/create-aura3d` |
| `@galileo3d/debug` | `@aura3d/debug` |
| `@galileo3d/ecs` | `@aura3d/ecs` |
| `@galileo3d/editor` | `@aura3d/editor` |
| `@galileo3d/editor-runtime` | `@aura3d/editor-runtime` |
| `@galileo3d/engine-runtime` | `@aura3d/engine-runtime` |
| `@galileo3d/environments` | `@aura3d/environments` |
| `@galileo3d/input` | `@aura3d/input` |
| `@galileo3d/materials` | `@aura3d/materials` |
| `@galileo3d/math` | `@aura3d/math` |
| `@galileo3d/physics` | `@aura3d/physics` |
| `@galileo3d/product-studio` | `@aura3d/product-studio` |
| `@galileo3d/rendering` | `@aura3d/rendering` |
| `@galileo3d/scene` | `@aura3d/scene` |
| `@galileo3d/scripting` | `@aura3d/scripting` |
| `@galileo3d/test-utils` | `@aura3d/test-utils` |
| `@galileo3d/three-compat` | `@aura3d/three-compat` |
| `@galileo3d/workflows` | `@aura3d/workflows` |

Also update package-local `tsconfig.json`, `vitest.config.ts`, README files, and every package dependency key.

Manifest fanout that must be handled with structured JSON tooling (`node`, `jq`, or the package manager), not ad hoc regex over arbitrary files:

- Root `package.json`: package name, workspace dependency keys, exports, files, scripts, and create-tool dependency.
- `packages/*/package.json`: package names and every dependency/devDependency/peerDependency/optionalDependency reference to `@galileo3d/*`.
- `templates/*/package.json`: template package names and dependencies. Preserve existing version policy such as `0.0.0-rebuild` while changing the package scope/name.
- `packages/create-aura3d/templates/*/package.json`: generated project names and dependencies after the create package directory is renamed.
- `benchmarks/**/package.json`, including external benchmark harnesses such as Babylon and Three.js comparison packages.
- `release-artifacts/v4-external-evidence-handoff/package.json`, if that evidence handoff remains tracked.
- Any package manifest embedded inside release tarballs after extraction.

For every manifest, inspect these JSON fields explicitly because they control install, import, publish, and user-facing package discovery behavior:

- Identity and publish metadata: `name`, `description`, `keywords`, `homepage`, `repository`, `bugs`, `license`, `publishConfig`.
- Entrypoints and command metadata: `main`, `module`, `types`, `bin`, `exports`, `imports`, `typesVersions`, `files`.
- Dependency buckets: `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, `bundleDependencies`, `bundledDependencies`, `resolutions`, `overrides`, and package-manager-specific fields.
- Automation metadata: `scripts`, `config`, `engines`, `packageManager`, and any local tool-specific keys.

Do not ship any compatibility package alias in the final state. Temporary aliases can exist only on intermediate commits and must be removed before the broad legacy gate.

Subpath import/export inventory from the third pass:

- `@galileo3d/engine/advanced-runtime` -> `@aura3d/engine/advanced-runtime`.
- `@galileo3d/engine/production-runtime` -> `@aura3d/engine/production-runtime`.
- `@galileo3d/engine/v6`, `@galileo3d/engine/v8`, `@galileo3d/engine/v9` -> matching `@aura3d/engine/*` subpaths.
- `@galileo3d/engine/rendering`, `@galileo3d/engine/rendering/production-runtime`, `@galileo3d/engine/rendering/advanced-runtime`, `@galileo3d/engine/rendering/v6`, `@galileo3d/engine/rendering/v9` -> matching `@aura3d/engine/rendering*` subpaths.
- `@galileo3d/engine/assets`, `@galileo3d/engine/assets/browser`, `@galileo3d/engine/assets/asset-corpus`, `@galileo3d/engine/assets/advanced-gallery`, `@galileo3d/engine/assets/v6`, `@galileo3d/engine/assets/v9` -> matching `@aura3d/engine/assets*` subpaths.
- `@galileo3d/engine/workflows`, `@galileo3d/engine/workflows/production`, `@galileo3d/engine/workflows/v6` -> matching `@aura3d/engine/workflows*` subpaths.
- `@galileo3d/engine/apps`, `@galileo3d/engine/engine`, `@galileo3d/engine/create-g3d`, `@galileo3d/engine/animation`, `@galileo3d/engine/animation/browser`, `@galileo3d/engine/three-compat`, `@galileo3d/engine/materials`, `@galileo3d/engine/environments`, `@galileo3d/engine/physics`, `@galileo3d/engine/product-studio`, `@galileo3d/engine/scene`, `@galileo3d/engine/math`, `@galileo3d/engine/editor-runtime`, `@galileo3d/engine/controls`, `@galileo3d/engine/core`, and `@galileo3d/engine/ecs` -> matching `@aura3d/engine/*` subpaths.
- `@galileo3d/three-compat/controls`, `@galileo3d/three-compat/loaders`, and `@galileo3d/three-compat/postprocessing` -> matching `@aura3d/three-compat/*` subpaths.
- Test-only fixture package names `@galileo3d/restore-target`, `@galileo3d/external-host-fixture`, and `@galileo3d/test` -> `@aura3d/restore-target`, `@aura3d/external-host-fixture`, and `@aura3d/test`.

After renaming exports, verify package `exports`, `typesVersions`, `tsconfig` paths, Vite/Vitest aliases, docs snippets, tests, and generated API docs agree on the same subpath set.

### Engine/App API Symbols

Files:

- `packages/apps/src/index.ts`
- `packages/engine/src/A3DApp.ts` after file rename
- `packages/engine/src/A3DQualityPresets.ts` after file rename
- `packages/engine/src/index.ts`
- `packages/engine/src/v6/index.ts`
- `packages/engine/src/v8/FlagshipFoundation.ts`
- `packages/engine/src/v9/A3DAppLifecycle.ts` after file rename
- `packages/engine/src/v9/A3DRenderer.ts` after file rename
- `packages/engine/src/v9/A3DScene.ts` after file rename
- `packages/engine/src/v9/index.ts`

Required symbol families:

| Current | Target |
| --- | --- |
| `G3DApp*` | `A3DApp*` |
| `G3D_APP_WORKFLOW_PRESETS` | `A3D_APP_WORKFLOW_PRESETS` |
| `createG3DApp` | `createA3DApp` |
| `resolveG3DAppQualityPreset` | `resolveA3DAppQualityPreset` |
| `G3D_QUALITY_PRESETS` | `A3D_QUALITY_PRESETS` |
| `G3D_QUALITY_PRESET_SETTINGS` | `A3D_QUALITY_PRESET_SETTINGS` |
| `G3DRenderer` | `A3DRenderer` |
| `G3DRendererOptions` | `A3DRendererOptions` |
| `G3DScene` | `A3DScene` |
| `G3DSceneMeshOptions` | `A3DSceneMeshOptions` |
| `G3DSceneRenderSourceOptions` | `A3DSceneRenderSourceOptions` |
| `G3DAppLifecycle` | `A3DAppLifecycle` |
| `G3DAppLifecycleSnapshot` | `A3DAppLifecycleSnapshot` |
| `G3DDisposable` | `A3DDisposable` |
| `G3DWorkflowApi` | `A3DWorkflowApi` |
| `G3DEnvironment*` | `A3DEnvironment*` |
| `G3DMaterialVariantController` | `A3DMaterialVariantController` |
| `G3DScreenshotCapture` | `A3DScreenshotCapture` |
| `G3DAssetDiagnostics` | `A3DAssetDiagnostics` |
| `G3DRenderDiagnostics` | `A3DRenderDiagnostics` |
| `G3DDiagnosticsPanel` | `A3DDiagnosticsPanel` |
| `isG3DApp` | `isA3DApp` |

Runtime values in these files:

- `g3d-diagnostics-panel` -> `a3d-diagnostics-panel`.
- `public-g3d-renderer-frame` -> `public-a3d-renderer-frame`.
- Diagnostic text mentioning `@galileo3d/engine` or `G3DRenderer` -> `@aura3d/engine` and `A3DRenderer`.
- `GALILEO3D_ENGINE_V6_PRODUCT_SURFACE` -> `AURA3D_ENGINE_V6_PRODUCT_SURFACE`.
- `g3d-renderer-v6-sdk` -> `a3d-renderer-v6-sdk`.
- `G3D_THREEJS_EXAMPLE_PARITY_TARGETS` -> `A3D_THREEJS_EXAMPLE_PARITY_TARGETS`.
- Every public v6 `G3D*` type in `packages/engine/src/v6/index.ts` -> `A3D*`.
- Every public v8 `G3D*` type in `packages/engine/src/v8/FlagshipFoundation.ts` -> `A3D*`.

Third-pass public/runtime symbol families that must also be covered:

- XR types: `G3DXRSessionMode`, `G3DXRSystemLike`, `G3DXRFrameLike`, `G3DXRSessionLike`, `G3DXRReferenceSpaceType`, `G3DXRReferenceSpaceLike`, `G3DXRSessionInit`, `G3DXRPoseLike`, `G3DXRInputSourceLike`, `G3DXRHitTestResultLike`, and `G3DXRHandedness` -> `A3DXR*`.
- Workflow/result types: `G3DWorkflowResult`, `G3DWorkflowDiagnostics`, `G3DWorkflowKind`, `G3DLoadedPipeline`, and `G3DFrameRenderResult` -> `A3D*`.
- Product/viewer types: `G3DProductViewer`, `G3DProductViewerSettings`, `G3DProductViewerCameraDiagnostics`, `G3DViewport`, and `G3DRenderOptions` -> `A3D*`.
- Scene/asset/render helper types: `G3DVec3`, `G3DGltfScene`, `G3DGltfSceneOptions`, `G3DGltfRendererInputOptions`, `G3DGLTFLoader`, `G3DGroundedStage*`, `G3DCameraFrame*`, `G3DEnvironment*`, `G3DHdrEnvironment*`, `G3DNavigationControls*`, and `G3DOrbitControls*` -> `A3D*`.
- Render helper functions: `renderG3D`, `renderG3DTexturedParallaxTransmission`, `renderG3DFlagshipViewer`, `actualG3DRenderer`, `createG3DItems`, `createG3DStageItems`, `createG3DLights`, and `createG3DScene` -> `renderA3D*`, `actualA3DRenderer`, and `createA3D*`.
- Negative/assertion identifiers such as `noG3DRuntimeThreeImport` must also be renamed; do not leave old terms in test names or assertion names.

### Rendering, Shader, And GPU Identifiers

Files:

- `packages/rendering/src/ColorManagement.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `packages/rendering/src/ShaderChunks.ts`
- `packages/rendering/src/shaders/*.glsl`
- `packages/rendering/src/production-runtime/shaders/**/*.glsl`
- `packages/rendering/src/production-runtime/shaders/wgsl/*.wgsl`
- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/WebGPURenderToTextureProof.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/V4RenderPreset.ts`
- `packages/rendering/src/effects/GPUParticleBackend.ts`
- `packages/rendering/src/v5/RendererV5.ts`
- `packages/rendering/src/v6/ProductionWebGPURenderer.ts`
- `tools/verify-shaders/index.ts`
- Tests under `tests/unit/rendering`, `tests/browser/webgpu-*`, and `tests/performance/*`

Required renames:

- `G3DColorSpace`, `G3DTextureSemantic`, `G3DColorManagementPolicy`, `G3DColorConversionSample`, `G3DTextureColorSpaceValidation` -> `A3D*`.
- Shader names `galileo3d/*` -> `aura3d/*`.
- Shader markers `@galileo3d-shader:*` -> `@aura3d-shader:*`.
- Shader markers `@g3d-v*-shader:*` -> `@a3d-v*-shader:*`.
- GLSL structs/constants/functions:
  - `G3DLight` -> `A3DLight`.
  - `G3D_PI`, `G3D_INV_PI`, `G3D_EPSILON`, `G3D_MIN_ROUGHNESS` -> `A3D_*`.
  - `g3dSaturate`, `g3dDiffuseBurley`, and every `g3d*` shader helper -> `a3d*`.
- WebGPU labels `galileo3d-*` -> `aura3d-*`.
- WGSL helper `g3dWebGPUClipPosition` -> `a3dWebGPUClipPosition`.
- Diagnostics vendor `galileo3d` -> `aura3d`.
- Capture URI `g3d-v5-capture://` -> `a3d-v5-capture://`.
- Schemas such as `g3d-v6-webgpu-report/v1` -> `a3d-v6-webgpu-report/v1`.

Shader rename must happen atomically across registry constants, source strings, standalone GLSL files, marker verifier, and tests. Partial shader renames will break shader lookup and marker validation.

Shader source files are code, not generated evidence. Run the shader-specific gate before and after generated bundle rebuilds so old `@galileo3d-shader`, `@g3d-*`, `G3D_*`, and `g3d*` helper names cannot survive in standalone `.glsl`/`.wgsl` files or copied shader chunks.

### Assets And Environments

Files:

- `packages/assets/src/AssetCompatibility.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/V4Corpus.ts`
- `packages/assets/src/V8AssetCorpus.ts`
- `packages/assets/src/v5/V5AssetRegistry.ts`
- `packages/assets/src/v6/V6AssetCorpus.ts`
- `packages/assets/src/OBJLoader.ts`
- `packages/assets/src/BlenderExportValidation.ts`
- `packages/environments/src/EnvironmentRegistry.ts`
- `packages/environments/src/v6/V6EnvironmentCorpus.ts`

Required renames:

- Report key/type `galileo3d` -> `aura3d`.
- Runtime material marker `#galileo3d-runtime:` -> `#aura3d-runtime:`.
- glTF userData key prefix `g3d_` -> `a3d_`.
- Manifest/readiness schemas:
  - `g3d-v4-gltf-corpus/v1` -> `a3d-v4-gltf-corpus/v1`.
  - `g3d-v5-asset-library/v1` -> `a3d-v5-asset-library/v1`.
  - `g3d-v6-real-asset-corpus/v1` -> `a3d-v6-real-asset-corpus/v1`.
  - `g3d-v6-asset-readiness/v1` -> `a3d-v6-asset-readiness/v1`.
  - `g3d-v8-local-asset-corpus/v1` -> `a3d-v8-local-asset-corpus/v1`.
  - `g3d-v8-asset-readiness/v1` -> `a3d-v8-asset-readiness/v1`.
  - `g3d-v5-environment-library/v1` -> `a3d-v5-environment-library/v1`.
  - `g3d-v6-hdr-environment-corpus/v1` -> `a3d-v6-hdr-environment-corpus/v1`.
  - `g3d-v6-environment-readiness/v1` -> `a3d-v6-environment-readiness/v1`.
- glTF generator strings `Galileo3D ...` -> `Aura3D ...`.

If old asset manifests are still loaded by tests, update fixtures and tests together. Final state should not accept old schema ids unless the compatibility code itself is outside the strict final gate, which conflicts with this objective.

### Fixtures And Asset Corpus Work

The second pass found legacy terms in fixture metadata and test asset corpora outside package source. These files affect importer behavior and evidence tests, so update them as data migrations rather than prose-only edits.

Primary fixture/data files:

- `fixtures/v9/assets/data-galaxy-core-blender/manifest.json`
- `fixtures/v9/assets/data-galaxy-core-blender/README.md`
- `fixtures/v9/assets/smart-city-district/smart-city-district.gltf`
- `tests/assets/corpus/animated-character-corpus.manifest.json`
- `tests/assets/corpus/khronos/CesiumMan/README.md`
- `tests/assets/corpus/blender/vulkan-samples/terrain.gltf`
- `tests/assets/gltf-inspection.test.ts`
- `tests/assets/gltf-animation-corpus.test.ts`
- `tests/assets/v2-product-assets.test.ts`
- `tests/assets/v3-asset-corpus.test.ts`
- `tests/assets/v3-gltf-loader.test.ts`
- `tests/assets/v4-asset-corpus.test.ts`
- `tests/assets/v5-asset-library.test.ts`
- `tests/assets/v6-real-asset-corpus.test.ts`
- `tests/assets/v8-gltf-loader-corpus.test.ts`

Required fixture/data actions:

- `G3D alpha correctness` -> `A3D alpha correctness`.
- `g3d_semantic_role` -> `a3d_semantic_role`; update any fixture readers or assertions that depend on this metadata key.
- `g3d_generated_asset_id` -> `a3d_generated_asset_id`.
- `g3d_acceptance_role` -> `a3d_acceptance_role`.
- `g3d_transparency_sort_unit` -> `a3d_transparency_sort_unit`.
- `g3d_texcoord0` -> `a3d_texcoord0` if this is project metadata; keep standard glTF `TEXCOORD_0` untouched.
- Provenance ids such as `g3d-prov-*` -> `a3d-prov-*`.
- glTF `asset.generator` strings such as `G3D v9 advanced gallery authored smart-city generator` -> `A3D v9 advanced gallery authored smart-city generator`.
- Test fixture generator strings `Galileo3D ... fixture` -> `Aura3D ... fixture`.
- Schema assertions:
  - `g3d-v2-product-manifest/v1` -> `a3d-v2-product-manifest/v1`.
  - `g3d-v3-asset-fixture/v1` -> `a3d-v3-asset-fixture/v1`.
  - `g3d-v3-local-asset-v1` -> `a3d-v3-local-asset-v1`.
  - `g3d-v3-asset-corpus-report-v1` -> `a3d-v3-asset-corpus-report-v1`.
  - `g3d-v4-asset-corpus-v1` -> `a3d-v4-asset-corpus-v1`.
  - `g3d-v4-local-asset-v1` -> `a3d-v4-local-asset-v1`.
  - `g3d-v4-asset-corpus-report-v1` -> `a3d-v4-asset-corpus-report-v1`.
  - `g3d-v5-asset-library/v1` -> `a3d-v5-asset-library/v1`.
  - `g3d-v6-real-asset-corpus/v1` -> `a3d-v6-real-asset-corpus/v1`.
  - `g3d-v8-local-asset-corpus/v1` -> `a3d-v8-local-asset-corpus/v1`.
- Product-art disclaimers in third-party asset corpus docs should be rewritten to refer to Aura3D product art where the statement is still needed.

Binary/data URI policy:

- Do not run a blind text replacement inside base64 payloads, binary data, or source maps.
- `tests/assets/corpus/blender/vulkan-samples/terrain.gltf` currently contains an accidental `G3D` sequence inside an embedded base64 buffer. Because the final broad gate is a raw text gate, this cannot remain in a tracked text `.gltf`.
- Resolve that base64 hit by regenerating the fixture, moving the buffer to a binary `.bin` sidecar, or replacing the fixture with an equivalent asset whose text representation does not contain legacy tokens. Do not whitelist it in the final strict gate.
- For `.gltf` files, parse JSON and update only semantic fields such as `asset.generator`, `extras`, `extensions`, `nodes[*].name`, and project-specific metadata keys. Leave numeric arrays and buffer data untouched unless the asset is intentionally regenerated.
- For `.glb` files, inspect the JSON chunk for semantic names, `asset.generator`, `extras`, extension metadata, and project-specific keys before deciding whether the binary buffer needs regeneration.
- For `.blend` files, prefer rerunning the renamed Blender/Python generator so object/material/custom-property metadata is recreated under Aura3D/A3D names.
- For `*.png`, `*.hdr`, `*.ktx2`, and other image/texture artifacts, distinguish text metadata chunks from compressed pixel data. Generated screenshots and reports should be regenerated; third-party source textures should be replaced only with verified equivalent assets if the strict raw gate requires it.
- Delete `__pycache__/**/*.pyc` and any other compiled interpreter caches before final scans. They can preserve old string constants and local source paths even after the Python source file is fixed.

### Three Compatibility Migration

Files:

- `packages/three-compat/src/migration/ThreeToA3DAdapter.ts` after rename
- `packages/three-compat/src/index.ts`
- `tools/v5-threejs-example-migrator/index.ts`
- `tools/v5-migrate-three/index.ts`
- Tests and docs that mention `migrateThreeToG3D`

Required renames:

- `ThreeToG3DAdapter` -> `ThreeToA3DAdapter`.
- `migrateThreeToG3D` -> `migrateThreeToA3D`.
- `V5MigrationResult` can remain if it is version-oriented, but any G3D fields inside it must become A3D fields.
- Documentation/examples should describe migrating Three.js code to Aura3D/A3D.

## Create Tool And Template Work

### Source Package

Files:

- `packages/create-aura3d/package.json`
- `packages/create-aura3d/src/index.ts`
- `packages/create-aura3d/src/cli.ts`
- `packages/create-aura3d/templates/**`
- `docs/api/readme.md`
- `docs/templates/create-aura3d-templates.md`
- `tests/integration/v4-create-aura3d.test.ts`
- `tests/integration/v5-create-aura3d.test.ts`
- `tests/integration/v6-create-aura3d.test.ts`
- `tools/v4-package-smoke/index.ts`
- `tools/v4-template-readiness/index.ts`
- `tools/v5-template-readiness/index.ts`
- `tools/v6-template-readiness/index.ts`

Required renames:

- Package name `@galileo3d/create-g3d` -> `@aura3d/create-aura3d`.
- Bin `create-g3d` -> `create-aura3d`.
- Preserve the CLI shebang and executable behavior while changing the bin name. Verify generated `dist/cli.js`, package `bin`, `npm create aura3d@latest`, `npm exec create-aura3d`, `npx create-aura3d`, `pnpm create aura3d`, and `pnpm dlx create-aura3d` examples/tests all agree.
- Root package export `./create-g3d` -> `./create-aura3d`.
- `CreateG3DTemplate` -> `CreateA3DTemplate`.
- `CreateG3DProjectOptions` -> `CreateA3DProjectOptions`.
- `CreateG3DProjectResult` -> `CreateA3DProjectResult`.
- `createG3DProject` -> `createA3DProject`.
- `writeCreateG3DReport` -> `writeCreateA3DReport`.
- Default target `g3d-app` -> `aura3d-app`.
- Error `Unknown create-g3d template` -> `Unknown create-aura3d template`.
- Generated project dependency `@galileo3d/engine` -> `@aura3d/engine`.
- Docs command `npm create g3d@latest` -> `npm create aura3d@latest`.
- Example app name `my-g3d-app` -> `my-aura3d-app`.
- Root package `exports["./create-g3d"]` and `files: ["dist/create-g3d"]` -> `./create-aura3d` and `dist/create-aura3d`.
- Create package manifest `bin: {"create-g3d":"./dist/cli.js"}` -> `bin: {"create-aura3d":"./dist/cli.js"}`.
- Package-smoke and template-readiness tools must assert the new import specifier `@aura3d/engine/create-aura3d`, new package files, and new `npm create aura3d@latest` command.
- Generated API docs must replace `@galileo3d/engine/create-g3d` with `@aura3d/engine/create-aura3d`.

### Template Manifests And UI

Affected template roots:

- `templates/asset-viewer`
- `templates/game-slice`
- `templates/product-configurator`
- `templates/react`
- `templates/svelte`
- `templates/vite-vanilla`
- `templates/vue`
- `templates/v4-asset-gallery`
- `templates/v4-interactive-scene`
- `templates/v4-material-studio`
- `templates/v4-product-viewer`
- `templates/v5-*`
- `templates/v6-architecture-viewer`
- `templates/v6-asset-inspector`
- `templates/v6-material-studio`
- `templates/v6-product-configurator`
- `templates/v6-product-viewer`
- `templates/v6-webgpu-starter`
- `packages/create-aura3d/templates/**`

Required renames:

- Package names `galileo3d-*-template` -> `aura3d-*-template`.
- Package names `g3d-v4-*`, `g3d-v6-*` -> `aura3d-v4-*`, `aura3d-v6-*`.
- Dependencies `@galileo3d/engine` -> `@aura3d/engine`.
- Imports `@galileo3d/engine/...` -> `@aura3d/engine/...`.
- Framework component imports in `*.tsx`, `*.jsx`, `*.svelte`, and any future `*.vue` template files must be updated with the same rules as TypeScript source.
- `document.body.dataset.g3dTemplate` -> `document.body.dataset.a3dTemplate`.
- `window.__g3dProductViewerCapture` -> `window.__a3dProductViewerCapture`.
- Asset schema `g3d-v6-template-assets/v1` -> `a3d-v6-template-assets/v1`.
- Asset schema `g3d-v7-template-assets/v1` -> `a3d-v7-template-assets/v1`.
- Titles `G3D V6 ...` -> `A3D V6 ...`.
- CSS classes `.g3d-v6-panel`, `.g3d-v6-metrics` -> `.a3d-v6-panel`, `.a3d-v6-metrics`.
- README headings `create-g3d ... Template` -> `create-aura3d ... Template`.

## Application Frontend Work

No file or directory names under `apps/**` contain the legacy brand. All app work is content/API/metadata.

### App HTML Titles And Visible Labels

Update visible `G3D`/`Galileo3D` title and aria copy in:

- `apps/animation-studio-pro/index.html`
- `apps/asset-lab/index.html`
- `apps/asset-studio-pro/index.html`
- `apps/editor/index.html`
- `apps/game-lab/index.html`
- `apps/interactive-showcase-pro/index.html`
- `apps/material-lab/index.html`
- `apps/material-studio-pro/index.html`
- `apps/product-studio/index.html`
- `apps/scene-lab/index.html`
- `apps/scene-studio-pro/index.html`
- `apps/v6-*/index.html`
- `apps/v7-*/index.html`
- `apps/v8-*/index.html`
- `apps/v9-*/index.html`
- `apps/wow-*/index.html`

Examples:

- `Galileo3D Editor` -> `Aura3D Editor`.
- `G3D Animation Studio Pro` -> `A3D Animation Studio Pro`.
- `G3D V8 Camera` -> `A3D V8 Camera`.
- `Loading advanced G3D gallery...` -> `Loading advanced A3D gallery...`.
- `aria-label="G3D camera example viewport"` -> `aria-label="A3D camera example viewport"`.

### Static HTML, Harnesses, And Tool Pages

Static HTML must be audited independently from app TypeScript because many browser contracts live only in HTML:

- `apps/**/index.html`
- `examples/**/index.html`
- `templates/**/index.html`
- `packages/create-aura3d/templates/**/index.html`
- `tests/browser/*harness.html`
- `tools/**/index.html`
- release/demo HTML under `release-artifacts/**`

Required actions:

- Rename `<title>`, headings, labels, loading text, route descriptions, and inline documentation copy from Galileo3D/G3D to Aura3D/A3D.
- Rename DOM ids, canvas ids, `data-testid`, `data-*`, `aria-label`, CSS classes, inline CSS selectors, and browser-harness selectors from `g3d*`/`galileo*` to `a3d*`/`aura3d*`.
- Update route registry HTML such as root `index.html`, `examples/index.html`, and tool route pages so browser tests, Playwright locators, and screenshot names use the new ids consistently.
- Treat HTML generated by the create tool or release demos as generated output. Update source templates first, regenerate, then scan the generated HTML.

### Editor App And Saved Project Contracts

Files:

- `apps/editor/src/EditorShell.ts`
- `apps/editor/src/main.ts`
- `apps/editor/src/project/ProjectSerializer.ts`
- `apps/editor/src/panels/AssetBrowserPanel.ts`
- `apps/editor/src/panels/HierarchyPanel.ts`
- `apps/editor/src/viewport/EditorViewport.ts`
- `apps/editor/src/export/StaticProjectExporter.ts`
- `packages/editor-runtime/**`
- `examples/editor-authored-*/project.json`
- Editor browser/unit tests

Required renames:

- `__GALILEO3D_EDITOR_APP__` -> `__AURA3D_EDITOR_APP__`.
- `__GALILEO3D_EXPORTED_PROJECT__` -> `__AURA3D_EXPORTED_PROJECT__`.
- Plugin id `galileo.default-authoring` -> `aura3d.default-authoring`.
- `authoringTool: "galileo3d-browser-editor"` -> `authoringTool: "aura3d-browser-editor"`.
- `runtimePackage: "@galileo3d/editor-runtime"` -> `runtimePackage: "@aura3d/editor-runtime"`.
- `Untitled Galileo3D Scene` -> `Untitled Aura3D Scene`.
- `Galileo3D Editor Export` -> `Aura3D Editor Export`.
- `Galileo3D V4 Editor Export` -> `Aura3D V4 Editor Export`.
- `g3d-prov-*` -> `a3d-prov-*`.
- `galileo3d:editor-state:v4` -> `aura3d:editor-state:v4` or a bumped `aura3d:editor-state:v5` if persisted state shape changes.
- `galileo3d-prefab-v1` -> `aura3d-prefab-v1` or a bumped schema if prefab JSON shape changes.
- `g3d-editor-project/v1` -> `a3d-editor-project/v1` or a bumped schema if project JSON shape changes.
- Static export selectors `#galileo-export` and `#galileo-export-status` -> `#aura3d-export` and `#aura3d-export-status`.
- Static exported examples under `examples/editor-authored-project`, `examples/editor-authored-v3-app`, and `examples/editor-authored-v4-app` must be regenerated or patched consistently with the runtime exporter.
- `application/x-galileo3d-asset` -> `application/x-aura3d-asset`.
- `application/x-galileo3d-node` -> `application/x-aura3d-node`.
- Error text `Galileo3D browser editor workflow` -> `Aura3D browser editor workflow`.
- Browser/unit tests must update hardcoded drag-and-drop MIME types, expected plugin arrays, expected provenance authoring tool, and expected provenance hash prefixes.

Persisted project compatibility is high risk. Add a migration step that rewrites old saved project metadata to new Aura3D metadata, then remove old accepted values before final zero-legacy verification.

Editor-runtime shader graph fixtures are also persisted/export-adjacent. Rename `g3dSurface.*`, `g3d_texcoord0`, and `createOldBranchShaderGraphFixture`-related docs/tests where they are part of current exported shader source. If any `oldBranch*` naming is kept as provenance, it must not contain old package imports, old shader markers, or legacy brand strings.

### App Globals, Datasets, Telemetry, And Runtime Contracts

Affected files include:

- `apps/v3-common/src/WorkflowWorkbench.ts`
- `apps/v5-*/src/main.ts`
- `apps/v6-common/src/runtime.ts`
- `apps/v6-product-configurator/src/main.ts`
- `apps/v7-example-parity-lab/src/main.ts`
- `apps/v8-*/src/main.ts`
- `apps/v8-animation-keyframes/src/state.ts`
- `apps/v8-skinning-ik/src/ui.ts`
- `apps/v9-advanced-examples-gallery/src/**`
- `apps/v9-public-scene/src/main.ts`
- `apps/wow-common/src/showcase.ts`
- `apps/wow-*/src/main.ts`

Required renames:

- CSS prefix `g3d-*` -> `a3d-*`.
- `Window["__G3D_V3_APP__"]` -> `Window["__A3D_V3_APP__"]`.
- `dataset.g3dApp` -> `dataset.a3dApp`.
- `__G3D_PRODUCT_STUDIO__` -> `__A3D_PRODUCT_STUDIO__`.
- Dynamic global ``__g3d${...}`` -> ``__a3d${...}``.
- `__g3dV6Runtime` -> `__a3dV6Runtime`.
- `__g3dV8AnimationKeyframes` -> `__a3dV8AnimationKeyframes`.
- `__g3dV8*` globals -> `__a3dV8*`.
- `__G3D_V9_ADVANCED_EXAMPLES_GALLERY__` -> `__A3D_V9_ADVANCED_EXAMPLES_GALLERY__`.
- `g3d-webgl2` -> `a3d-webgl2`.
- `g3d-webgpu` -> `a3d-webgpu`.
- `g3d:v9-public-scene-dispose` -> `a3d:v9-public-scene-dispose`.
- `G3D_*` glTF extension-like names -> `A3D_*`.
- App generator strings `Galileo3D ... fixture` -> `Aura3D ... fixture`.
- App shader markers `@galileo3d-shader:*` -> `@aura3d-shader:*`.
- App evidence/proof copy `G3D can ...` -> `A3D can ...`.

Final tests should inspect only new Aura3D/A3D globals. Temporary dual writes may be useful, but the old writes must be removed before final completion.

### App Import Specifiers

All `apps/**/*.ts` imports of `@galileo3d/*` must become `@aura3d/*` after the package scope and path aliases are renamed.

Examples:

- `@galileo3d/editor-runtime` -> `@aura3d/editor-runtime`.
- `@galileo3d/scene` -> `@aura3d/scene`.
- `@galileo3d/rendering` -> `@aura3d/rendering`.
- `@galileo3d/engine/advanced-runtime` -> `@aura3d/engine/advanced-runtime`.
- `@galileo3d/engine/production-runtime` -> `@aura3d/engine/production-runtime`.
- `@galileo3d/engine/workflows/production` -> `@aura3d/engine/workflows/production`.

## Examples, Templates, And Benchmarks Work

### Examples

Path-level examples do not need file/directory renames, but content needs updates.

Affected example title groups:

- `examples/{00-basic-triangle,01-basic-scene,02-materials-pbr,03-shadows,04-physics-stack,05-animation-character,06-asset-gltf,07-input-controls,08-audio-spatial,09-editor-runtime,10-particles,11-showcase-world}/index.html`
- `examples/index.html`
- `examples/webgpu-capability/index.html`
- `examples/_quarantine/*/index.html`
- `examples/{animated-character,animation-state-machine,asset-viewer,character-animation-viewer,editor-authored-game,editor-authored-project,editor-authored-v3-app,editor-authored-v4-app,forward-shadow-map-check,gltf-corpus-gallery,hdr-render-target-check,large-world-streaming,pbr-extension-texture-variants,physics-sandbox,renderer-stress-lab,rendering-large-scene,root-motion}/index.html`
- `examples/{asset-gallery-v4,asset-viewer-v1,character-viewer-v4,interactive-showcase-v4,interior-scene-v4,material-studio-v1,material-studio-v4,product-configurator-v4,product-viewer-v1,rendering-showcase-v1,v4-gallery}/index.html`
- `examples/v5/*/index.html`
- `examples/v6/*/index.html`

Required renames:

- Titles `Galileo3D ...` -> `Aura3D ...`.
- Titles `G3D ...` -> `A3D ...`.
- Imports `@galileo3d/*` -> `@aura3d/*`.
- Globals `__GALILEO3D_*`, `__G3D_*`, `__g3d*` -> Aura3D/A3D equivalents.
- `document.body.dataset.g3dExample` -> `document.body.dataset.a3dExample`.
- Example schemas `g3d-v*-.../v1` -> `a3d-v*-.../v1`.
- Editor-authored project metadata:
  - `authoringTool`
  - `runtimePackage`
  - `plugins`
  - `title`
  - `evidenceHash`
- README prose and DevTools instructions that mention `Galileo3D`, `G3D`, or old globals.

### Benchmarks

Rename path identity and runtime engine ids together:

- `BenchmarkEngine = "galileo" | "threejs" | "babylon"` -> `BenchmarkEngine = "aura3d" | "threejs" | "babylon"`.
- `engine: "galileo"` -> `engine: "aura3d"`.
- `engine: "g3d"` -> `engine: "aura3d"` unless a separate short id is required; prefer one benchmark id.
- `renderGalileoComparisonScene` -> `renderAura3DComparisonScene`.
- `renderGalileoInteractiveScene` -> `renderAura3DInteractiveScene`.
- `renderGalileoMaterialScene` -> `renderAura3DMaterialScene`.
- `renderGalileoProductScene` -> `renderAura3DProductScene`.
- `renderGalileoAssetScene` -> `renderAura3DAssetScene`.
- `GalileoComparisonResult` -> `Aura3DComparisonResult`.
- `toGalileoRenderItem`, `toGalileoGeometry` -> `toAura3DRenderItem`, `toAura3DGeometry`.
- `V5_GALILEO_SCENES` -> `V5_AURA3D_SCENES`.
- Benchmark package names `@galileo3d/benchmark-threejs` and `@galileo3d/benchmark-babylon` -> `@aura3d/benchmark-threejs` and `@aura3d/benchmark-babylon`.

Benchmark reports and comparison tools must be updated in the same batch.

## Tests, Tools, Docs, And CI Work

### Test Files

Primary test groups:

- `tests/integration/*create-g3d*` -> `*create-aura3d*`.
- `tests/assets/**` schema/import assertions.
- `tests/browser/**` app global, route, screenshot, evidence, shader marker, and telemetry assertions.
- `tests/performance/**` report schema and env/global keys.
- `tests/unit/engine/**` public API symbol assertions.
- `tests/unit/tools/**` naming-taxonomy, claim-registry, docs, generated report, and tool output assertions.
- `tests/visual/**` screenshot/report names and docs evidence references.
- `tests/templates/**` package/template name assertions.
- `tests/reports/**` generated reports to regenerate or remove.

Required renames:

- Every import `@galileo3d/*` -> `@aura3d/*`.
- Every public symbol assertion `G3D*` -> `A3D*`.
- Every browser global `__GALILEO3D_*`, `__G3D_*`, `__g3d*` -> new global names.
- High-frequency browser globals from the third pass include `__GALILEO3D_ASSET_VIEWER__`, `__GALILEO3D_PRODUCT_DEMO__`, `__GALILEO3D_GAME_DEMO__`, `__GALILEO3D_EDITOR_APP__`, `__GALILEO3D_ARCHITECTURE_DEMO__`, `__GALILEO3D_EXPORTED_PROJECT__`, `__G3D_V9_ADVANCED_EXAMPLES_GALLERY__`, `__G3D_PRODUCT_REFERENCE__`, `__G3D_PRODUCT_REFERENCE_PROGRESS__`, `__G3D_PRODUCT_MATERIAL_MATRIX__`, `__G3D_PRODUCT_MATERIAL_MATRIX_PROGRESS__`, `__g3dV6Runtime`, `__g3dWowRuntime`, `__g3dV8FlagshipViewer`, and route-specific `__g3dV8*` globals. Rename all declarations, assignments, Playwright wait conditions, and `Window` type augmentations together.
- Every schema `g3d-v*-.../v1` -> `a3d-v*-.../v1`.
- Every screenshot/report artifact filename `g3d-*.png/json` -> `a3d-*.png/json`.
- Every `tests/reports/v4-create-g3d*.json` -> regenerated `v4-create-aura3d*.json` or removed.
- Every `G3D_*` env var in tests -> `A3D_*`.
- Unit tests that synthesize package manifests must rename old fixture names such as `@galileo3d/restore-target`, `@galileo3d/external-host-fixture`, and `@galileo3d/test`.

### Tool Files

Primary tool groups:

- `tools/naming-taxonomy/**`
- `tools/advanced-gallery-evidence-paths/**`
- `tools/claim-registry/**`
- `tools/compare-engines/**`
- `tools/demo-validation/**`
- `tools/external-demo-export/**`
- `tools/package-install-smoke/**`
- `tools/v4-package-smoke/**`
- `tools/v4-template-readiness/**`
- `tools/v5-static-preview-smoke/**`
- `tools/v5-claim-registry/**`
- `tools/v*-*/**`
- `tools/verify-architecture/**`
- `tools/verify-shaders/**`

Required renames:

- Package imports and generated package references.
- Tool output schemas from `g3d-*` to `a3d-*`.
- Report reader/writer paths from `g3d-*` to `a3d-*`.
- Env var names from `G3D_*` to `A3D_*`.
- Shader marker verifier from `@galileo3d-shader` to `@aura3d-shader`.
- Test-only rendering markers from `@galileo3d-test:*` and `galileo3d-test` to `@aura3d-test:*` and `aura3d-test`.
- Naming-taxonomy tool must be extended or replaced with a brand rename audit that classifies legacy brand tokens, not only version-style paths.
- Any tool currently accepting old paths as compatibility fallback must remove old fallback before final zero-legacy gate.
- Tool/runbook GitHub references must rename `gchahal1982/G3D2025`, `https://github.com/gchahal1982/G3D2025`, and `https://gchahal1982.github.io/G3D2025/` after the target repo slug is decided.
- External evidence tools and tests must rename public-demo/external-engine env vars and expected command strings, not only implementation variables.
- Naming-taxonomy compatibility text such as "keep create-g3d/template aliases" and "keep old template/file entries" must be removed or inverted into final-state failures. The final taxonomy should prove old aliases are gone, not preserve them.
- Visual parity and external-engine tools must rename `galileoScreenshotPath`, `galileoPath`, `galileo-product.png`, and local-engine ids such as `galileo,threejs,babylon` to Aura3D/A3D equivalents.
- Test helper temp prefixes and generated fixture text must be renamed, including `g3d-tools-`, `g3d-claims-`, `g3d-v3-validation-`, `g3d-v4-validation-`, `g3d-v9-report-audit-*`, and generated strings such as `Galileo3D is better than Three.js.`.
- `tools/v4-package-smoke/index.ts` and `tools/v4-template-readiness/index.ts` must stop asserting `@galileo3d/engine/create-g3d`, `./create-g3d`, `dist/create-g3d`, `packages/create-g3d/**`, and `npm create g3d@latest`; those are package contracts, not incidental test strings.
- `tools/v5-static-preview-smoke/index.ts` must rename title text, schema `g3d-v5-static-preview-smoke/v1`, and global `window.__g3dStaticPreview` together with the browser test that polls it.
- `tools/v5-claim-registry/index.ts` must rename schema `g3d-v5-claim-registry/v1` and every generated claim/report value.
- `tests/unit/tools/master-gate-evidence.test.ts` must update expected release-artifact paths such as `release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz` when the artifact is rebuilt or externalized.
- Asset generator scripts under `tools/v9-advanced-gallery-assets/**` must rename Python/MJS helper names, object metadata, material names, HDR headers, and glTF generator strings such as `loc_g3d`, `scale_g3d`, `G3D procedural ...`, `Generated by Galileo3D ...`, `g3d_semantic_role`, and `g3d_transparency_sort_unit`.
- Static browser tool pages under `tools/**/index.html` must rename canvas ids and screenshots such as `g3d-animation-multiple`, `g3d-unreal-bloom`, `g3d-flagship-viewer`, and similar parity-viewer identifiers to A3D equivalents.
- External-engine baseline fixtures under `release-artifacts/**/fixtures/external-engine-baselines/**` must rename Unity/Unreal script paths and project identifiers such as `Assets/Galileo3D/...`, `/Game/Galileo3D/...`, `/Game/Galileo3D_V4_...`, generated log lines, and C#/Python/MJS symbols that encode the old brand.

### Runtime Id, Schema, CSS, And Report Id Families

The raw `g3d-*` token inventory is too broad to manage manually; use automated scans. Known high-risk families from the third pass:

- Execution and release schemas: `g3d-v2-execution-state`, `g3d-v3-api-audit/v1`, `g3d-v5-docs-manifest/v1`, `g3d-v10-resource-lifecycle-100-reloads/v1`, and `g3d-v10-physics-comparison-baseline/v1`.
- External evidence and deployment schemas: `g3d-static-demo-integrity-v1`, `g3d-public-demo-deployment-v1`, `g3d-public-demo-deployment-command-plan-v1`, `g3d-v4-external-evidence-handoff-package-v1`, `g3d-v4-external-evidence-transfer-v1`, `g3d-v4-external-baseline-command-plan-v1`, and `g3d-v4-asset-viewer-comparison-export-v1`.
- Visual/parity schemas: `g3d-v9-advanced-gallery-route-report/v1`, `g3d-v9-advanced-gallery-visual-regression-inventory/v1`, `g3d-v9-advanced-gallery-report-disclosure-audit/v1`, `g3d-v9-*parity/v1`, `g3d-v8-threejs-parity/v1`, `g3d-v8-route-health/v1`, `g3d-v7-webgpu-*`, `g3d-v7-*-parity/v1`, `g3d-v6-webgpu-report/v1`, and `g3d-wow-showcase-route-health/v1`.
- Tool smoke schemas and globals: `g3d-v5-static-preview-smoke/v1`, `window.__g3dStaticPreview`, `g3d-v5-claim-registry/v1`, and claim/report ids emitted by the corresponding tools.
- Product/reference schemas: `g3d-product-configurator-material-matrix/v1`, `g3d-product-configurator-reference-harness/v1`, `g3d-product-studio-scene/v1`, `g3d-product-showcase-layout/v1`, and `g3d-data-galaxy-reference/v1`.
- CSS/class/id families: `g3d-v6-panel`, `g3d-v6-metrics`, `g3d-template-canvas`, `g3d-brand`, `g3d-app`, `g3d-viewport*`, `g3d-statusline`, `g3d-sidebar`, `g3d-scene-*`, `g3d-inspector*`, `g3d-workbench`, `g3d-diagnostics*`, `g3d-canvas*`, and `g3d-dot`.
- Editor/runtime persisted ids: `galileo3d:editor-state:v4`, `galileo3d-prefab-v1`, `g3d-editor-project/v1`, `#galileo-export`, `#galileo-export-status`, `g3dSurface.*`, and `g3d_texcoord0`.
- Test-only shader/runtime marker ids: `@galileo3d-test:*`, `galileo3d-test`, and any generated marker comments that embed those ids.
- Screenshot/report artifact stems: `g3d-templates.*`, `g3d-cubemap-pmrem-atlas.png`, `g3d-transmission-pmrem.png`, `g3d-textured-*`, `g3d-hdr-skybox.png`, `g3d-pmrem-*`, `g3d-loader-material-extensions.png`, `g3d-flagship-viewer.png`, and every route screenshot stem beginning with `g3d-`.

Do not rely on this list as exhaustive. The final raw gates remain authoritative.

### Docs

Primary doc groups:

- `README.md`
- `FinalPRD.md`
- `execute.md`
- `prompt.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- Every `*.md` and `*.mdx` file under `apps/**`, `examples/**`, `fixtures/**`, `packages/**`, `templates/**`, `tests/**`, and `release-artifacts/**`
- `docs/api/**`
- `docs/assets/**`
- `docs/benchmarks/**`
- `docs/comparisons/**`
- `docs/concepts/**`
- `docs/editor/**`
- `docs/examples/**`
- `docs/project/**`
- `docs/rendering/**`
- `docs/templates/**`

Required renames:

- Brand prose `Galileo3D` -> `Aura3D`.
- Short brand prose `G3D` -> `A3D`.
- Package docs `@galileo3d/*` -> `@aura3d/*`.
- API symbols `G3D*` -> `A3D*`.
- CLI docs `create-g3d`, `npm create g3d`, `my-g3d-app` -> `create-aura3d`, `npm create aura3d`, `my-aura3d-app`.
- Absolute path docs `/Users/gurbakshchahal/G3D` -> `/Users/gurbakshchahal/Aura3D` after the repo root is renamed.
- Historical project docs under `docs/project/v*` must either be rewritten, removed from tracked codebase, or moved outside the repo if final zero legacy is mandatory.
- Markdown install and consumption snippets must be updated: `pnpm add @galileo3d/engine`, `npm install g3d@...`, `pnpm add g3d@...`, `pnpm create g3d`, `npm create g3d@latest`, `npx create-g3d`, and every `@galileo3d/*` import block.
- Markdown API snippets must rename `createG3DApp`, `G3DRenderer`, `G3DScene`, `G3D_THREEJS_EXAMPLE_PARITY_TARGETS`, `migrateThreeToG3D`, and create-tool APIs together with source.
- Markdown evidence paths must be updated or externalized, including `tests/reports/**/g3d-*.png`, `tests/reports/**/galileo-*.png`, `benchmarks/**/galileo/**`, `packages/create-g3d/**`, and release tarball paths such as `galileo3d-engine-*.tgz`.
- Markdown claim language must be reworded from "G3D/Galileo3D" to "A3D/Aura3D" without changing the evidence boundary. If a claim is historical and must preserve old wording, move the file outside the tracked repo before the strict final gate.
- Markdown URLs and badges must be updated: `https://github.com/gchahal1982/G3D2025`, `https://gchahal1982.github.io/G3D2025/`, `demo.galileo3d.com`, `demo.galileo3d.example-host.com`, Codecov flag names such as `codecov-g3d`, npm package links, and any badge alt text that names the old brand.
- Generated Markdown reports under `release-artifacts/**/tests/reports/**`, `docs/project/*migration*`, `docs/project/*inventory*`, and `docs/project/*audit*` must be regenerated or sanitized, not hand-edited in isolation.
- Every Markdown update must also be a latest-codebase accuracy update. Verify code fences, import paths, command names, package names, script names, route names, browser globals, report paths, fixture paths, and expected outputs against the current source tree after the Aura3D rename. Do not preserve stale API examples just because the rename text is correct.
- Root docs and developer-facing docs must be reconciled with the latest package surface after the rename: root `package.json` exports/files, workspace package names, `packages/*/README.md`, `docs/api/public-api.md`, `docs/api/readme.md`, template docs, release docs, and package-consumption docs must all describe the same current install/import/build flow.
- Roadmap, claim, comparison, and evidence docs must be updated to the latest completed work and latest known gaps. Do not keep old V2/V3/V4/V5/V6/V7/V8/V9/V10 status language if the current codebase has moved beyond it, unless the file is intentionally archived outside the strict final gate.
- If documentation is intentionally retained as historical record, place it outside the repository or under a clearly excluded external archive. Keeping old names in tracked Markdown means the final broad, raw, and Markdown-specific gates cannot pass.

Docs pass order:

- [ ] Enumerate all Markdown files with `find . ... -name '*.md' -o -name '*.mdx'`.
- [ ] Run the Markdown gate before source edits to create an inventory grouped by root README, package README, app/example README, `docs/**`, templates, tests, and release artifacts.
- [ ] Update active developer docs first: root README, package READMEs, API docs, templates docs, getting-started docs, migration docs, release docs, and support/security docs.
- [ ] For each active Markdown file, verify the content against the latest codebase state before marking it complete: package exports, current public symbols, scripts, test commands, app routes, template names, generated report locations, release artifacts, and supported/blocked claims.
- [ ] Update generated docs from generators where possible; if no generator exists, mark the file as hand-authored and patch it deliberately.
- [ ] Re-run or inspect documentation-generation/API-report tooling after source rename so generated Markdown reflects the latest code rather than stale pre-rename declarations.
- [ ] Decide the fate of historical roadmap/PRD docs before final verification. Sanitizing them may change historical wording; externalizing them may be more accurate if the zero-legacy gate is non-negotiable.
- [ ] Re-run Markdown gate and broad gate after generated reports and release artifacts are regenerated.

## Generated, Dist, Reports, And Release Artifact Work

Generated artifacts dominate the legacy count. Do not rely on source renames alone.

### Generated Outputs To Clean Or Regenerate

- `dist/**`
- `packages/*/dist/**`
- `packages/create-g3d/dist/**` after directory rename
- `tests/reports/**`
- `release-artifacts/**`
- `*.tgz` release bundles
- `*.tar.gz`, `*.zip`, and checksum sidecars such as `*.sha256`
- Generated naming-taxonomy reports and generated API docs
- Source maps containing old source paths
- `pnpm-lock.yaml`
- Any package-local `node_modules` or symlinked dependency tree

Explicit generated path inventory from the second pass:

| Current Generated Path Class | Required Final State |
| --- | --- |
| `dist/benchmarks/galileo` | Remove and regenerate as `dist/benchmarks/aura3d` if generated benchmark output stays tracked. |
| `dist/create-g3d` | Remove and regenerate as `dist/create-aura3d`. |
| `dist/packages/create-g3d` | Remove and regenerate as `dist/packages/create-aura3d`. |
| `dist/engine/G3D*.{js,d.ts,map}` | Remove and regenerate as `A3D*` output. |
| `dist/engine/v9/G3D*.{js,d.ts,map}` | Remove and regenerate as `A3D*` output. |
| `dist/packages/engine/src/G3D*.{js,d.ts,map}` | Remove and regenerate as `A3D*` output. |
| `dist/packages/engine/src/v9/G3D*.{js,d.ts,map}` | Remove and regenerate as `A3D*` output. |
| `dist/packages/three-compat/src/migration/ThreeToG3DAdapter.*` | Remove and regenerate as `ThreeToA3DAdapter.*`. |
| `dist/three-compat/migration/ThreeToG3DAdapter.*` | Remove and regenerate as `ThreeToA3DAdapter.*`. |
| `dist/tests/integration/v4-create-g3d.test.*` | Remove and regenerate as `v4-create-aura3d.test.*` only if compiled tests remain tracked. |
| `dist/tests/integration/v5-create-g3d.test.*` | Remove and regenerate as `v5-create-aura3d.test.*` only if compiled tests remain tracked. |
| `dist/tests/integration/v6-create-g3d.test.*` | Remove and regenerate as `v6-create-aura3d.test.*` only if compiled tests remain tracked. |
| `packages/engine/dist/G3D*.{js,d.ts,map}` | Remove and regenerate as `A3D*` output. |
| `packages/engine/dist/v9/G3D*.{js,d.ts,map}` | Remove and regenerate as `A3D*` output. |
| `packages/three-compat/dist/migration/ThreeToG3DAdapter.*` | Remove and regenerate as `ThreeToA3DAdapter.*`. |
| `tests/reports/v4-create-g3d*.json` | Regenerate as `v4-create-aura3d*.json` or remove if stale. |
| `release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz` | Replace with an Aura3D tarball or move outside the tracked repo. |
| `release-artifacts/v4-external-evidence-handoff.tar.gz` | Rebuild as an Aura3D archive or move outside the tracked repo; current member paths include old `galileo-*.png` visual evidence names. |
| `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256` | Regenerate after archive rename/rebuild so both the checksum and embedded filename point at the Aura3D archive. |
| `docs/project/naming-taxonomy-migration-report.md` and generated taxonomy docs | Regenerate or rewrite so old alias-preservation decisions are gone. |

### Required Actions

- [ ] Delete or clean generated `dist/**` output before final audit.
- [ ] Rebuild after all source/package renames.
- [ ] Regenerate package declarations so `.d.ts` and `.d.ts.map` files reference `A3D*` files and `@aura3d/*` imports.
- [ ] Regenerate tests/reports or remove stale checked-in reports.
- [ ] Replace `release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz` with a new Aura3D artifact or move it outside the tracked repository.
- [ ] Inspect every tarball with `tar -tzf` and `tar -xOzf ... package/package.json`; current tarball still contains `@galileo3d/engine`, `@galileo3d/*` dependencies, and `G3D_*` scripts.
- [ ] Inspect every `.tgz`, `.tar.gz`, `.zip`, and checksum sidecar. Archive file names, member paths, extracted text, package metadata, and sidecar filename text must all be Aura3D/A3D or absent.
- [ ] Regenerate checksum sidecars after archive rebuilds; do not reuse hashes or sidecar text from the old artifact names.
- [ ] Remove or regenerate patch/runbook artifacts such as `release-artifacts/**/*.patch`, `release-artifacts/*handoff*.patch`, `release-artifacts/*evidence*.patch`, `release-artifacts/*supplement*.patch`, and nested `release-artifacts/v4-external-evidence-handoff/release-artifacts/**`; these files intentionally preserve old code and command text and are not safe final-state artifacts under a zero-legacy policy.
- [ ] Replace GitHub repo references such as `gchahal1982/G3D2025`, `https://github.com/gchahal1982/G3D2025`, and `https://gchahal1982.github.io/G3D2025/` with the chosen Aura3D repo and Pages slugs, or externalize those historical handoff files.
- [ ] Replace branch refs such as `preserve/g3d-v2-execution-state` and `refs/heads/preserve/g3d-v2-execution-state` with the chosen Aura3D branch convention, or externalize historical files that must preserve the old branch name.
- [ ] Regenerate lockfile with `pnpm install --lockfile-only`.
- [ ] Remove `examples/node_modules/g3d` and `packages/*/node_modules/@galileo3d` before final scan.
- [ ] Remove symlinked package-local dependency trees before tests as well as before scans; stale links can cause recursive `ELOOP` failures and stale report paths.
- [ ] Regenerate or remove JSON test reports containing absolute `/Users/gurbakshchahal/G3D` paths.
- [ ] Rebuild or remove external demo bundles under `release-artifacts/**/external-demos/**`; minified bundles can contain old runtime strings even when filenames look clean.

## Implementation Phases

### Phase 0: Freeze And Inventory

- [ ] Commit or stash unrelated work before rename implementation starts.
- [ ] Record current `git status --short`.
- [ ] Run the broad inventory commands in this PRD and save outputs as local artifacts outside the repo.
- [ ] Run an extension inventory and assign an owner/action for every extension that contains a legacy hit; do not assume only TypeScript and Markdown matter.
- [ ] Create an implementation branch and keep the rename isolated from unrelated functional refactors.
- [ ] Use `git mv` for tracked path renames. On case-insensitive filesystems, use a temporary intermediate path when needed so Git records the rename cleanly.
- [ ] Treat generated output, lockfiles, and release bundles as regeneration targets rather than source files.
- [ ] Use structured parsers for JSON, package manifests, lockfiles, glTF, and tarball metadata wherever practical.
- [ ] Do not run regex replacements over binary files, base64 buffers, source maps, or tarballs.
- [ ] Decide whether any old compatibility alias is allowed temporarily. Final state must remove it.
- [ ] Decide whether historical docs/release artifacts remain in the tracked repo. If yes, the strict "nothing legacy remains" goal cannot be met.
- [ ] Decide the lifecycle for `renamePRD.md`: keep it only during implementation, then move/remove/sanitize it before final zero-match verification.
- [ ] Decide the target GitHub repository slug and Pages URL before rewriting `G3D2025` references.
- [ ] Decide whether local Git remotes/upstreams and GitHub project settings move immediately with this rename or in a coordinated release step; record the chosen order before publishing.
- [ ] Decide npm registry ownership, package deprecation, dist-tag, provenance, and migration-package policy before the first Aura3D publish attempt.
- [ ] Inventory every `*.md` and `*.mdx` file, including docs, package READMEs, app/example READMEs, template READMEs, fixture READMEs, and release-artifact Markdown reports.

### Phase 1: Root Identity And Package Scope

- [ ] Rename root package name to `@aura3d/engine`.
- [ ] Rename every workspace package manifest to `@aura3d/*`.
- [ ] Rename `@galileo3d/create-g3d` to `@aura3d/create-aura3d`.
- [ ] Update package dependencies in every package manifest.
- [ ] Update manifest publish/import/CLI fields including `bin`, `exports`, `files`, `typesVersions`, `repository`, `bugs`, `homepage`, `publishConfig`, `keywords`, and `description`.
- [ ] Update template, benchmark, and release handoff package manifests, preserving existing version ranges and special versions such as `0.0.0-rebuild`.
- [ ] Verify the target `@aura3d/*` packages and `create-aura3d` package names are owned/available in the intended registry and that publish tokens have access before any destructive package rename is released.
- [ ] Update `tsconfig.base.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `playwright.config.ts`.
- [ ] Update root `package.json` exports/files/scripts.
- [ ] Regenerate `pnpm-lock.yaml` and verify old workspace link keys such as `packages/create-g3d` are gone.
- [ ] Run package/import gate.

### Phase 2: Source Path Renames

- [ ] `git mv packages/create-g3d packages/create-aura3d`.
- [ ] `git mv packages/engine/src/G3DApp.ts packages/engine/src/A3DApp.ts`.
- [ ] `git mv packages/engine/src/G3DQualityPresets.ts packages/engine/src/A3DQualityPresets.ts`.
- [ ] `git mv packages/engine/src/v9/G3DAppLifecycle.ts packages/engine/src/v9/A3DAppLifecycle.ts`.
- [ ] `git mv packages/engine/src/v9/G3DRenderer.ts packages/engine/src/v9/A3DRenderer.ts`.
- [ ] `git mv packages/engine/src/v9/G3DScene.ts packages/engine/src/v9/A3DScene.ts`.
- [ ] `git mv packages/three-compat/src/migration/ThreeToG3DAdapter.ts packages/three-compat/src/migration/ThreeToA3DAdapter.ts`.
- [ ] `git mv benchmarks/galileo benchmarks/aura3d`.
- [ ] `git mv benchmarks/foundation/galileo benchmarks/foundation/aura3d`.
- [ ] `git mv benchmarks/foundation/aura3d/render-galileo-scene.ts benchmarks/foundation/aura3d/render-aura3d-scene.ts`.
- [ ] `git mv benchmarks/external-parity/galileo benchmarks/external-parity/aura3d`.
- [ ] `git mv benchmarks/three-compat/galileo benchmarks/three-compat/aura3d`.
- [ ] `git mv benchmarks/production-runtime/g3d benchmarks/production-runtime/aura3d`.
- [ ] `git mv docs/templates/create-g3d-templates.md docs/templates/create-aura3d-templates.md`.
- [ ] `git mv tests/integration/v4-create-g3d.test.ts tests/integration/v4-create-aura3d.test.ts`.
- [ ] `git mv tests/integration/v5-create-g3d.test.ts tests/integration/v5-create-aura3d.test.ts`.
- [ ] `git mv tests/integration/v6-create-g3d.test.ts tests/integration/v6-create-aura3d.test.ts`.
- [ ] Update every import/path reference caused by the file moves.
- [ ] Run path gate.

### Phase 3: Public API Symbol Rename

- [ ] Rename all `G3D*` public symbols to `A3D*`.
- [ ] Rename all `createG3D*` public functions to `createA3D*`.
- [ ] Rename all `CreateG3D*` public types to `CreateA3D*`.
- [ ] Rename all `migrateThreeToG3D` APIs to `migrateThreeToA3D`.
- [ ] Update docs/api generated public API reference.
- [ ] Update public API tests.
- [ ] Remove temporary old symbol aliases before final gate.

### Phase 4: Runtime IDs, Schemas, Shaders, And Asset Contracts

- [ ] Rename runtime telemetry strings from `g3d-*` to `a3d-*`.
- [ ] Rename shader registry names from `galileo3d/*` to `aura3d/*`.
- [ ] Rename shader markers from `@galileo3d-shader` and `@g3d-*` to `@aura3d-shader` and `@a3d-*`.
- [ ] Rename GLSL/WGSL structs, constants, and helpers from `G3D*`/`g3d*` to `A3D*`/`a3d*`.
- [ ] Rename schemas from `g3d-v*-.../v1` to `a3d-v*-.../v1`.
- [ ] Rename asset runtime markers from `#galileo3d-runtime:` to `#aura3d-runtime:`.
- [ ] Rename glTF userData prefix `g3d_` to `a3d_`.
- [ ] Migrate fixture manifests, glTF generator strings, test asset corpus metadata, and schema assertions.
- [ ] Inspect GLB JSON chunks, Blender source metadata, SVG metadata, and image/texture metadata before regenerating or replacing binary/rich assets.
- [ ] Update Python/MJS asset generators before regenerating GLB/HDR/manifest fixtures so generated metadata does not reintroduce old names.
- [ ] Resolve the accidental base64 `G3D` hit in the Vulkan sample `.gltf` by regenerating or restructuring the asset; do not whitelist it.
- [ ] Update tests and fixtures that assert these values.

### Phase 5: Apps And Editor Migration

- [ ] Update all app imports to `@aura3d/*`.
- [ ] Update all app HTML titles and aria labels to Aura3D/A3D.
- [ ] Update static HTML-only contracts in apps, examples, templates, tools, browser harnesses, and release/demo HTML.
- [ ] Update framework component source files such as `*.tsx`, `*.jsx`, `*.svelte`, and future `*.vue` files.
- [ ] Update editor global/export/provenance/plugin/MIME strings.
- [ ] Update editor persisted schemas, localStorage key, prefab schema, project schema, static export selectors, shader graph generated symbols, and editor-authored exported examples.
- [ ] Migrate editor-authored project JSON metadata.
- [ ] Update app globals from `__GALILEO3D_*`, `__G3D_*`, `__g3d*` to Aura3D/A3D equivalents.
- [ ] Update data attributes from `g3d*` to `a3d*`.
- [ ] Update runtime telemetry from `g3d-webgl2`/`g3d-webgpu` to `a3d-webgl2`/`a3d-webgpu`.
- [ ] Update gallery/evidence text.
- [ ] Update app browser tests.
- [ ] Remove any dual old global writes before final gate.

### Phase 6: Examples, Templates, And Create Tool

- [ ] Rename create package API, bin, docs, reports, and tests.
- [ ] Update create-tool contract verifiers such as `tools/v4-package-smoke/index.ts`, `tools/v4-template-readiness/index.ts`, and generated API docs so they assert `create-aura3d` contracts.
- [ ] Rename template package names and dependencies.
- [ ] Rename template titles, CSS classes, datasets, globals, and schemas.
- [ ] Rename example titles, imports, globals, datasets, schemas, and README instructions.
- [ ] Update template readiness tools.
- [ ] Update browser template tests.

### Phase 7: Benchmarks, Tools, Docs, And CI

- [ ] Rename benchmark engine ids and function names.
- [ ] Update benchmark report generators/readers.
- [ ] Update `tools/**` imports, schemas, env vars, report paths, and output text.
- [ ] Update `.github/**` workflows and issue templates.
- [ ] Update external-engine baseline workflows, public demo deployment workflows, GitHub readiness tools, and associated unit tests for the full `G3D_*` env var inventory.
- [ ] Update v5 static-preview and claim-registry smoke tools, schemas, globals, and tests.
- [ ] Update master-gate evidence tests that reference old release artifact filenames.
- [ ] Update `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `FinalPRD.md`, `execute.md`, `prompt.md`, all active `docs/**`, and every package/app/example/template Markdown file.
- [ ] Update Markdown URLs, badges, install snippets, package import snippets, claim language, and evidence paths; externalize historical Markdown that must preserve old wording.
- [ ] Decide and execute archive handling for historical `docs/project/**` and `release-artifacts/**`.
- [ ] Regenerate or rewrite generated naming-taxonomy reports that still preserve old alias decisions.
- [ ] Update docs generation tests and generated API docs.

### Phase 8: Regeneration And Cleanup

- [ ] Remove stale generated output.
- [ ] Run `pnpm install --lockfile-only`.
- [ ] Run build/type generation.
- [ ] Delete and regenerate source maps, declaration maps, and generated declaration output; scan `sources`, `sourcesContent`, and declaration paths for old names.
- [ ] Regenerate API docs.
- [ ] Regenerate test reports only with Aura3D/A3D names.
- [ ] Rebuild release artifacts with Aura3D package metadata.
- [ ] Rebuild compressed handoff archives and regenerate checksum sidecars.
- [ ] Rebuild or remove external demo bundles and source maps.
- [ ] Inspect rebuilt tarballs for both filename and internal package metadata.
- [ ] Run `npm pack --dry-run --json` and inspect the packed file list before any publish step.
- [ ] Run tracked-only, archive/checksum, and Git remote config gates in addition to the broad whole-worktree gates.
- [ ] Run absolute path, environment/repo slug, static non-TS text, component/vector/shader source, binary asset/cache, package-manager metadata, and raw text/binary-aware gates after generated reports are regenerated.
- [ ] Remove `.DS_Store`, `__pycache__/**/*.pyc`, stale `test-results/**` files, and package-local `node_modules` artifacts from the final audited tree unless intentionally untracked and ignored.
- [ ] Run Git refs/worktree/submodule checks and registry/release-management checks before the publish run.
- [ ] Move, remove, or sanitize `renamePRD.md` before the final strict audit.
- [ ] Re-run every final gate.

## Verification Gates

The goal is not complete until all gates pass.

### Broad Legacy Text Gate

Expected final result: zero lines.

```bash
rg --hidden --no-ignore -n -F \
  -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
  -e 'Galileo' -e 'galileo' -e 'GALILEO' \
  -e 'G3D' -e 'g3d' -e '@g3d' -e 'create-g3d' -e '.g3d' \
  . -g '!**/.git/**' -g '!**/node_modules/**'
```

This command will intentionally fail while `renamePRD.md` remains tracked because this planning artifact names the old identifiers. Run it as the final gate only after this file has been moved outside the repo, removed, or replaced with a sanitized completion artifact.

### Raw Text And Binary-Aware Gate

Expected final result: zero files. This catches binary-like assets, minified bundles, source maps, tarball-adjacent generated files, and JSON reports that default `rg` may skip or make unreadable.

```bash
rg --hidden --no-ignore -a -l -F \
  -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
  -e 'Galileo' -e 'galileo' -e 'GALILEO' \
  -e 'G3D' -e 'g3d' -e '@g3d' -e 'create-g3d' -e '.g3d' \
  . -g '!**/.git/**' -g '!**/node_modules/**'
```

If this gate reports binary or bundled files, prefer regeneration or removal. Do not patch binary payloads directly unless the asset generator cannot be rerun and the replacement is verified visually/functionally.

### Tracked Legacy Gate

Expected final result: zero lines. This gate is intentionally limited to tracked files so it proves the committed library is clean even if local generated artifacts still exist during development.

```bash
git ls-files -z | xargs -0 rg -n -F \
  -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
  -e 'Galileo' -e 'galileo' -e 'GALILEO' \
  -e 'G3D' -e 'g3d' -e '@g3d' -e 'create-g3d' -e '.g3d' \
  -e '@galileo3d' -e 'G3D2025' -e 'gchahal1982/G3D2025' \
  --
```

Run this before and after generated cleanup. If it is clean but the broad whole-worktree gate still fails, the remaining work is generated/untracked artifact cleanup rather than committed source cleanup.

### Markdown And Docs Gate

Expected final result: zero lines after active docs are migrated and historical Markdown is externalized or sanitized.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name '*.md' -o -name '*.mdx' \) -print0 |
  xargs -0 rg -n -F \
    -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
    -e 'Galileo' -e 'galileo' -e 'GALILEO' \
    -e 'G3D' -e 'g3d' -e '@g3d' -e '@galileo3d' \
    -e 'create-g3d' -e '.g3d' -e 'G3D2025' \
    -e 'demo.galileo3d.com' -e 'demo.galileo3d.example-host.com' \
    -e 'codecov-g3d' -e 'npm create g3d' -e 'pnpm create g3d' \
    --
```

Run this gate separately from the broad source gate so documentation owners can review claim wording, install snippets, badges, public URLs, and historical roadmap language deliberately. This gate will intentionally fail while `renamePRD.md` remains in the repo because this planning artifact names the old identifiers. Markdown files that are generated reports should be regenerated; Markdown files that are historical records should be moved outside the tracked repo if their old wording must remain intact.

### Static Non-TypeScript Text Gate

Expected final result: zero lines after static HTML, workflow/config text, script fixtures, and external-editor baseline files are migrated or externalized.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name '*.html' -o -name '*.css' -o -name '*.scss' \
  -o -name '*.yml' -o -name '*.yaml' \
  -o -name '*.py' -o -name '*.cs' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sh' \) -print0 |
  xargs -0 rg -n -F \
    -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
    -e 'Galileo' -e 'galileo' -e 'GALILEO' \
    -e 'G3D' -e 'g3d' -e '@g3d' -e '@galileo3d' \
    -e 'create-g3d' -e '.g3d' -e 'G3D2025' \
    -e 'Assets/Galileo3D' -e '/Game/Galileo3D' \
    -e 'codecov-g3d' -e 'g3d-coverage' \
    --
```

This gate intentionally overlaps with the broad gate but gives owners a smaller, actionable file class: HTML route pages and browser harnesses, workflow YAML, package-manager hooks, Python/MJS asset generators, Unity/Unreal scripts, C# external-engine fixtures, and shell command wrappers. Fix source templates before generated HTML or script output.

### Component, Vector, And Shader Source Gate

Expected final result: zero lines. This gate covers source-like file types that are easy to miss when owners split the work into TypeScript, docs, and static HTML.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name '*.tsx' -o -name '*.jsx' -o -name '*.svelte' -o -name '*.vue' \
  -o -name '*.svg' -o -name '*.glsl' -o -name '*.wgsl' \) -print0 |
  xargs -0 rg -n -F \
    -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
    -e 'Galileo' -e 'galileo' -e 'GALILEO' \
    -e 'G3D' -e 'g3d' -e '@g3d' -e '@galileo3d' \
    -e 'create-g3d' -e '.g3d' -e '@galileo3d-shader' -e '@g3d-' \
    --
```

For SVGs, inspect `id`, `class`, `data-*`, `<title>`, `<desc>`, and embedded metadata before minifying or regenerating. For shader files, update registry constants, runtime imports, shader verifier expectations, and browser/unit tests in the same commit.

### Path Gate

Expected final result: zero paths.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name '*Galileo3D*' -o -name '*galileo3d*' -o -name '*GALILEO3D*' \
  -o -name '*Galileo*' -o -name '*galileo*' -o -name '*GALILEO*' \
  -o -name '*G3D*' -o -name '*g3d*' -o -name '*@g3d*' \
  -o -name '*create-g3d*' -o -name '*.g3d*' \) -print
```

### Package And Import Gate

Expected final result: zero lines.

```bash
rg --hidden --no-ignore -n -F \
  -e '@galileo3d/' -e '@g3d/' -e 'create-g3d' -e './create-g3d' \
  -e 'npm create g3d' -e 'pnpm create g3d' -e 'g3d@' \
  -e 'G3D2025' -e 'gchahal1982/G3D2025' \
  . -g '!**/.git/**' -g '!**/node_modules/**'
```

### Environment And Repo Slug Gate

Expected final result: zero lines.

```bash
rg --hidden --no-ignore -n \
  '\b(G3D_[A-Z0-9_]+|GALILEO3D_[A-Z0-9_]+|G3D2025|gchahal1982/G3D2025|github\.com/gchahal1982/G3D2025|github\.io/G3D2025|preserve/g3d-v2-execution-state|refs/heads/preserve/g3d-v2-execution-state)\b' \
  . -g '!**/.git/**' -g '!**/node_modules/**'
```

This gate catches source, docs, workflows, release handoffs, tests, generated reports, and patch files. If any old repo slug is intentionally historical, move that artifact outside the tracked repository before final verification.

### Git Remote Config Gate

Expected final result: zero lines after local remotes/upstreams and project settings are migrated. This gate is not a tracked-source gate; it prevents accidental pushes, release tags, or package publishing against the old repository.

```bash
git remote -v | rg -n -F -e 'G3D2025' -e 'G3D' -e 'g3d' -e 'Galileo' -e 'galileo'
git config --get-regexp '^(remote\..*\.url|branch\..*\.(remote|merge)|init\.defaultBranch|github\.)' | rg -n -F -e 'G3D2025' -e 'G3D' -e 'g3d' -e 'Galileo' -e 'galileo'
```

If the target repo migration intentionally happens after the code rename, record that as a release blocker and do not publish packages or tags from the old remote.

### Git Refs, Worktree, And Submodule Gate

Expected final result: zero lines after the repository path, local refs, tags, and any submodules are aligned with the Aura3D identity.

```bash
git branch --format='%(refname:short)' --all | rg -n -F -e 'G3D' -e 'g3d' -e 'Galileo' -e 'galileo'
git tag --list | rg -n -F -e 'G3D' -e 'g3d' -e 'Galileo' -e 'galileo'
git worktree list --porcelain | rg -n -F -e 'G3D' -e 'g3d' -e 'Galileo' -e 'galileo'
git submodule status --recursive | rg -n -F -e 'G3D' -e 'g3d' -e 'Galileo' -e 'galileo'
```

If historical tags intentionally retain old release names, document that as a release-management exception outside the strict source/package gate. Do not use old-named tags, branches, or worktree paths for the final publish run.

### Absolute Path Gate

Expected final result: zero lines.

```bash
rg --hidden --no-ignore -n -F \
  -e '/Users/gurbakshchahal/G3D' -e '/absolute/path/to/G3D' \
  . -g '!**/.git/**' -g '!**/node_modules/**'
```

Run this after the repository root rename and after regenerating test reports. Reports and runbooks should contain `/Users/gurbakshchahal/Aura3D` or neutral placeholders such as `/absolute/path/to/Aura3D`, not the old path.

### Publish Pack Gate

Expected final result: package tarball file list and package metadata contain only Aura3D/A3D names.

```bash
npm pack --dry-run --json > /tmp/aura3d-pack-dry-run.json
rg -n -F -e 'Galileo3D' -e 'galileo3d' -e 'G3D' -e 'g3d' -e '@galileo3d' -e 'create-g3d' /tmp/aura3d-pack-dry-run.json
```

If an actual pack artifact is produced during release validation, inspect it before publishing:

```bash
npm pack --pack-destination /tmp --json > /tmp/aura3d-pack.json
node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("/tmp/aura3d-pack.json","utf8"))[0].filename; console.log(p)'
tar -tzf "/tmp/$(node -e 'const fs=require("fs"); process.stdout.write(JSON.parse(fs.readFileSync("/tmp/aura3d-pack.json","utf8"))[0].filename)')" | rg -F -e galileo -e g3d -e G3D -e create-g3d
```

### Registry And Release Management Gate

Expected final result: every external release target is Aura3D/A3D, and old package names have an explicit migration/deprecation plan before any publish.

Manual checklist:

- [ ] Confirm npm organization/scope access for `@aura3d/*` and the create package name.
- [ ] Confirm `publishConfig`, package access level, provenance/signature settings, and 2FA requirements match the Aura3D release policy.
- [ ] Confirm dist-tags such as `latest`, `next`, and any alpha/beta tags will be applied to Aura3D packages only.
- [ ] Confirm old `@galileo3d/*`, `@galileo3d/create-g3d`, `g3d`, or `create-g3d` packages are not accidentally republished from renamed code.
- [ ] Decide whether old packages are deprecated with migration messages, kept as non-shipping stubs, or left untouched; record the decision before release.
- [ ] Confirm GitHub release names, release tags, changelog links, package provenance links, Codecov project/flags, Pages URL, CDN URLs, and docs deployment targets all use the chosen Aura3D slugs.
- [ ] Confirm any migration script, codemod, or compatibility package uses Aura3D/A3D names and does not preserve old aliases in final shipping source.

### Lockfile And Manifest Gate

Expected final result: zero lines.

```bash
rg --hidden --no-ignore -n -F \
  -e '@galileo3d/' -e '@galileo3d' -e '@g3d/' -e 'packages/create-g3d' \
  -e 'link:packages/create-g3d' -e 'create-g3d' \
  package.json pnpm-workspace.yaml pnpm-lock.yaml .pnpmfile.cjs .npmignore \
  packages templates benchmarks release-artifacts \
  -g 'package.json' -g 'pnpm-workspace.yaml' -g 'pnpm-lock.yaml' \
  -g '.pnpmfile.cjs' -g '.npmignore' -g '!**/node_modules/**'
```

Structured manifest sanity check:

```bash
node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const roots = ["package.json", "packages", "templates", "benchmarks", "release-artifacts"];
const legacy = /(@galileo3d|@g3d|create-g3d|galileo3d|g3d|G3D2025)/i;
const files = [];
function walk(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (p.includes(`${path.sep}node_modules`)) return;
    for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    return;
  }
  if (path.basename(p) === "package.json") files.push(p);
}
for (const root of roots) walk(root);
let failed = false;
for (const file of files) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const text = JSON.stringify(json);
  if (legacy.test(text)) {
    console.error(file);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
NODE
```

### Package Manager Metadata Gate

Expected final result: zero lines across every package-manager metadata file that exists at the time of final verification.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name 'package.json' -o -name 'pnpm-workspace.yaml' -o -name 'pnpm-lock.yaml' \
  -o -name '.pnpmfile.cjs' -o -name '.npmignore' -o -name '.npmrc' \
  -o -name '.yarnrc' -o -name '.yarnrc.yml' -o -name '.pnp.cjs' -o -name '.pnp.loader.mjs' \
  -o -name 'package-lock.json' -o -name 'npm-shrinkwrap.json' -o -name 'yarn.lock' \) -print0 |
  xargs -0 rg -n -F \
    -e '@galileo3d' -e '@g3d' -e 'create-g3d' -e 'packages/create-g3d' \
    -e 'link:packages/create-g3d' -e 'galileo3d' -e 'Galileo3D' \
    -e 'G3D' -e 'g3d' -e 'G3D2025' \
    --
```

Run this after the clean lockfile regeneration. If this gate fails only in an obsolete lockfile from another package manager, delete that obsolete lockfile or regenerate it from the renamed workspace; do not keep mixed package-manager state in the release branch.

### Source Map And Declaration Map Gate

Expected final result: zero lines after generated output is deleted and rebuilt from renamed source.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.ts.map' \) -print0 |
  xargs -0 rg -n -F \
    -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
    -e 'Galileo' -e 'galileo' -e 'GALILEO' \
    -e 'G3D' -e 'g3d' -e '@g3d' -e '@galileo3d' \
    -e 'create-g3d' -e 'packages/create-g3d' -e '/Users/gurbakshchahal/G3D' \
    --
```

Do not manually patch source-map payloads. Old names in `sources`, `sourcesContent`, or declaration paths mean the source rename/build regeneration is incomplete, or stale `dist/**` output was not removed before building.

### Binary Asset And Cache Gate

Expected final result: zero files in generated/audited output after caches and stale reports are removed and assets are regenerated or replaced.

```bash
find . \( -path './.git' -o -path './node_modules' -o -path './*/node_modules' \) -prune -o \
  \( -name '*.glb' -o -name '*.blend' -o -name '*.ktx2' -o -name '*.hdr' \
  -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \
  -o -name '*.pyc' -o -name '*.bin' \) -print0 |
  xargs -0 rg -a -l -F \
    -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
    -e 'Galileo' -e 'galileo' -e 'GALILEO' \
    -e 'G3D' -e 'g3d' -e '@g3d' -e '@galileo3d' \
    -e 'create-g3d' -e '.g3d' \
    --
```

Classify every hit before acting: delete caches, regenerate report screenshots, inspect GLB JSON chunks and Blender metadata, and replace third-party binary assets only when there is a verified equivalent. Do not hex-edit binary payloads to force the gate green.

Structured GLB metadata check:

```bash
node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const roots = ["fixtures", "tests/assets", "release-artifacts"];
const legacy = /(Galileo3D|galileo3d|GALILEO3D|Galileo|galileo|GALILEO|G3D|g3d|create-g3d|\.g3d)/;
const hits = [];
function walk(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (p.includes(`${path.sep}node_modules`)) return;
    for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    return;
  }
  if (!p.endsWith(".glb")) return;
  const buf = fs.readFileSync(p);
  if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "glTF") return;
  const jsonLength = buf.readUInt32LE(12);
  const chunkType = buf.toString("ascii", 16, 20);
  if (chunkType !== "JSON") return;
  const text = buf.toString("utf8", 20, 20 + jsonLength).replace(/\0+$/g, "");
  if (legacy.test(text)) hits.push(p);
}
for (const root of roots) walk(root);
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
NODE
```

### Editor Persistence And Export Gate

Expected final result: zero lines after editor state, prefab, project, static export, and shader graph contracts are migrated.

```bash
rg --hidden --no-ignore -n -F \
  -e 'galileo3d:editor-state' -e 'galileo3d-prefab' -e 'g3d-editor-project' \
  -e 'galileo-export' -e 'galileo-export-status' \
  -e 'g3dSurface' -e 'g3d_texcoord0' \
  -e 'galileo.default-authoring' -e 'galileo3d-browser-editor' \
  -e 'application/x-galileo3d-node' -e 'application/x-galileo3d-asset' \
  packages/editor-runtime apps/editor examples/editor-authored-project examples/editor-authored-v3-app examples/editor-authored-v4-app tests \
  -g '!**/node_modules/**'
```

Run this before browser editor tests. If old persisted schemas are accepted temporarily for migration, keep that compatibility in a dedicated migration test and remove the old accepted constants before final zero-legacy verification.

### Runtime Symbol Gate

Expected final result: zero lines.

```bash
rg --hidden --no-ignore -n \
  '\b(__GALILEO3D|GALILEO3D|G3D[A-Za-z0-9_]*|[A-Za-z0-9_]*G3D|g3d[A-Za-z0-9_]*|[A-Za-z0-9_]*g3d|galileo[A-Za-z0-9_]*|[A-Za-z0-9_]*galileo)\b|\.g3d[-_A-Za-z0-9]*' \
  . -g '!**/.git/**' -g '!**/node_modules/**'
```

### Generated And Archive Gate

Expected final result: zero lines after rebuilding or removing generated artifacts.

```bash
rg --hidden --no-ignore -n -F \
  -e 'galileo3d' -e 'Galileo3D' -e 'GALILEO3D' -e 'G3D' -e 'g3d' -e 'create-g3d' \
  dist packages/*/dist tests/reports release-artifacts \
  -g '!**/.git/**' -g '!**/node_modules/**'
```

Inspect compressed archives and checksum sidecars:

```bash
find release-artifacts -type f \( -name '*.tgz' -o -name '*.tar.gz' \) -print \
  -exec sh -c 'tar -tzf "$1" | rg -F -e galileo -e Galileo -e G3D -e g3d -e create-g3d || true' sh {} \;
find release-artifacts -type f \( -name '*.tgz' -o -name '*.tar.gz' \) -print \
  -exec sh -c 'tar -xOzf "$1" 2>/dev/null | rg -a -F -e galileo -e Galileo -e G3D -e g3d -e create-g3d -e @galileo3d || true' sh {} \;
find release-artifacts -type f -name '*.zip' -print \
  -exec sh -c 'unzip -l "$1" | rg -F -e galileo -e Galileo -e G3D -e g3d -e create-g3d || true' sh {} \;
find release-artifacts -type f \( -name '*.sha256' -o -name '*.sha512' \) -print \
  -exec rg -n -F -e galileo -e Galileo -e G3D -e g3d -e create-g3d -e @galileo3d {} \;
```

The current `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256` embeds the old archive filename, so checksum sidecars must be regenerated after archive rename/rebuild.

### Fixture And Asset Gate

Expected final result: zero lines. Run this before the broad gate so fixture-specific issues can be fixed with asset-aware tools.

```bash
rg --hidden --no-ignore -n -F \
  -e 'Galileo3D' -e 'galileo3d' -e 'GALILEO3D' \
  -e 'Galileo' -e 'galileo' -e 'GALILEO' \
  -e 'G3D' -e 'g3d' -e '@g3d' -e 'create-g3d' -e '.g3d' \
  fixtures tests/assets \
  -g '!**/node_modules/**'
```

Structured glTF semantic-field check. This does not replace the raw text gate; it confirms that semantic metadata has been migrated before dealing with embedded buffer payloads.

```bash
node - <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const roots = ["fixtures", "tests/assets"];
const legacy = /(Galileo3D|galileo3d|GALILEO3D|Galileo|galileo|GALILEO|G3D|g3d|create-g3d|\.g3d)/;
const semanticKeys = new Set(["generator", "copyright", "name"]);
const hits = [];
function walk(p) {
  if (!fs.existsSync(p)) return;
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (p.includes(`${path.sep}node_modules`)) return;
    for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    return;
  }
  if (!p.endsWith(".gltf")) return;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  function scan(value, trail = []) {
    if (typeof value === "string") {
      const key = trail[trail.length - 1];
      const inBufferUri = key === "uri" && value.startsWith("data:");
      if (!inBufferUri && (semanticKeys.has(key) || trail.includes("extras") || trail.includes("extensions")) && legacy.test(value)) {
        hits.push(`${p}: ${trail.join(".")}: ${value.slice(0, 120)}`);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) scan(child, trail.concat(key));
  }
  scan(data);
}
for (const root of roots) walk(root);
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
NODE
```

If the raw fixture gate reports only base64 data URI hits after semantic metadata is clean, regenerate or restructure those assets so the raw gate reaches zero without an allowlist.

### Build And Test Gate

Run after implementation:

```bash
pnpm install --lockfile-only
pnpm typecheck
pnpm build
pnpm verify:imports
pnpm verify:exports
pnpm verify:boundaries
pnpm test:packages
pnpm test:templates
pnpm exec vitest run tests/integration/v4-create-aura3d.test.ts tests/integration/v5-create-aura3d.test.ts tests/integration/v6-create-aura3d.test.ts
pnpm exec vitest run tests/unit/engine tests/unit/tools tests/assets --reporter=dot
A3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/workspace-vite-imports.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v5-templates.spec.ts tests/browser/v6-templates.spec.ts tests/browser/v8-route-health.spec.ts tests/browser/v9-advanced-examples-gallery.spec.ts --reporter=line
```

## Definition Of Done

- [ ] The repository root has been renamed to Aura3D or all tracked references to the old root have been removed.
- [ ] No tracked source path contains Galileo, Galileo3D, G3D, g3d, `@galileo3d`, `@g3d`, `.g3d`, or `create-g3d`.
- [ ] No tracked file contents contain legacy terms under the broad gate.
- [ ] `renamePRD.md` has been moved outside the repo, removed, or replaced by a sanitized completion artifact before the final strict scan.
- [ ] Root hidden/config files, including `.gitignore`, `.github/**`, and `CHANGELOG.md`, have been migrated.
- [ ] Package-manager workspace/config files, including `pnpm-workspace.yaml`, `.pnpmfile.cjs`, `.npmignore`, and any npm/yarn/pnp lock/config files that exist, contain only Aura3D/A3D identifiers.
- [ ] Every tracked `*.md` and `*.mdx` file has been migrated, regenerated, sanitized, or moved outside the repository; no active docs, package READMEs, examples, templates, release runbooks, badges, URLs, or claim language retain old identifiers.
- [ ] Static non-TypeScript text files, including HTML, CSS, workflow YAML, Python/MJS/C#/shell fixtures, browser harnesses, tool pages, and external-engine scripts, have been migrated, regenerated, sanitized, or moved outside the repository.
- [ ] Package scope is fully `@aura3d/*`.
- [ ] Create package is fully `create-aura3d`/`@aura3d/create-aura3d`.
- [ ] The create-tool CLI contract works under the renamed bin and package-manager entrypoints, including `npm create`, `npm exec`, `npx`, `pnpm create`, and `pnpm dlx` usage.
- [ ] Package subpath exports and aliases are fully `@aura3d/*`, including engine/runtime/rendering/assets/workflows and three-compat subpaths.
- [ ] No package manifest, template manifest, benchmark manifest, release handoff manifest, or extracted tarball manifest contains old package names.
- [ ] Public symbols are fully `A3D*`.
- [ ] No old compatibility aliases for `@galileo3d/*`, `create-g3d`, `G3D*`, or `g3d*` ship in final source.
- [ ] Runtime globals are fully Aura3D/A3D.
- [ ] Env vars are fully `A3D_*`.
- [ ] GitHub repo slugs, Pages URLs, workflow command examples, and GitHub readiness fixtures no longer contain `G3D2025`.
- [ ] Local Git remotes/upstreams and release automation settings no longer target the old `G3D2025` repository.
- [ ] Local branches, remote-tracking branches, tags, worktree paths, and submodule metadata do not use old Galileo/G3D names for the final publish run.
- [ ] npm registry ownership, package publish access, dist-tags, provenance/signature settings, and old-package deprecation/migration policy are confirmed for Aura3D before publishing.
- [ ] Branch names and remote refs embedded in docs/tests/reports no longer contain `g3d`, including old `preserve/g3d-v2-execution-state` examples.
- [ ] Absolute local paths and placeholders no longer contain `/Users/gurbakshchahal/G3D` or `/absolute/path/to/G3D`.
- [ ] Shader markers and shader helper names are fully Aura3D/A3D.
- [ ] Schemas, report names, telemetry values, CSS classes, DOM ids, provenance ids, and screenshot names are fully `a3d-*`.
- [ ] Fixtures, asset corpora, and glTF metadata use Aura3D/A3D identifiers.
- [ ] GLB JSON chunks, Blender source metadata, SVG metadata/ids/classes, image/texture metadata, and generated screenshots have been migrated, regenerated, replaced, or moved outside the final audited tree.
- [ ] Asset generator scripts have been renamed before fixture regeneration, including Python/MJS helper names and generated material/generator metadata.
- [ ] The accidental base64 `G3D` hit in `tests/assets/corpus/blender/vulkan-samples/terrain.gltf` has been eliminated by asset regeneration or restructuring, not by a final allowlist.
- [ ] Editor persisted metadata, localStorage keys, prefab/project schemas, static export selectors, exported example HTML/runtime files, and shader graph generated identifiers have been migrated to Aura3D/A3D.
- [ ] Templates and examples install from `@aura3d/engine`.
- [ ] Framework component files such as `*.tsx`, `*.jsx`, `*.svelte`, `*.vue`, vector `*.svg` files, and standalone shader `*.glsl`/`*.wgsl` files contain no old identifiers.
- [ ] Benchmarks use `aura3d` as the engine id and `A3D`/`Aura3D` in labels.
- [ ] Generated outputs and reports have been removed or regenerated.
- [ ] Source maps, declaration maps, declarations, and generated `dist/**` output have been rebuilt from renamed source and contain no old `sources`, `sourcesContent`, declaration paths, package names, or absolute paths.
- [ ] Release artifacts, handoff patch files, and nested historical handoff bundles have been rebuilt, sanitized, or moved outside the tracked repository.
- [ ] Compressed archives and checksum sidecars have Aura3D/A3D filenames, member paths, extracted text, and regenerated hashes.
- [ ] External demo bundles have been rebuilt or removed so minified bundle text contains no old runtime strings.
- [ ] `npm pack --dry-run --json` and any actual release tarball file list/package metadata contain no legacy names.
- [ ] `pnpm-lock.yaml` has been regenerated and contains no old workspace package keys or `packages/create-g3d` links.
- [ ] Stale package-local `node_modules`, `examples/node_modules/g3d`, `.DS_Store`, `__pycache__/**/*.pyc`, and test-result noise files are not present in the final tracked/audited tree.
- [ ] Build, typecheck, package, template, browser, and relevant visual/report tests pass.
- [ ] All verification gates above, including the tracked-only gate, Markdown/docs gate, static non-TypeScript text gate, component/vector/shader source gate, binary asset/cache gate, package-manager metadata gate, source/declaration map gate, raw text/binary-aware gate, editor persistence/export gate, archive/checksum gate, Git remote config gate, Git refs/worktree/submodule gate, registry/release-management gate, and publish pack gate, produce the expected zero legacy output.
