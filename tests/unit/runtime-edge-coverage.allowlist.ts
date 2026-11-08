/**
 * Runtime-edge marker allowlist (owner-delegated triage, 2026-11-03).
 *
 * tests/unit/runtime-edge-coverage.test.ts flags every line in packages/<pkg>/src that says
 * unavailable / not implemented / placeholder / stub / fake success / deferred. Each group below
 * records the exact trimmed lines of one file, why they are not a hidden unimplemented feature, an
 * expiry and a reviewer. Groups are additions to the test's inline allowlist, not replacements.
 * None of these markers is an open FINISH-5.0 row in docs/prds/aura3d-5.0-scope.md; counts per
 * module are in docs/project/status/known-limits.md ("Runtime-edge debt").
 *
 * Regenerate a group when its file changes; an expired group fails the audit.
 */
export interface RuntimeEdgeAllowlistGroup {
  readonly file: string;
  readonly reason: string;
  readonly expires: string;
  readonly reviewer: string;
  readonly markers: readonly string[];
}

const EXPIRES = "2027-01-31";
const REVIEWER = "agent (owner-delegated, 2026-11-03)";

export const runtimeEdgeAllowlist: readonly RuntimeEdgeAllowlistGroup[] = [
  {
    file: "packages/addons/src/objects/SpecializedObjects.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Owned references become unavailable after disposal. */",
    ]
  },
  {
    file: "packages/animation/src/AnimationMixer.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!(weights instanceof WeakMap)) throw new Error(\"AnimationMixer.serialize: layer base weights are unavailable.\");",
    ]
  },
  {
    file: "packages/animation/src/contracts/pose.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** PR 0a stub: blends linearly between two poses; sampling an empty pose returns the rest pose. */",
    ]
  },
  {
    file: "packages/animation/src/pose/RetargetCache.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Read a cached bake, or `undefined` when absent/unavailable. */",
    ]
  },
  {
    file: "packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Parsing and deferred image creation must observe the same acquisition",
    ]
  },
  {
    file: "packages/assets/src/AssetLoader.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (3); redaction fallback text used when an error message or cause cannot be read safely (2)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* When SHA-256 is unavailable, disable sharing instead of weakening isolation.",
      "// cache hit. Validate first, including when hashing is unavailable.",
      "try { subtle = globalThis.crypto?.subtle; } catch { /* Secure hashing is unavailable. */ }",
      "const safeCause = new Error(redactAssetMessage(typeof detail === \"string\" ? detail : \"[error details unavailable]\", url));",
      "let detail = \"[error details unavailable]\";",
    ]
  },
  {
    file: "packages/assets/src/AssetManager.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// unique identity when secure hashing is unavailable.",
      "// URL fingerprint also works when WebCrypto is unavailable and sharing is",
      "// If secure request hashing is unavailable every request gets a fresh",
    ]
  },
  {
    file: "packages/assets/src/AudioLoader.ts",
    reason: "redaction fallback text used when an error message or cause cannot be read safely",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "let detail = \"[error details unavailable]\";",
    ]
  },
  {
    file: "packages/assets/src/decoderLoad.ts",
    reason: "redaction fallback text used when an error message or cause cannot be read safely",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "return \"[unavailable]\";",
    ]
  },
  {
    file: "packages/assets/src/exporters/ExportContext.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "warn(\"SOURCE_ATTRIBUTE_ENCODING_LOST\", \"meshes\", \"The runtime asset exposes decoded numeric attributes; original quantization and component encodings are unavailable.\");",
      "if (!image.data) { if (image.uri) warn(\"MISSING_IMAGE_BYTES\", `images[${index}]`, \"Image bytes are unavailable from the loaded asset; export does not fetch external resources.\"); continue; }",
    ]
  },
  {
    file: "packages/assets/src/exporters/GLTFExporter.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!Number.isSafeInteger(index) || index >= materialDocs.length) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer references an unavailable material`);",
      "if (!Number.isSafeInteger(index) || index >= lightDocs.length) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer references an unavailable light`);",
      "if (!Number.isSafeInteger(index) || index >= nodeDocs.length) throw new Error(`GLTF_INVALID_ANIMATION: ${cp}.pointer references an unavailable node`);",
      "\"Source track provenance is unavailable: core-shaped animation channels may have originated as KHR_animation_pointer channels, including required ones.\");",
    ]
  },
  {
    file: "packages/assets/src/EXRLoader.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (selectedLevel.x >= selected.levelsX || selectedLevel.y >= selected.levelsY || (selected.levelMode === 1 && selectedLevel.x !== selectedLevel.y)) fail(\"requested image level is unavailable for this part.\");",
      "if (selectedLevel.x >= selected.levelsX || selectedLevel.y >= selected.levelsY || (selected.mode === 1 && selectedLevel.x !== selectedLevel.y)) failDeep(\"requested image level is unavailable for this part\");",
    ]
  },
  {
    file: "packages/assets/src/GLTFAnimationRuntime.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (4); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* Availability in the current scene/resource configuration. \"unavailable\"",
      "readonly status: \"available\" | \"pending\" | \"unavailable\" | \"unknown\";",
      "if (!target) return result(\"unavailable\", \"unsupported-track\");",
      "return result(\"unavailable\", \"unsupported-track\");",
      "return result(inSourceScene === false ? \"unavailable\" : \"unknown\", \"missing-light\");",
      "return result(inSourceScene === false ? \"unavailable\" : \"unknown\", \"missing-node\");",
    ]
  },
  {
    file: "packages/assets/src/GLTFExtensionSupport.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "\"All other custom per-instance material attributes are unsupported; deferred WebGPU instancing remains unavailable.\"",
      "entry(\"KHR_materials_diffuse_roughness\", \"material\", \"parsed-with-limits\", [\"GLTFLoader\", \"createGLTFRenderResources\", \"TexturedPBRMaterial\"], [\"Draft extension, accepted when required: WebGL2 forward/skinned/instanced PBR and the WebGPU generated PBR program apply the factor and red-channel texture; the WebGPU deferred path refuses a non-zero factor rather than dropping it. The draft prose specifies a factor default of zero; its schema specifies one (the loader uses zero). Rendered fidelity against reference images is not established.\"], limitedRender),",
    ]
  },
  {
    file: "packages/assets/src/GLTFLoader.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (2); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @internal Resolve the original document's policy for a deferred image request. */",
      "/** @internal Deferred image loads retain the document subscriber's progress callback. */",
      "// readers (prepareBufferViews rewires them) never dereference the stub.",
    ]
  },
  {
    file: "packages/assets/src/GLTFRenderResources.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Each eligible resource pins the cache even before a deferred material",
    ]
  },
  {
    file: "packages/assets/src/ImportPipeline.ts",
    reason: "redaction fallback text used when an error message or cause cannot be read safely",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const message = redactImportText(typeof rawMessage === \"string\" ? rawMessage : \"[error details unavailable]\", references);",
      "Array.isArray(errors) ? errors.map((error) => redactImportCause(error, references, seen, depth + 1)) : [\"[aggregate errors unavailable]\"],",
      "return \"[cause unavailable]\";",
    ]
  },
  {
    file: "packages/assets/src/LoaderFetch.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (typeof fetch !== \"function\") throw new Error(`fetch is unavailable — cannot load ${safeUrl}`);",
      "if (!subtle) throw new AssetIntegrityError(`SHA-256 is unavailable; cannot verify ${redactAssetUrl(url)}`);",
    ]
  },
  {
    file: "packages/assets/src/loaders/ColladaLoader.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// placeholder origin in a returned dependency.",
    ]
  },
  {
    file: "packages/assets/src/loaders/FBXLoader.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (typeof DecompressionStream === \"undefined\") throw new Error(\"FBX_UNSUPPORTED_DEFLATE: DecompressionStream is unavailable\");",
    ]
  },
  {
    file: "packages/assets/src/loaders/GaussianSplatLoader.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Placeholder accessors define the decoded type and count even when they",
      "throw new Error(`SPZ ${format} decompression is unavailable`);",
    ]
  },
  {
    file: "packages/assets/src/loaders/ImageFormatLoaders.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "constructor(readonly code: \"malformed\" | \"unsupported\" | \"limit\" | \"codec-unavailable\", message: string) {",
      "throw new NativeImageError(\"codec-unavailable\", `${format} requires a GPU format or a transcoder`);",
      "if (typeof DecompressionStream !== \"function\") throw new NativeImageError(\"codec-unavailable\", \"TIFF Deflate requires DecompressionStream\");",
      "if (typeof codec !== \"function\") throw new NativeImageError(\"codec-unavailable\", `${format} requires an explicitly supplied decoder`);",
    ]
  },
  {
    file: "packages/assets/src/loaders/Model3MFLoader.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (typeof DecompressionStream === \"undefined\") throw new Error(\"3MF_ZIP_UNSUPPORTED: DEFLATE decompression is unavailable\");",
      "catch { throw new Error(\"3MF_ZIP_UNSUPPORTED: raw DEFLATE decompression is unavailable\"); }",
    ]
  },
  {
    file: "packages/assets/src/loaders/VectorFormatLoaders.ts",
    reason: "explicit unsupported-path refusal: throws or returns a stable unsupported error/diagnostic instead of approximating",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "} else if (tag === \"svg\") { diagnostics.push({ code: \"SVG_NESTED_VIEWPORT_UNSUPPORTED\", message: \"Nested svg viewports are not implemented; subtree omitted.\" }); skip = true; }",
    ]
  },
  {
    file: "packages/assets/src/TextureResidencyController.ts",
    reason: "deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "*   an unretired allocation. A failed or unavailable fence must retain the",
    ]
  },
  {
    file: "packages/assets/src/vite/auraDecoders.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "return `// Modified by Aura3D: added module bindings and a default export for ESM loading.\\nconst module = undefined, exports = undefined, define = undefined;\\nconst importScripts = globalThis.importScripts ?? (() => { throw new TypeError(\"importScripts unavailable\"); });\\n${readFileSync(file, \"utf8\")}\\nexport default ${codec.name};\\n`;",
    ]
  },
  {
    file: "packages/assets/src/WorkerAssetJobs.ts",
    reason: "redaction fallback text used when an error message or cause cannot be read safely",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "message = typeof detail === \"string\" ? detail : \"[cleanup error details unavailable]\";",
      "message = \"[cleanup error details unavailable]\";",
    ]
  },
  {
    file: "packages/audio/src/contracts/gameSound.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// createGameSoundEngine: implemented as the stub factory below (PR 0a).",
      "/** PR 0a stub engine: every call is safe and silent; `proof()` reports `contextState: \"none\"`. */",
    ]
  },
  {
    file: "packages/audio/src/game-sound/GameSoundEngine.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (3); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (source !== undefined && typeof Headers !== \"function\") throw new Error(\"Audio headers are unavailable\");",
      "if (hasHeaders && typeof Headers !== \"function\") throw new Error(\"Audio headers are unavailable\");",
      "if (!fileManager) throw new Error(\"Audio decoding is unavailable\");",
      "// flight. The placeholder is never submitted to the audio context.",
      "const placeholder = { id: -2, ended: false } as VoiceRecord;",
      "super(ctx, placeholder, undefined, () => {});",
      "* are unavailable (headless stub contexts).",
    ]
  },
  {
    file: "packages/aura3d-cli/src/admission/gates.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "return check(\"G6\", \"fail\", { reason: report.unavailableReason }, `G6: texture decode unavailable — ${report.unavailableReason ?? \"sharp missing\"}.`);",
    ]
  },
  {
    file: "packages/aura3d-cli/src/admission/textureStats.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "error: \"decode-unavailable\"",
    ]
  },
  {
    file: "packages/aura3d-cli/src/asset-core-types.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// on (C-17 stub rule), otherwise preserves the schema it was handed.",
    ]
  },
  {
    file: "packages/aura3d-cli/src/asset-manifest.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// C-17 stub rule: the writer emits \"aura3d.assets/1.1\" once A3D_QR_ASSETS",
    ]
  },
  {
    file: "packages/aura3d-cli/src/codemods/engine-entry-imports.ts",
    reason: "codemod report note: deprecated subpath imports with no destination are kept on their warn-stub and reported for manual migration",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// keep the specifier (the stub warns once) and are reported.",
      "rows.push({ file, line: posOf(decl), construct: `import from \"${spec}\"`, mapping: \"none\", note: `deprecated subpath — kept on warn-stub until 4.0.0; migrate to ${retarget}` });",
      "rows.push({ file, line: posOf(el), construct: `import { ${imported} } from \"${spec}\"`, mapping: \"none\", note: `name has no §6.6 destination — kept on deprecated \"${spec}\" stub until 4.0.0` });",
    ]
  },
  {
    file: "packages/aura3d-cli/src/commands/prd04/pinEmissiveDefaults.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* packaged CLI (its dist tree does not ship `tools/`). Deferred resolution keeps",
    ]
  },
  {
    file: "packages/aura3d-cli/src/commands/prd05/lookdev.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* unavailable the command prints the workflow URL so the run can be",
    ]
  },
  {
    file: "packages/aura3d-cli/src/commands/prd06/inspectAnimationClips.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "*   accessor data is unavailable or degenerate).",
    ]
  },
  {
    file: "packages/aura3d-cli/src/commands/prd08/motionReport.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (engine === \"aura3d\" && motion.cameraLive !== true) failures.push(`${scene}/${engine}: app.camera is the stub — capture without --flags camera?`);",
    ]
  },
  {
    file: "packages/aura3d-cli/src/look/capture.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "return finish({ ok: false, runner, outDir, pngs: [], lintErrors: 0, error: \"local runner unavailable: playwright is not installed in this project (use --runner remote)\" });",
    ]
  },
  {
    file: "packages/aura3d-cli/src/look/judge.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* 2 with `judge-unavailable`, never a fabricated score. The key comes only",
      "io.stderr(\"judge-unavailable: C-32 judgeWithPrism (tools/quality-gate/src/judge-prism.ts) cannot be loaded here; run the CLI from a repo checkout\");",
      "io.stderr(`judge-unavailable: ${e.message}`);",
    ]
  },
  {
    file: "packages/aura3d-cli/src/migrate-three/emit.ts",
    reason: "three.js codemod note: discloses that SMAA has no native mode and maps to fxaa/taa/off (approximate mapping, reported to the user)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "comment: `a3d: SMAA has no native mode — antiAlias mode is \"fxaa\" (default) | \"taa\" | \"off\"; smaa is not implemented on the live path`",
    ]
  },
  {
    file: "packages/aura3d-cli/src/migrate-three/mappings.ts",
    reason: "three.js codemod mapping notes disclosing approximate mappings (SMAA -> effects.antiAlias, ARButton -> xr.button) to the user",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "{ construct: \"SMAAPass\", target: \"effects.antiAlias\", engineImport: \"effects\", mapping: \"approximate\", note: \"SMAA has no native mode — effects.antiAlias({}) uses fxaa (\\\"taa\\\"/\\\"off\\\" are the other live modes); smaa is not implemented on the WebGL2 path.\" },",
      "{ construct: \"ARButton.createButton\", target: \"xr.button\", emit: \"comment\", engineImport: \"xr\", mapping: \"approximate\", note: \"ARButton.createButton(renderer, init) maps to xr.button({ app, mode: \\\"immersive-ar\\\", sessionInit }) (SC-04). The device path now exists and the session flow is verified against the iwer emulator (not a headset); AR passthrough compositing and hit-test source setup are not implemented.\" },",
    ]
  },
  {
    file: "packages/aura3d-cli/src/resolve-ladder.ts",
    reason: "CLI disclosure: when no recipe matches, the generated crate is labelled PLACEHOLDER with the command to obtain a real model (meshy or assets add)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "messages.push(`No recipe for a ${noun ?? \"need like this\"}: the box below is a placeholder. For the real thing run with --allow meshy --budget ${estimate || 30}, or admit a licensed file with \\`aura3d assets add\\`.`);",
      "/** The recipe for a need, or undefined when no keyword or alias matches (the crate is then a placeholder). */",
      "const note = matched === undefined ? \" PLACEHOLDER: no recipe matches this need; replace it with a real model before shipping.\" : \" Tune sizes and colours.\";",
    ]
  },
  {
    file: "packages/controls/src/ArcballControls.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "try { acquirePointerCapture(this.element, pointer.pointerId, contact); } catch { /* capture can be unavailable or already lost */ }",
    ]
  },
  {
    file: "packages/controls/src/DragControls.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "try { if (this.options.element?.hasPointerCapture?.(event.pointerId)) return; } catch { /* Treat an unavailable capture as lost. */ }",
    ]
  },
  {
    file: "packages/controls/src/engine/PointerLockControls.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Called for unavailable APIs, denied requests and failures to exit the lock. */",
      "this.reportError(new Error(\"Pointer lock is unavailable on this element.\"));",
      "if (typeof doc.exitPointerLock !== \"function\") throw new Error(\"Exiting pointer lock is unavailable in this document.\");",
    ]
  },
  {
    file: "packages/controls/src/InteractiveGroup.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "try { if (this.options.element.hasPointerCapture?.(event.pointerId)) return; } catch { /* Treat an unavailable capture as lost. */ }",
    ]
  },
  {
    file: "packages/controls/src/PointerCoordinates.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// clientLeft/Top are useful when computed style is unavailable, as on",
    ]
  },
  {
    file: "packages/controls/src/SelectionBox.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "catch { /* An unavailable capture is treated as lost. */ }",
    ]
  },
  {
    file: "packages/debug/src/FrameInspector.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "readonly wholeFrameGpuStatus?: \"unavailable\" | \"pending\" | \"measured\" | \"discarded\";",
      "warnings.push(\"GPU view timing history is unavailable.\");",
      "warnings.push(`Frame ${gpuViewTiming.frameNumber}, GPU view ${view.viewId}: ${view.gpuTimeMs === null ? \"unavailable\" : `${view.gpuTimeMs} ms`}.`);",
    ]
  },
  {
    file: "packages/debug/src/GPUProfiler.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const DEFAULT_UNAVAILABLE_REASON = \"GPU timing extension unavailable\";",
      "* time, but its device result is explicitly unavailable. Call `poll()` or",
      "this.unavailableReason = this.webgpu ? \"WebGPU timestamp-query feature unavailable\" : contextOrLegacyFlag === true && unavailableReason === DEFAULT_UNAVAILABLE_REASON",
    ]
  },
  {
    file: "packages/debug/src/safety/blackFrame.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/* storage unavailable: the reload still happens, the rung just cannot continue */",
    ]
  },
  {
    file: "packages/debug/src/safety/diagnosticsPanel.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!gl) return { error: \"webgl2: unavailable\" };",
    ]
  },
  {
    file: "packages/debug/src/safety/guard.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Returns the watch (or undefined when disabled/unavailable) so callers and tests can read its observation. */",
    ]
  },
  {
    file: "packages/debug/src/ShaderGraphInspector.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "\"unsupported-backend\": \"This operation or resource is unavailable on the selected backend.\",",
    ]
  },
  {
    file: "packages/editor-runtime/src/DiagnosticsOverlayModel.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* unavailable: the numeric value may be a placeholder or a stale sample.",
    ]
  },
  {
    file: "packages/editor-runtime/src/StaticExportRuntime.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!canvas || !status || typeof start !== \"function\") throw new Error(\"The exported scene runtime is unavailable.\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/actorAnimationHandle.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (6); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* member degrades to the PR 0a stub when the lane flag is off, the actor has",
      "* `clear()` empties the list. Degrades to the no-op stub while the flag is",
      "return () => { /* stub no-op */ };",
      "* to the no-op stub while the flag is off.",
      "* no-op stub while the flag is off or the actor is not loaded.",
      "if (!qrAnimationFlags(this.app).on(\"A3D_QR_ANIMATION\")) return () => { /* stub no-op */ };",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/createAuraAppCore.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (4); historical note recording that a former stub/placeholder was removed or replaced by the real path (1); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const deferred = () => {",
      "const renderer = deferred();",
      "const firstFrame = deferred();",
      "// mount (compiler/renderer.ts) — no app-side stub remains.",
      "readiness.settle({ state: \"failed\", code: \"renderer-unavailable\", message: \"No WebGL2 or WebGPU renderer is available for this app.\" });",
      "// Re-apply deferred overrides the moment a renderer appears.",
      "(p) => postSurface?.addPostPass?.(p) ?? (() => { /* stub */ });",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/frameLoop.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path (1); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// ENG-FPS: measured over the presented rAF frames of the last second, not a 60 placeholder.",
      "// The deferred owner can release from a frame's finally block. Record",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/rendererOptions.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (candidate.mode !== \"forward\" && candidate.mode !== \"deferred\" && candidate.mode !== \"meshlet\" && candidate.mode !== \"visibility\") {",
      "throw new Error(\"DRAWING_PATH_OPTION_INVALID:renderer.drawingPath.mode (expected forward|deferred|meshlet|visibility)\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/workerRootApp.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new AuraWorkerError(`${field} is unavailable for a worker-backed app. ${alternative}`, \"worker-unsupported\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/workerRuntime.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); warned fallback or diagnostic that reports the missing capability instead of faking success (1); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** DOM world-label, accessible-text and diagnostics overlays are unavailable in a worker. */",
      "if (!supportsWorkerRendering(canvas)) throw new AuraWorkerError(\"OffscreenCanvas transfer is unavailable; use a main-thread renderer.\", \"unsupported\");",
      "if (selection.mode !== \"production\") throw new AuraWorkerError(`Renderer mode \"${selection.mode}\" is unavailable. Use the production renderer.`, \"backend-fallback\");",
      "if (typeof canvas.convertToBlob !== \"function\") throw new AuraWorkerError(\"OffscreenCanvas PNG capture is unavailable.\", \"screenshot-unavailable\", \"recoverable\");",
      "if (transferSet.has(current)) { const placeholder = {}; seen.set(current, placeholder); return placeholder; }",
    ]
  },
  {
    file: "packages/engine/src/agent-api/camera/CameraController.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* `undefined` on the flag-off stub (no `update` runs there) or pre-first-update.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/camera/extension.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* Flag off: a stub controller — same surface, legacy resolution, inert layers —",
      "/** Stub `app.camera` for flag-off — same C-22 surface, no behaviour change. */",
      "rig: \"stub\",",
    ]
  },
  {
    file: "packages/engine/src/agent-api/color.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// treat > 0xFFFFFF as RGBA, else RGB (matches the PR 0a stub semantics).",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/animation.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// `rawDt * app.time.scale * handle.timeScale` (C-23, both stub 1",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/bitmapAsset.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (typeof createImageBitmap !== \"function\") throw new Error(\"Bitmap texture decoding is unavailable\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/compileScene.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (1); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!renderer?.device || typeof renderer.postScopeId !== \"function\") throw new Error(\"Projected spot renderer ownership is unavailable\");",
      "// A child published reentrantly under a deferred parent cannot retire its",
      "// An explicit removal during a deferred replacement removes the complete",
      "// `pending:<key>` = the last bind hit the C-09 stub; rebind once the",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/customMaterial.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (2); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* handle's sampler state. Asset references use a separate deferred placeholder.",
      "// An unbacked reference retains the established optional placeholder;",
      "// Placeholder until `upgradeCustomMaterialTextures` loads the asset's url.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/customTextures.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!slot || slot.kind !== \"ready\") throw new Error(\"Custom texture plan is unavailable\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/environment.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* is true while the C-09 factory is still the pending stub, so the caller can",
      "/** True for the stub's `ENVIRONMENT_PROBE_PENDING:*` rejection. */",
      "// A failure (including the C-09 stub still pending) keeps the floor and is",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/fog.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* path while forward geometry is on the C-04 stub.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/labels.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* The label and accessible-text layers require a DOM canvas and are unavailable",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/lights.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// effective ancestry, so leave profile rendering explicitly unavailable.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/optionCoverage.ts",
    reason: "documented unsupported-option row (S5-WP19-04): the option is reported as option-ignored with a remedy, never silently dropped",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "pbrUnsupported(\"material.pbr\", \"shader\", \"solar-sun\", \"solar-corona\", \"degradation.option-ignored\", \"material.pbr does not render \\\"shader\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "pbrUnsupported(\"material.pbr\", \"coreColor\", \"#fff7ad\", \"#ffd166\", \"degradation.option-ignored\", \"material.pbr does not render \\\"coreColor\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "pbrUnsupported(\"material.pbr\", \"rimColor\", \"#f97316\", \"#ff0000\", \"degradation.option-ignored\", \"material.pbr does not render \\\"rimColor\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "pbrUnsupported(\"material.pbr\", \"noiseStrength\", 0.1, 0.3, \"degradation.option-ignored\", \"material.pbr does not render \\\"noiseStrength\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "pbrUnsupported(\"material.pbr\", \"falloff\", 1.5, 3, \"degradation.option-ignored\", \"material.pbr does not render \\\"falloff\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "pbrUnsupported(\"material.pbr\", \"practical\", false, true, \"degradation.option-ignored\", \"material.pbr does not render \\\"practical\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "metalUnsupported(\"material.metal\", \"shader\", \"solar-sun\", \"solar-corona\", \"degradation.option-ignored\", \"material.metal does not render \\\"shader\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "metalUnsupported(\"material.metal\", \"coreColor\", \"#fff7ad\", \"#ffd166\", \"degradation.option-ignored\", \"material.metal does not render \\\"coreColor\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "metalUnsupported(\"material.metal\", \"rimColor\", \"#f97316\", \"#ff0000\", \"degradation.option-ignored\", \"material.metal does not render \\\"rimColor\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "metalUnsupported(\"material.metal\", \"noiseStrength\", 0.1, 0.3, \"degradation.option-ignored\", \"material.metal does not render \\\"noiseStrength\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "metalUnsupported(\"material.metal\", \"falloff\", 1.5, 3, \"degradation.option-ignored\", \"material.metal does not render \\\"falloff\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "metalUnsupported(\"material.metal\", \"practical\", false, true, \"degradation.option-ignored\", \"material.metal does not render \\\"practical\\\" (solar shader tags and practical-light scaling are not implemented); remove it (it is reported as OPTION_IGNORED)\"),",
      "modelInstancesIgnored(\"instances.model\", \"lod\", { levels: [{ maxDistance: 10 }] }, { levels: [{ maxDistance: 10 }, { maxDistance: 40 }], hysteresis: 2 }, \"actor.option-ignored\", \"per-instance LOD switching is not implemented, so instances.model \\\"lod\\\" is reported as OPTION_IGNORED; remove it, or use model(asset, { lod }) for an imported MSFT_lod chain\"),",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/postprocess.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (2); explicit unsupported-path refusal: throws or returns a stable unsupported error/diagnostic instead of approximating (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// `smaa` resolution submits no pass — SMAA is not implemented on the",
      "// 0.1/1000 placeholder.",
      "// \"off\" placeholder is never the answer under a strict field check.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/primitives.ts",
    reason: "unknown primitive name is refused with A3D_PARITY_GEOMETRY and a docs pointer instead of drawing a substitute",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "`Aura3D primitive \"${String(primitive)}\" is not implemented (A3D_PARITY_GEOMETRY). See docs/workflows/threejs-parity-gaps.md.`",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/renderer.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// stub returns `source: null` and every call below keeps the legacy path",
      "// the desktop default \"high\" (the same stub resolution the lighting",
      "* the desktop default \"high\", the same stub resolution the lighting handlers",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/shadows.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* `lighting.quality: \"auto\"` resolves through the C-27 stub (PRD-02 §6.8):",
    ]
  },
  {
    file: "packages/engine/src/agent-api/compiler/textures.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Move verified PNG bytes from a deferred policy-transport load into the lazy CPU-pixel state. */",
      "? \"SDF_GLYPH_ATLAS_FALLBACK: shared text atlas unavailable for this text; whole-label SDF retained.\"",
    ]
  },
  {
    file: "packages/engine/src/agent-api/feel/extension.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Stub engine: contextState \"none\" means no real voice — counts 0.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/feel/FeelBus.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* stub and produced nothing (no haptic sink, no pixels drawn) counts 0.",
      "/** C-22 layer writers; absent → those channels count 0 (stub app). */",
    ]
  },
  {
    file: "packages/engine/src/agent-api/GameCharacterAnimation.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/* (rawDt * app.time.scale * handle.timeScale — both stub 1 until prd08       */",
    ]
  },
  {
    file: "packages/engine/src/agent-api/lazyNamespace.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* T3 (PRD-15 §CCR-15-2) — deferred namespace construction.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/looks/generatedCodeWarnings.ts",
    reason: "comment naming a contract-seam stub fallback and its limitation",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// real AND flagged (today's stub leaves it false → ambient-kills-ibl fires).",
    ]
  },
  {
    file: "packages/engine/src/agent-api/looks/lookLint.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success (1); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "? [warning(\"look/flat-palette\", \"Pure primary colours read as placeholder art; pick from the look palette.\", primaries.map(nodeName))]",
      "// PRD 09's registration replaces a placeholder instead of throwing.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/looks/lookPresets.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// provider still a stub. v1 expansion (C-36 NodeHandler) lands in T1.13.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/batched.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); historical note recording that a former stub/placeholder was removed or replaced by the real path (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* real GPU-write path (L5-01), not a decompose-to-spec stub.",
      "return { mode: \"instanced\", fallbackReason: \"packed-execution-unavailable\" };",
      "const fallbackReason = mode !== resolved.mode ? \"runtime-node-unavailable\" : resolved.fallbackReason;",
      "// remains the fail-closed stub when the flag is off.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/batchedState.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new Error(\"aura3d: instances.mesh unavailable — the instancedMesh module was not loaded; import the engine entry.\");",
      "// Capacity survives a small count (matches C-37 stub semantics): slots",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/camera.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* P-61 (lane-08 review of #173/#276): `camera.rigs` shipped as the PR 0a stub",
      "* back to its stub. `static` stays the stub's (already real); `fromSpec`",
      "* needs a controller's spec deps, so the namespace keeps the stub and real",
      "* effect: the stub controller's `use()` ignores the rig.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/game/instanceTransforms.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* For `kind:\"primitive\"` nodes the C-37 stub still applies: `renderInput`",
      "* primitive stub's decompose→spec→re-upload round trip.",
      "// primitive nodes keep the C-37 stub (spec lowering) flag on or off —",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/instances.ts",
    reason: "documented unsupported-option row (S5-WP19-04): instances.model lod is rejected with a remedy (use model(asset, { lod }) / MSFT_lod)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "lod: \"per-instance LOD switching is not implemented; every instance draws the full model. Remove it, or use model(asset, { lod }) for an imported MSFT_lod chain\",",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/loadNativeTexture.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const error = new Error(\"Native texture load cancelled because its app is closed or unavailable\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/material.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* modes are unavailable. Postprocessing can change the displayed grayscale.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/optionDiagnostics.ts",
    reason: "documented unsupported-option row (S5-WP19-04): the option is reported as option-ignored with a remedy, never silently dropped",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "`Remove ${unread.length === 1 ? \"it\" : \"them\"}: the solar shader tags and practical-light scaling are not implemented; use rim: { color, power } for a fresnel rim and emissive / emissiveIntensity for glow`]);",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/physics-core.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "while (nextBodyId < record.id) { const placeholder = next.createRigidBody(); next.removeRigidBody(placeholder.id); nextBodyId++; }",
      "const placeholder = next.createCollider(body, { shape: PhysicsShapeFactory.sphere(0.5) });",
      "next.removeCollider(placeholder.id);",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/prompt/promptPlanMappings.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** camera.preset → a C-22 rig (or the tuned fallback while the slot is a stub). */",
      "/** Static rig fallback while C-22 is a stub (today: a tuned camera spec). */",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/prompt/promptPlanV2.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// the stub's primitive-pool bursts are the fake-sphere pattern §6.3 removes.",
      "// 3. Camera rig (C-22 factories or the tuned fallback while the slot is a stub).",
      "// C-13 preset effects (stub is empty today; real presets land with prd03).",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/shaderGraph.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const placeholder = (id: string, type: ShaderGraphValueType): ShaderGraphNode => {",
      "const node = placeholder(id, type);",
      "reflected.push(placeholder(node.id, node.type));",
      "nodes.push(placeholder(id, type));",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/text3d.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// This placeholder is never displayed: compiler/textures consumes the",
      "const placeholder = createAuraText3DGeometry(\"A\", { size: options.size ?? 1 });",
      "geometry: placeholder.geometry,",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/texture.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const error = new Error(\"Texture load cancelled because its app is closed or unavailable\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/types.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (2); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* non-clustered WebGL2 forward lit triangle draws. Unavailable variants",
      "readonly mode: \"forward\" | \"deferred\" | \"meshlet\" | \"visibility\";",
      "/** Whether an unavailable requested backend may fall back to WebGL2. */",
      "* route explicitly (degrading to \"instanced\" when unavailable); \"instanced\"",
    ]
  },
  {
    file: "packages/engine/src/agent-api/nodes/types/runtime.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Submit a native asynchronous production frame. Rejects unavailable or disposed renderers. */",
    ]
  },
  {
    file: "packages/engine/src/agent-api/physics/PhysicsWorldProvider.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (backend == null) throw new Error(\"The optional @dimforge/rapier3d-compat backend is unavailable.\");",
    ]
  },
  {
    file: "packages/engine/src/agent-api/postBridge.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (2); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (2); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (2); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* not measurable engine-side is either `null` or explicitly marked unavailable",
      "* when its existing shape includes placeholder counts. Recording never alters",
      "* bridge has no item context, so its zero counts are unavailable placeholders,",
      "// program generator is still the PR 0a stub — AO applies the",
      "if (!this.flags.on(\"A3D_QR_POST\")) return () => { /* stub chain: release is a no-op */ };",
      "// Start the deferred v2 stage load at mount, not on the first frame, so the",
      "record.error = \"fetch is unavailable\";",
      "// producers and pre-bloom stages and reports an unavailable reason per frame.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/postPresets.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* TDZ that failed `packages/editor-runtime` tests on PR #357 CI). Deferred",
    ]
  },
  {
    file: "packages/engine/src/agent-api/rendererDiagnostics.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "...(gpuMs === null ? { gpuReason: frame.gpuTimeReason ?? \"GPU frame timing unavailable\" } : {}),",
    ]
  },
  {
    file: "packages/engine/src/agent-api/sanitizeDiagnostics.ts",
    reason: "redaction fallback text used when an error message or cause cannot be read safely",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "out.push(descriptor && \"value\" in descriptor ? visit(descriptor.value, depth + 1) : \"[unavailable]\");",
      "Object.defineProperty(out, safeKey, { value: descriptor && \"value\" in descriptor ? visit(descriptor.value, depth + 1) : \"[unavailable]\", enumerable: true, configurable: true, writable: true });",
      "Object.defineProperty(out, safeKey, { value: \"[unavailable]\", enumerable: true, configurable: true, writable: true });",
      "return \"[unavailable]\";",
      "return \"Error: details unavailable\";",
    ]
  },
  {
    file: "packages/engine/src/agent-api/sceneKitDiagnosticsCore.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Cleanup must not hide the failure that made the scene unavailable.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/vfx/effects-api.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** C-38 factory: returns the real API under A3D_QR_VFX, the PR 0a stub otherwise.",
      "* (P1-T2's whole point is reporting the bug). The stub keeps flag-off API",
    ]
  },
  {
    file: "packages/engine/src/agent-api/world/queries.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* `worldQueriesSlot.get(flags)` so flag-off apps keep the stub.",
    ]
  },
  {
    file: "packages/engine/src/agent-api/xr/types.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Requested fixed foveation, between 0 and 1. Unavailable support is reported as a warning. */",
      "readonly reason?: \"no-webxr\" | \"unsupported\" | \"already-presenting\" | \"render-path-unavailable\" | \"no-webgl-context\" | \"no-xr-layer\" | \"session-failed\" | \"cancelled\";",
      "readonly depthSensing: \"not-requested\" | \"unavailable\" | \"unknown\" | \"cpu-optimized\" | \"gpu-optimized\";",
    ]
  },
  {
    file: "packages/engine/src/agent-api/xr/xrRuntime.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success (4); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!device || typeof device.setExternalFramebuffer !== \"function\" || typeof device.setViewport !== \"function\") return fail(\"render-path-unavailable\", \"The render device cannot draw into an XR framebuffer (it needs setExternalFramebuffer and setViewport). No session was started.\");",
      "warnings.push(`XR layers unavailable; using a base layer: ${errorMessage(error)}`);",
      "} else warnings.push(\"XR layers unavailable; using a base layer.\");",
      "catch (error) { warnings.push(`GPU depth sensing unavailable: ${errorMessage(error)}`); }",
      "} else warnings.push(\"XR fixed foveation is unavailable.\");",
      "(nextSession.enabledFeatures ? (Array.from(nextSession.enabledFeatures).includes(\"depth-sensing\") ? \"unknown\" : \"unavailable\") : \"unknown\");",
      "if (depthUsage === \"unavailable\") warnings.push(\"XR depth sensing was not granted by the session.\");",
    ]
  },
  {
    file: "packages/engine/src/contracts/animation.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub animation api: single-clip state over today's legacy animation",
      "/** Stub: overrides are accepted and dropped (no pose pipeline without PRD 06). */",
    ]
  },
  {
    file: "packages/engine/src/contracts/app.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// AuraApp extends AuraAppExtensionMap (PR 0a): every member always present; stub factories registered in PR 0a under owner \"prd15\" with the provider lane's flag; the provider lane registers its real factory with the SAME member and flag — resolution: real if provided && flag on.",
    ]
  },
  {
    file: "packages/engine/src/contracts/art.ts",
    reason: "PR 0a C-35 contract stub: auditArtDirection returns an explicit \"PENDING\" marker (not a fabricated pass); the real audit is @aura3d/game auditArtDirection",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** PR 0a stub: returns [] with a PENDING marker until PRD 14 implements it. */",
    ]
  },
  {
    file: "packages/engine/src/contracts/atmosphere.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: setFog writes through the environmentFog RenderSource field;",
    ]
  },
  {
    file: "packages/engine/src/contracts/camera.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub factories: `static`, `fromSpec` and `rail` are real; the others",
    ]
  },
  {
    file: "packages/engine/src/contracts/compiler.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "\"transform.rotationOrder\": { reason: \"C-06: composeWorldMatrix stub lowers to ZYX\", ownerPrd: 1 },",
      "\"transform.quaternion\": { reason: \"C-06: composeWorldMatrix stub lowers to euler\", ownerPrd: 1 },",
      "degradations: [{ code: \"capability-degraded\", message: \"compiler stub: no impl bound\", frame: 0 }],",
      "* `ctx.flags.on(\"A3D_QR_COMPILER\")`, else the stub. `updateCompiledScene`",
      "* scenes it did not produce, so flag-off mounts keep stub semantics.",
    ]
  },
  {
    file: "packages/engine/src/contracts/diagnostics.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Section keys, in declaration order — used by the C-31 stub and the ownership check. */",
    ]
  },
  {
    file: "packages/engine/src/contracts/effects.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a honest stub: `burst` and `spawn` create pooled primitive nodes through",
      "* quad. `pixelBacked` is computed from the stub's own draw counts, so a",
      "setPosition: (_p: AuraVec3) => { /* pooled nodes are not individually addressable on the stub */ }",
    ]
  },
  {
    file: "packages/engine/src/contracts/environment.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: queries the registered sources in (priority, registration) order",
    ]
  },
  {
    file: "packages/engine/src/contracts/game.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* Flag: A3D_QR_GAME. The stub lives in `./stubs/game.ts`.",
    ]
  },
  {
    file: "packages/engine/src/contracts/gameSound.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* flag-off callers get the silent C-25 stub, flag-on callers get the real",
      "// The contract stub has a narrower options type than the real factory",
    ]
  },
  {
    file: "packages/engine/src/contracts/lighting.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub runtime: hemisphere lowers to two directional fills at 0.5",
      "async updateProbe(_name: string): Promise<void> { /* no probe path on the stub */ }",
      "/** Bookkeeping only on the stub: no probe path exists to swap. */",
    ]
  },
  {
    file: "packages/engine/src/contracts/materials.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: `materialOverrides` lowers to the existing `setTint`",
      "/** GU47 E-D: recorded only on the stub (reported as `STUB_MATERIAL_HANDLE` by `inspectMaterials`). */",
    ]
  },
  {
    file: "packages/engine/src/contracts/post.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (5); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* the pass (including deferred passes). The WebGL device must have an active",
      "* normal and reactive must be produced for the current view; unavailable",
      "/** SH-03: mutate one numeric uniform of a registered custom pass by name; staged onto the live descriptor — no re-registration or shader rebuild. Optional on stub surfaces. */",
      "/** PR 0a stub surface: addPostPass maps to registerPostPass; setQualityTier records. */",
      "return () => { /* pass release on the stub chain is a no-op */ void p; };",
      "setEffect(_name: string, _patch: Record<string, number | string | boolean | number[]>): void { /* the stub chain has no runtime post control */ }",
      "setEffectEnabled(_name: string, _enabled: boolean): void { /* the stub chain has no runtime post control */ }",
    ]
  },
  {
    file: "packages/engine/src/contracts/sceneGraph.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: composes parent * local with ZYX order via the same math as",
      "/** PR 0a stub: delegates to the existing `eulerToQuat` (index.ts:5345) ZYX math; other orders lower to ZYX. */",
      "/** PR 0a stub: linear RGBA, delegating to the existing hex parser semantics. */",
    ]
  },
  {
    file: "packages/engine/src/contracts/time.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a real stub: AuraTimeController is pure state — scale ramps at a",
    ]
  },
  {
    file: "packages/engine/src/contracts/world.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub queries: `ground()` raycasts the physics world when one exists,",
    ]
  },
  {
    file: "packages/engine/src/game/GameAudio.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (5); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (3); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** §20 `audio.webm`: record the master bus for ~`seconds` (60 default). Null flag-off or when MediaRecorder is unavailable. */",
      "/** Real engine voices report when they finished; stub handles omit it. */",
      "/** Deferred voices settle false when cancelled or unavailable. */",
      "let engine: ReturnType<typeof gameSoundSlot.stub> | undefined;",
      "// lane prd09 provided it, else the silent stub — 09-CONF real-or-stub",
      "// stub (#712) muted every flag-off route (flag-off output must not change).",
      "soundStatusError = \"Game audio status unavailable.\";",
      "// occlusion update made while the deferred voice was loading.",
      "// is suppressed. Deferred handles also settle on stop or disposal.",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd01.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* `output` app extension (stub surface), and merge this lane's",
      "// production bundle mounted on the stub cache and compiled per draw per frame.",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd01/diagnostics.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "readonly implementation: \"stub\" | \"real\";",
      "// PRD01_RENDERER seam. Peek (never create) so a stub can't get planted.",
      "stub: cache === undefined && device === undefined,",
      "stub: false,",
      "stub: renderer === undefined,",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd01/outputSurface.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "implementation: outputPath && laneRenderer(app) ? (\"real\" as const) : (\"stub\" as const),",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd04.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* `A3D_QR_MATERIALS` is off (stub-equivalent output inside the handle).",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd06.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "*   keeps PR 0a stub semantics until T0.18/T1.10.",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd08.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// `camera.legacy` forces the stub even when the flag is on (C-22).",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd09.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// returns it only for A3D_QR_GAME-on apps — flag-off stays on the stub.",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd10.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* apps get the C-26 stub and flag-on apps get the PRD-10 queries.",
      "return impl(app); // flag-off: frozen C-26 stub",
    ]
  },
  {
    file: "packages/engine/src/lanes/prd11.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* C-38 `quality` extension (C-27 seam). Phase 0 mounts the PR 0a stub",
    ]
  },
  {
    file: "packages/engine/src/production-runtime/actor/materialDiagnostics.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "ktx2: flags.on(\"A3D_QR_MATERIALS_KTX2\") ? \"basis\" : \"unavailable\",",
    ]
  },
  {
    file: "packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (4); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1); comment naming a contract-seam stub fallback and its limitation (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (options?.importedMaterialOverridden) return { status: \"unavailable\", reason: \"imported-material-overridden\" };",
      "if (!info) return { status: \"unavailable\", reason: \"missing-source-map\" };",
      "? { status: \"unavailable\", reason: \"texture-load-failed\" }",
      "if (incompatibleBuiltin) return { status: \"unavailable\", reason: \"unsupported\" };",
      "return { status: \"unavailable\", reason: binding.status };",
      "* C-02 `ProgramCacheLike.precompile` (which is the C-28 stub semantics:",
      "* synchronous-compile stub resolves on the first microtask, so at most one",
    ]
  },
  {
    file: "packages/engine/src/production-runtime/actor/TypedGLBActorMaterials.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* falls back to the contract-stub semantics while `A3D_QR_MATERIALS` is off (`inspectMaterials`",
      "private stub(): StubModelMaterialHandle {",
      "return this.materialsOn ? this.authoredNames : this.stub().materialNames();",
      "return this.materialsOn ? (this.actor?.materialVariants() ?? []) : this.stub().materialVariants();",
      "this.stub().setMaterialVariant(name);",
      "this.stub().setMaterialOverrides(overrides);",
      "return this.materialsOn ? (this.actor?.inspectMaterials() ?? []) : this.stub().inspectMaterials();",
      "this.stub().setEmissive(target, color, intensity);",
      "* the C-37 map must honour the flag; the stub fallback inside the handle keeps flag-off behavior",
    ]
  },
  {
    file: "packages/engine/src/production-runtime/effects/WeatherVolume.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// `app.world.height().heightAt`, stub 0). Pure CPU state — the draw feed is",
    ]
  },
  {
    file: "packages/engine/src/production-runtime/TypedGLBActor.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (6); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw unsupportedCustomModelMaterial(\"the imported skin requires unavailable JOINTS_1/WEIGHTS_1 vertex streams\");",
      "throw unsupportedCustomModelMaterial(\"skinned custom replacements require a single authored material slot; per-slot selection is unavailable\");",
      "throw unsupportedCustomModelMaterial(`the certified ${pass} skinning program is unavailable or was changed`);",
      "if (!material || material.disposed) throw unsupportedCustomModelMaterial(`custom slot '${name}' is unavailable`);",
      "if (binding.status !== \"unavailable\") continue;",
      "`Required KHR_animation_pointer binding unavailable for animation ${source.animationIndex} channel ${source.channelIndex} (${source.pointer}): ${binding.reason ?? \"unavailable\"}`",
    ]
  },
  {
    file: "packages/engine/src/runtime/ResourceManager.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (typeof fetch !== \"function\") throw new Error(`Resource \"${safeId}\" cannot load because fetch is unavailable.`);",
    ]
  },
  {
    file: "packages/game/src/art/snapshot.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* measured draw counts only, never stub-reported GPU features, so it works on",
    ]
  },
  {
    file: "packages/game/src/input/bindingStore.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "} catch { /* corrupt or unavailable storage keeps the defaults */ }",
    ]
  },
  {
    file: "packages/game/src/juice/fxPoolLayerCore.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* used a counting stub, so `fx.burst` and juice presets with `fx` rendered",
    ]
  },
  {
    file: "packages/game/src/session/accessibility.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// In-memory copy — the source of truth when localStorage is unavailable.",
      "/* storage unavailable — keep in-memory */",
    ]
  },
  {
    file: "packages/game/src/session/presented.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (outcome.state === \"failed\" && !(outcome.code === \"renderer-unavailable\" &&",
    ]
  },
  {
    file: "packages/game/src/sfx.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* `{format}` placeholder the GameSoundEngine resolves via its format probe. */",
    ]
  },
  {
    file: "packages/input/src/InputSystem.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "try { if (target.hasPointerCapture?.(pointer.pointerId)) return; } catch { /* Treat an unavailable capture as lost. */ }",
    ]
  },
  {
    file: "packages/input/src/WebXRSessionController.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!source && generation === this.generation) this.warnings.push(\"Hit testing unavailable: no hit-test source was supplied.\");",
      "else this.warnings.push(\"Hit testing unavailable: viewer reference space was not supplied.\");",
      "this.warnings.push(`Hit testing unavailable: ${message(error)}`);",
      "} else this.warnings.push(\"Hit testing unavailable: session does not expose requestHitTestSource.\");",
      "catch (error) { if (generation === this.generation) this.warnings.push(`Light estimation unavailable: ${message(error)}`); }",
      "} else this.warnings.push(\"Light estimation unavailable: session does not expose requestLightProbe.\");",
    ]
  },
  {
    file: "packages/math/src/independent/mutable/Frustum.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// An immutable infinite-far frustum may retain any placeholder at index 4;",
    ]
  },
  {
    file: "packages/physics/src/native/NativeQueries.ts",
    reason: "explicit unsupported shape-pair refusal: native capsule/box sweeps and the inside-origin wheel ray throw for target shapes they do not solve instead of returning a wrong hit",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new Error(\"Native wheel inside-origin ray against 'capsule' is not implemented for this direction.\");",
      "else throw new Error(`Native capsule sweep against ${target.kind} is not implemented.`);",
      "else throw new Error(`Native sweep of moving box against ${target.kind} is not implemented.`);",
    ]
  },
  {
    file: "packages/rendering/src/atmosphere/shaders/volumetric-inject.glsl.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "uniform sampler2D u_noiseTex;    // unused placeholder channel (real 3D noise below)",
      "// Lighting: sun × visibility(stub 1.0) × HG + ambient SH stub + ≤4 locals.",
    ]
  },
  {
    file: "packages/rendering/src/atmosphere/shaders/wetness.glsl.ts",
    reason: "WebGL2 wetness chunk reports WETNESS_PENDING once when the C-02 generator seam is not provided (flag off); native WebGPU wetness shipped under S5-DEF-02",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// stub the chunk is registered but never spliced — WETNESS_PENDING reports",
      "/** Called when the wetness feature selected but couldn't splice (stub gen). */",
    ]
  },
  {
    file: "packages/rendering/src/batching/BatchedGeometryPool.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Call after backend work completes; retry if deferred cleanup throws. */",
      "else if (retrying) throw new Error(\"BatchedGeometryPool unregister retry is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/batching/BatchMembers.ts",
    reason: "deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// A failed/unavailable fence proves no completion. Keep the lease until",
    ]
  },
  {
    file: "packages/rendering/src/batching/DrawDataTexture.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "else if (retrying) throw new Error(\"DrawDataTexture unregister retry is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/batching/MultiDrawBatch.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* While the C-02 program generator is a stub the planner marks leftover",
    ]
  },
  {
    file: "packages/rendering/src/batching/shaders/packedLoopColor.glsl.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* texture, gl_DrawID or deferred multi-draw submission is implied.",
    ]
  },
  {
    file: "packages/rendering/src/batching/StaticMergePlanner.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "*      while the C-02 generator is a stub (`multi-draw-generator-pending`).",
      "/** Per-draw instance cap while C-07's stub instance buffer is active. */",
    ]
  },
  {
    file: "packages/rendering/src/compute/ComputeContext.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!this.device.createSampler) throw invalid(\"compute sampler creation is unavailable on this device\");",
      "if (errors.length > 1) throw new AggregateError(errors, \"Deferred compute buffer cleanup failed\", { cause: errors[0] });",
      "if (native.mipLevelCount !== undefined && mip >= native.mipLevelCount) throw invalid(`binding ${key} mip is unavailable in the native texture`);",
      "if (!this.device.queue.onSubmittedWorkDone) throw invalid(\"compute queue completion is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/contracts/atmosphere.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* spec record here. The engine-side stub lowers it to sky.dayNight.",
      "// PR 0b wires the existing gradient pass; the stub records the call.",
    ]
  },
  {
    file: "packages/rendering/src/contracts/core.ts",
    reason: "contract-slot machinery: every C-xx slot carries a stub that is used unless the real provider is registered and its flag is on (the seam itself, not a missing feature)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* TypeScript surface, a stub shipped in PR 0, and a conformance test. The real",
      "* implementation replaces the stub behind a flag; consumers never change code",
      "readonly stub: T;",
      "/** Real impl iff provided && flags.on(flag); otherwise stub. Call at mount/resolve time, never per draw. */",
      "public readonly stub: T",
      "return this.stub;",
      "export function defineContractSlot<T>(id: ContractId, owner: PrdId, flag: QrFlagName, stub: T): ContractSlot<T> {",
      "return new ContractSlotImpl(id, owner, flag, stub);",
    ]
  },
  {
    file: "packages/rendering/src/contracts/deform.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: returns {fallback:\"cpu\", reason:\"PRD06_PENDING\"} — morphs keep",
    ]
  },
  {
    file: "packages/rendering/src/contracts/device.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub FrameStats — real because it is pure: rAF/draw intervals, CPU",
      "/** PR 0a stub: creates targets on every acquire and disposes them on release. */",
      "/** The stub allocates a fresh target; only this acquisition may retire it. */",
      "const token = Symbol(\"stub-render-target-lease\");",
      "trim(_maxIdleFrames: number): void { /* nothing pooled in the stub */ }",
    ]
  },
  {
    file: "packages/rendering/src/contracts/environment.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a placeholder: the documented stub arrives in PR 0b wrapping the existing",
      "* True for the pending stub (C-09 slot not provided yet, or A3D_QR_LIGHTING",
    ]
  },
  {
    file: "packages/rendering/src/contracts/frameUniforms.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: `buffer` is null. Chunks read the legacy uniforms",
    ]
  },
  {
    file: "packages/rendering/src/contracts/geometry.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: wraps the per-frame instance upload behaviour used by ForwardPass",
    ]
  },
  {
    file: "packages/rendering/src/contracts/output.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: \"rgba16f\" when the `hdr-render-targets` capability exists, else",
    ]
  },
  {
    file: "packages/rendering/src/contracts/particles.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** PR 0a: calling the stub's methods throws PARTICLE_PASS_PENDING. */",
      "removeBatch(): void { /* no-op so stub handles can always be released */ }",
    ]
  },
  {
    file: "packages/rendering/src/contracts/program.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: wraps the existing ShaderLibrary lookups and ignores registered",
      "/** 01-HANG: one program per key — the stub used to compile on every acquire (per draw, per frame). */",
    ]
  },
  {
    file: "packages/rendering/src/contracts/quality.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub controller: \"auto\" resolves to \"high\" on desktop and \"medium\" when",
    ]
  },
  {
    file: "packages/rendering/src/contracts/rendererFactory.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** PR 0a stub: records registrations; rebuild invokes each registered rebuild. */",
    ]
  },
  {
    file: "packages/rendering/src/contracts/shadows.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PR 0a stub: returns a key with only `instanced` and `doubleSided` filled,",
    ]
  },
  {
    file: "packages/rendering/src/contracts/testing/ChunkHarness.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* AuraFrame/AuraLights uniform blocks so stub chunks compile either way.",
    ]
  },
  {
    file: "packages/rendering/src/DepthConvention.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "const fallbackReason = supported ? undefined : `${requestedMode} depth is unavailable in the active rendering pipeline`;",
    ]
  },
  {
    file: "packages/rendering/src/DepthPass.ts",
    reason: "fail-closed depth-pass refusals with stable RenderDeviceError codes (alpha-hashed depth DEPTH_ALPHA_HASH_UNSUPPORTED, unsupported clipping accessors, portable/checked submission and graph storage bindings unavailable)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Checked depth submission is unavailable on this device\", \"DEPTH_CHECKED_SUBMISSION_UNAVAILABLE\");",
      "if (key.alphaHash) throw new RenderDeviceError(\"Alpha-hashed depth is not implemented\", \"DEPTH_ALPHA_HASH_UNSUPPORTED\", { label: item.label });",
      "if (!texture.validate().ok) throw new RenderDeviceError(\"Masked depth base-color texture is unavailable\", \"DEPTH_ALPHA_INPUT_INVALID\", { label: item.label });",
      "throw new RenderDeviceError(\"Custom clipping plane array methods are unavailable across depth targets\", \"DEPTH_CLIPPING_ACCESSOR_UNSUPPORTED\");",
      "throw new RenderDeviceError(\"Clipping is unavailable for point, screen-space line and billboard sprite depth geometry used as a shadow proxy of other geometry\", \"DEPTH_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED\", { label: source.label });",
      "throw new RenderDeviceError(\"Per-member materialClippingFor is unavailable for batched instances\", \"BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED\");",
      "if (alphaHash) throw new RenderDeviceError(\"Alpha-hashed depth is not implemented\", \"DEPTH_ALPHA_HASH_UNSUPPORTED\", { label: source.label });",
      "throw new RenderDeviceError(\"Shader graph storage bindings are unavailable\", \"GRAPH_STORAGE_BINDINGS_UNAVAILABLE\", { label: source.label });",
      "if (alpha === undefined) throw new RenderDeviceError(\"Single-instance depth alpha is unavailable\", \"DEPTH_INSTANCE_ALPHA_UNSUPPORTED\", { label: caster.label });",
      "throw new RenderDeviceError(\"Portable depth submission is unavailable\", \"PORTABLE_UNIFORM_BACKEND_UNSUPPORTED\", { label: caster.label });",
    ]
  },
  {
    file: "packages/rendering/src/environment/EnvironmentCache.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "try { subtle = globalThis.crypto?.subtle; } catch { /* An unavailable crypto provider fails closed below. */ }",
      "* is still used. While the factory is the pending stub, an HDRI load rejects",
    ]
  },
  {
    file: "packages/rendering/src/environment/FirstFrameGate.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Default upper bound on a wait, in ms; a first frame slower than this lets the deferred work run before it. */",
    ]
  },
  {
    file: "packages/rendering/src/EnvironmentPreset.ts",
    reason: "legacy throwing stub kept for one minor version; it throws with a replacement hint instead of doing nothing",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* throwing stub for one minor version; author environments through",
    ]
  },
  {
    file: "packages/rendering/src/forward/DrawSubmit.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (3); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Require an actual native submission; such a draw cannot be deferred. */",
      "if (!device.drawChecked) throw new RenderDeviceError(\"Checked forward submission is unavailable\", \"FORWARD_CHECKED_SUBMISSION_UNAVAILABLE\", { label: bindings.item.label });",
      "// Submit each logical draw immediately. Deferred batching can run an earlier",
      "/** Compatibility hook for callers that used to flush deferred forward draws. */",
    ]
  },
  {
    file: "packages/rendering/src/forward/ScreenSpaceLineClipping.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* homogeneous divisor or reconstructed position produces finite placeholder",
    ]
  },
  {
    file: "packages/rendering/src/forward/Transmission.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Transmission frame device is unavailable or changed\", \"TRANSMISSION_DEVICE_UNAVAILABLE\");",
      "if (!target) throw new RenderDeviceError(\"Transmission target is unavailable\", \"TRANSMISSION_TARGET_UNAVAILABLE\");",
    ]
  },
  {
    file: "packages/rendering/src/ForwardPass.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (22); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (12); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (3); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* sees it, and again (idempotently) by every ForwardPass in case a module cycle deferred the first call. It never selects",
      "function selectiveCompilerFor(cache: ProgramCacheLike, device: RenderDevice): TrustedSelectiveCompiler | \"pending\" | \"unavailable\" {",
      "if (!programCacheSlot.provided || !instanceBufferSlot.provided || !frameUniformsSlot.provided || !webgl2DeviceHost(device)) return \"unavailable\";",
      "if (!discovery || !WeakSet.prototype.has.call(discovery.value, cache)) return \"unavailable\";",
      "return \"unavailable\";",
      "if (provider === programCacheSlot.stub) return \"unavailable\";",
      "if (trustedSelectiveCompiler) return trustedSelectiveCompiler.provider === provider ? trustedSelectiveCompiler : \"unavailable\";",
      "if (selectiveCompilerUnavailable) return \"unavailable\";",
      "/** C-40 exposure placeholder (default 1) until the output-options surface lands. */",
      "this.projectedSpotUnsupported(\"clustered\", \"Clustered projected-spot indexing is unavailable; scalar lighting is used.\");",
      "this.projectedSpotUnsupported(\"texture-unavailable\", \"The projected image resource is unavailable; scalar lighting is used.\");",
      "this.photometricUnsupported(adopted.reason, \"Photometric profile frame resources are unavailable; scalar lighting is used.\");",
      "throw new RenderDeviceError(\"Per-member materialClippingFor is unavailable for batched instances\", \"BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED\", {});",
      "// #181: issue any trailing multi-draw run deferred by `submitDraw`.",
      "if (!qrCoreGeneratorOn(flags) || !device.probe?.parallelShaderCompile) return \"generated-programs-unavailable\";",
      "if (!cache) return \"generated-programs-unavailable\";",
      "if (compiler === \"unavailable\" || !selectiveCompilerMatchesDevice(compiler, device) ||",
      "!compiler.cacheModule.isBuiltinSelectiveBloomCache(cache, device, flags)) return \"generated-programs-unavailable\";",
      "if (!captured.handles) return captured.reason ?? \"signal-program-unavailable\";",
      "!handle.program.reflection.uniforms.has(\"u_a3dBloomMaxRadiance\")) return \"signal-program-unavailable\";",
      "if (clipping.groups.length > 0) throw new RenderDeviceError(\"The clipping shader is unavailable\", \"FORWARD_CLIPPING_PROGRAM_UNSUPPORTED\", { material: baseMaterial.name });",
      "if (advancedLighting) throw new RenderDeviceError(\"The advanced-lighting shader is unavailable\", \"ADVANCED_LIGHTING_PROGRAM_UNSUPPORTED\", {});",
      "this.projectedSpotUnsupported(\"shader-contract\", \"The projected-spot shader or sampler budget is unavailable; scalar lighting is used.\");",
      "this.photometricUnsupported(\"material-binding-unsupported\", \"The profile material bindings are unavailable; scalar lighting is used.\");",
      "this.projectedSpotUnsupported(\"material-binding-unsupported\", \"The projected image material bindings are unavailable; scalar lighting is used.\");",
      "throw new RenderDeviceError(\"Selected irradiance volume is unavailable for this device\", \"IRRADIANCE_VOLUME_UNAVAILABLE\", {});",
      "throw new RenderDeviceError(\"The weighted transparency shader is unavailable\", \"WEIGHTED_TRANSPARENCY_PROGRAM_UNAVAILABLE\");",
      "if (!pipeline || !submittedVertex) throw new RenderDeviceError(\"Forward draw resources are unavailable\", \"MISSING_VERTEX_BUFFER\", {});",
      "throw new RenderDeviceError(\"Portable uniform submission is unavailable\", \"PORTABLE_UNIFORM_BACKEND_UNSUPPORTED\", { material: baseMaterial.name });",
      "// deferred multi-draw queue across another item's mutation callback.",
      "if (this.options.selectiveBloom?.enabled && !route.core) invalidateSelectiveBloomFrame(this.options.selectiveBloom, \"generated-programs-unavailable\");",
      "this.projectedSpotUnsupported(\"shader-unsupported\", \"The projected-spot program is unavailable; scalar lighting is used.\");",
      "this.photometricUnsupported(\"shader-unsupported\", `The profile program is unavailable; scalar lighting is used. ${String(error)}`);",
      "throw new RenderDeviceError(\"Clipping is unavailable for packed multi-draw geometry\", \"FORWARD_CLIPPING_BATCH_UNSUPPORTED\", { label: item.label });",
      "throw new RenderDeviceError(\"Graph irradiance volume texture is unavailable\", \"GRAPH_IRRADIANCE_VOLUME_BINDING_UNAVAILABLE\", { material, name });",
      "throw new RenderDeviceError(\"Graph irradiance volume parameters are unavailable\", \"GRAPH_IRRADIANCE_VOLUME_BINDING_UNAVAILABLE\", { material });",
      "throw new RenderDeviceError(\"Graph reflection probe parameters are unavailable\", \"GRAPH_PROBE_BINDING_UNAVAILABLE\", { material, name });",
      "throw new RenderDeviceError(\"Graph reflection probe cube is unavailable\", \"GRAPH_PROBE_BINDING_UNAVAILABLE\", { material });",
      "if (!fallback) throw new RenderDeviceError(\"Graph reflection probe cubes are unavailable\", \"GRAPH_PROBE_BINDING_UNAVAILABLE\", { material });",
      "* when a value is unavailable the uniform simply stays unbound (the adapter",
    ]
  },
  {
    file: "packages/rendering/src/GaussianSplatColorComposite.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Splat color compositor or device is unavailable\", \"GAUSSIAN_SPLAT_COLOR_UNAVAILABLE\");",
    ]
  },
  {
    file: "packages/rendering/src/GaussianSplatRenderer.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Why the GPU path is unavailable (non-WebGPU device, sorter creation or sort failure); CPU sorting is used. */",
      "if (this.disposed || this.device.disposed || this.device.contextLost) throw new Error(\"splat renderer is disposed or device is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/Geometry.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (owners === undefined || owners < 1) throw new Error(\"Geometry buffer ownership is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/lanes/prd01.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// C-07 real: persistent doubling buffer (stub was per-write full upload).",
    ]
  },
  {
    file: "packages/rendering/src/lanes/prd03.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// requires `post/` GPU code to be reachable only through the deferred",
    ]
  },
  {
    file: "packages/rendering/src/lanes/prd05.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* unconditional: `ContractSlot.get(flags)` serves the stub unless",
    ]
  },
  {
    file: "packages/rendering/src/lanes/prd06.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* The stub cache honours the C-18 shape while allocating fresh textures on",
      "* carries the PR-0a stub types and the divergent `DEFORM_CHUNKS` record —",
      "// `buildMorphTargetTexture` collides with the PR-0a contracts/deform stub export;",
    ]
  },
  {
    file: "packages/rendering/src/lanes/prd11.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// impl only under `A3D_QR_WEBGPU`; flag-off stays on the contract stub (IC-0).",
    ]
  },
  {
    file: "packages/rendering/src/lighting/AdvancedLightingBindings.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!frame) return fail(\"Advanced lighting frame is unavailable\", \"ADVANCED_LIGHTING_FRAME_UNAVAILABLE\");",
    ]
  },
  {
    file: "packages/rendering/src/lighting/NativeLightBaking.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* linear filtering is unavailable; bind a nearest/non-filtering sampler where",
    ]
  },
  {
    file: "packages/rendering/src/lighting/PhotometricFrameResources.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (4); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "| { readonly status: \"unsupported\"; readonly reason: \"frame-unavailable\" | \"stale-packet\" | \"packet-owned\" | \"atlas-budget\" };",
      "* has returned or thrown. A failed/unavailable completion fence is not proof",
      "if (!this.frameCurrent(frame)) return { status: \"unsupported\", reason: \"frame-unavailable\" };",
      "if (!token) return { status: \"unsupported\", reason: \"frame-unavailable\" };",
      "if (this.device.activeFrameToken !== token || !this.frameCurrent(frame)) return { status: \"unsupported\", reason: \"frame-unavailable\" };",
    ]
  },
  {
    file: "packages/rendering/src/lighting/PhotometricProfileBindings.ts",
    reason: "EXPERIMENTAL-5.0 (S5-WP04-03/04): clustered profile indexing is an explicit refusal with scalar-lighting fallback",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "| \"visibility-unavailable\"",
      "if (!modulation || typeof modulation !== \"object\") throw new TypeError(\"Photometric profile is unavailable\");",
      "if (typeof light.photometricVisible !== \"boolean\") throw new TypeError(\"Photometric effective visibility is unavailable\");",
      "if (!table || !table.verticalAngles || !table.horizontalAngles || !table.candela) throw new TypeError(\"Photometric profile table is unavailable\");",
      "if (options.clustered) return unsupported(\"clustered\", \"Clustered profile indexing is not implemented\");",
      "if (typeof light.photometricVisible !== \"boolean\") return unsupported(\"visibility-unavailable\", \"Effective profile visibility is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/lighting/ProjectedSpotBindings.ts",
    reason: "EXPERIMENTAL-5.0 (S5-WP04-03/04): clustered projection indexing and stale/missing projected-image inputs are explicit unsupported results with scalar-lighting fallback",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "| \"unsupported-light\" | \"invalid-transform\" | \"frame-unavailable\" | \"texture-unavailable\" | \"stale-resource\";",
      "if (!Array.isArray(lights)) return unsupported(\"stale-selection\", \"Direct lights are unavailable\");",
      "if (options.clustered) return unsupported(\"clustered\", \"Clustered projection indexing is not implemented\");",
      "return unsupported(\"invalid-transform\", \"The projected image or its asset identity is unavailable\");",
      "if (!validFrame(frame)) return unsupported(\"frame-unavailable\", \"A live device frame and view identity are required\");",
      "if (!imageResource || !imageResource.matchesAsset(asset)) return unsupported(\"texture-unavailable\", \"The verified image resource does not match the authored asset\");",
      "if (!lease) return unsupported(\"texture-unavailable\", \"The verified image is unavailable for this frame\");",
      "return unsupported(lease ? \"stale-resource\" : \"stale-selection\", error instanceof Error ? error.message : \"Projected spot inputs are unavailable\", lease);",
    ]
  },
  {
    file: "packages/rendering/src/lighting/VoxelIndirectLighting.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      ": \"GPU voxelization is unavailable; using the bounded CPU volume. A compatible renderer may trace that volume on the GPU.\" });",
    ]
  },
  {
    file: "packages/rendering/src/LightingRig.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new Error(\"Forward light profile/image binding is unavailable; set unsupportedFallback to 'unmodified' for explicit scalar-light fallback\");",
    ]
  },
  {
    file: "packages/rendering/src/Material.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* when the extension is unavailable.",
    ]
  },
  {
    file: "packages/rendering/src/materials/features.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Pinned transmission texture is unavailable\", \"TRANSMISSION_CAPTURE_UNAVAILABLE\", { label: item.label });",
      "if (!captured) throw new RenderDeviceError(\"Current frame transmission capture is unavailable\", \"TRANSMISSION_CAPTURE_UNAVAILABLE\", { label: item.label });",
    ]
  },
  {
    file: "packages/rendering/src/materials/MaterialExtensions.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "lower(\"bounded\", \"Transmission uses its bounded fallback because the scene-color backdrop is unavailable.\");",
    ]
  },
  {
    file: "packages/rendering/src/output/EncodedDisplaySurface.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (19); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* dependency on the deferred post graph.",
      "function unavailable(message: string): never {",
      "unavailable(\"Invalid or duplicate post-target lease registration\");",
      "unavailable(\"The encoded display surface lease is no longer live\");",
      "unavailable(\"Encoded display output requires a live raw RGBA8 single-sample 2D target\");",
      "unavailable(\"Encoded display output requires a verified WebGL display scope\");",
      "unavailable(\"The display canvas color or alpha mode changed\");",
      "unavailable(\"An active explicit post-target lease is required\");",
      "unavailable(\"Encoded display output requires an active verified frame and canvas\");",
      "unavailable(\"The display target changed during capability issuance\");",
      "unavailable(\"Invalid, foreign, or forged encoded display surface\");",
      "if (state.validating) unavailable(\"The encoded display surface is already being validated\");",
      "unavailable(\"The encoded display surface belongs to another frame or device generation\");",
      "unavailable(\"The encoded display attachment changed\");",
      "unavailable(\"The encoded display surface changed during validation\");",
      "if (expectedAlpha !== undefined && expectedAlpha !== state.info.alphaMode) unavailable(\"Encoded display alpha mode does not match\");",
      "if (state.writing) unavailable(\"The encoded display surface already has a writer\");",
      "if (!state.writing) unavailable(\"The encoded display surface has no active writer\");",
      "if (state.writing || !state.written) unavailable(\"The encoded display surface has not completed a write\");",
    ]
  },
  {
    file: "packages/rendering/src/output/OutputPass.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Canvas color-space negotiation is unavailable\", \"OUTPUT_COLOR_SPACE_UNAVAILABLE\", { requested });",
      "throw new RenderDeviceError(\"Canvas color-space renegotiation is unavailable\", \"OUTPUT_COLOR_SPACE_UNAVAILABLE\", { requested, active: negotiation.active });",
      "throw new RenderDeviceError(\"Requested background coverage is unavailable\", \"OUTPUT_COVERAGE_UNAVAILABLE\");",
    ]
  },
  {
    file: "packages/rendering/src/passes/ContactShadowPass.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (2); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// C-01 prepass is real; with the stub it renders its own camera-space depth",
      "/** Fallback casters for the lane's own half-res depth render (C-01 stub). */",
      "if (device.disposed || device.contextLost) throw new RenderDeviceError(\"Contact shadow device is unavailable\", \"CONTACT_SHADOW_DEVICE_UNAVAILABLE\");",
    ]
  },
  {
    file: "packages/rendering/src/passes/Prd02ContactShadowsContributor.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success (3); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "readonly unavailable?: string;",
      "return { contactShadows: { passExecuted: false, depthSource: \"none\", unavailable: \"device-unavailable\" } };",
      "let unavailable: string | undefined;",
      "unavailable = CONTACT_SHADOWS_NO_CONSUMER_REASON;",
      "latestContactDiagnostics = { contactShadows: { passExecuted: false, depthSource: this.pass.depthSource(), unavailable: \"producer-failed\" } };",
      "...(unavailable ? { unavailable } : {}),",
      "latestContactDiagnostics = { contactShadows: { passExecuted: false, depthSource: \"none\", unavailable: reason } };",
    ]
  },
  {
    file: "packages/rendering/src/post/PostGraph.ts",
    reason: "post v2 passes whose phase is not implemented (and deferred custom passes) land in `skipped` with reason post-v2-deferred:phase-N; flag-off keeps the legacy chain",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* with reason `post-v2-deferred:phase-N`.",
      "* not yet implemented (or a deferred custom pass) also land in `skipped`",
      "* with reason `post-v2-deferred:phase-N` — never silently dropped.",
      "deferredReason: implemented ? null : `post-v2-deferred:phase-${descriptor.phase}`,",
      "* only once provided AND the flag is on — the legacy stub otherwise.",
    ]
  },
  {
    file: "packages/rendering/src/post/PostResources.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* stub allocates on every acquire). Entries are keyed by",
    ]
  },
  {
    file: "packages/rendering/src/post/PostTimer.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Begin a GPU-elapsed query for `label`. No-op when unavailable. */",
      "* discards pending results and marks the timer unavailable for the rest of",
    ]
  },
  {
    file: "packages/rendering/src/post/v2Entry.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PRD-03 Phase 2 — deferred v2 post-graph module barrel.",
      "// lanes/prd03, not through this deferred barrel).",
    ]
  },
  {
    file: "packages/rendering/src/post/v2Stages.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* PRD-03 Phase 3 — the transitional v2 GPU stage driver (deferred chunk:",
      "* The deferred `before-tonemap` custom passes. `run` executes them in anchor",
      "// Capture the caller's mask once, before custom callbacks or a deferred",
      "if (errors.length > 1) throw new AggregateError(errors, \"Deferred postprocess release failed\");",
      "// Keep only actual output and deferred handles through the handoff. Borrowed",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgl2/WebGL2Buffer.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgl2/WebGL2Capabilities.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgl2/WebGL2RenderTarget.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgl2/WebGL2Shader.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgl2/WebGL2Texture.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgpu/WebGPUBuffer.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgpu/WebGPUCapabilities.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgpu/WebGPURenderTarget.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgpu/WebGPUShader.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/backends/webgpu/WebGPUTexture.ts",
    reason: "deprecated shim: the former placeholder backend class was removed under the PRD 11 WebGPU freeze; the file remains only until barrel export Q-15-5",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @deprecated PRD 11 Phase 1 WebGPU freeze: placeholder removed; barrel export pending Q-15-5. */",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/materials/GLTFMaterialAdapter.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* E34 removal (PRD-04 P6-3): the `adaptGLTFMaterial`/`GLTFMaterialLike` stub —",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/materials/GLTFPBRMaterialAdapter.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* deleted `adaptGLTFMaterial`/`GLTFMaterialLike` stub under a PBR alias.",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/materials/MaterialCompiler.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* stub — a string-concat \"program key\" that never compiled anything — was",
    ]
  },
  {
    file: "packages/rendering/src/production-runtime/NativeRenderBundleCache.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (owner.contextLost) throw new Error(\"WEBGPU_BUNDLE_DEVICE_LOST: native device is unavailable\");",
      "throw new Error(\"WEBGPU_BUNDLE_DEVICE_LOST: native device is unavailable\");",
      "throw new Error(\"WEBGPU_BUNDLE_DEVICE_CHANGED: native device is unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/program/chunks/lights_legacy.glsl.ts",
    reason: "comment naming a contract-seam stub fallback and its limitation",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* generator is complete with every other lane's stub. Attenuation is the",
    ]
  },
  {
    file: "packages/rendering/src/program/ProgramCache.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (4); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (2); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Notify a mounted renderer that a deferred generated program needs another",
      "* or a promise is an entry deferred by the per-frame compile budget. */",
      "* the optional optimization unavailable.",
      "return { reason: \"signal-program-unavailable\" };",
      "if (!isBuiltinSelectiveBloomCache(cache, device, flags)) return { reason: \"generated-programs-unavailable\" };",
    ]
  },
  {
    file: "packages/rendering/src/program/ProgramGenerator.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// match for duplicate aliases or unavailable providers would otherwise",
    ]
  },
  {
    file: "packages/rendering/src/program/ShaderGraphCompiler.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (outputValues.position) reachable(outputValues.position, (node) => { if (node.op === \"input\" && FRAGMENT_ONLY.has(node.name as ShaderGraphBuiltin)) add(\"invalid-stage\", `${node.name} is unavailable in the vertex stage`, node.id); });",
      "add(\"invalid-stage\", `${dep.name} is unavailable in the vertex stage`, dep.id, expressionPath);",
    ]
  },
  {
    file: "packages/rendering/src/program/StaticGeneratedCacheCapability.ts",
    reason: "historical note recording that a former stub/placeholder was removed or replaced by the real path",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** @internal Installed once by the owning concrete cache, never by a stub. */",
    ]
  },
  {
    file: "packages/rendering/src/quality/DeviceProbe.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (kind === \"webgpu\") return \"WebGPU timestamp-query timing is unavailable for whole-frame inspection\";",
      "if (kind === \"webgl2\") return \"EXT_disjoint_timer_query_webgl2 unavailable\";",
      "return \"GPU timer queries unavailable\";",
    ]
  },
  {
    file: "packages/rendering/src/quality/FrameGpuTiming.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "export type FrameGpuTimingStatus = \"unavailable\" | \"pending\" | \"measured\" | \"discarded\";",
      "status: token ? \"pending\" : \"unavailable\", gpuTimeMs: null,",
      "...(token ? {} : { reason: backend ? \"GPU query could not start.\" : \"GPU timing is unavailable.\" }),",
    ]
  },
  {
    file: "packages/rendering/src/quality/FrameInspectionTiming.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "gpuSampleStatus?(sample: object): \"unavailable\" | \"pending\" | \"measured\" | \"discarded\";",
      "export type WholeFrameGpuStatus = \"unavailable\" | \"pending\" | \"measured\" | \"discarded\";",
      "unavailableReason = \"GPU timer queries unavailable\"",
      "if (!state.source) return { status: \"unavailable\", ms: null, reason: state.unavailableReason };",
    ]
  },
  {
    file: "packages/rendering/src/quality/FrameStats.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "export type FrameStatsGpuStatus = \"unavailable\" | \"pending\" | \"measured\" | \"discarded\";",
      "return this.gpuStatus.get(sample) ?? \"unavailable\";",
    ]
  },
  {
    file: "packages/rendering/src/reference/EffectComposer.ts",
    reason: "explicit unsupported-path refusal: throws or returns a stable unsupported error/diagnostic instead of approximating",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "reason: \"SMAA is not implemented in the public A3D postprocess pass catalog; use FXAA or TAA.\"",
    ]
  },
  {
    file: "packages/rendering/src/RenderDevice.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (2); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** PR 0a (C-11, lane 02 Q-01-5): depth-only target — no color attachment; `colorTexture` is an unallocated placeholder, `depthTexture` is the sampleable surface. */",
      "readonly requested: \"forward\" | \"deferred\" | \"meshlet\" | \"visibility\";",
      "readonly active: \"forward\" | \"deferred\" | \"meshlet\" | \"visibility\";",
    ]
  },
  {
    file: "packages/rendering/src/Renderer.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (29); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (8); warned fallback or diagnostic that reports the missing capability instead of faking success (2); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!camera) throw new RenderDeviceError(\"Managed VFX probe camera is unavailable\", \"PRD07_PROBE_CAMERA_UNSUPPORTED\");",
      "export type RendererDrawingPath = \"forward\" | \"deferred\" | \"meshlet\" | \"visibility\";",
      "if (![\"forward\", \"deferred\", \"meshlet\", \"visibility\"].includes(this.drawingPathOptions.mode)) {",
      "throw new RenderDeviceError(\"The authored frame was cancelled or its device became unavailable\", \"TEMPORAL_FRAME_CANCELLED\");",
      "readonly explicitTarget: RenderTarget | undefined; readonly deferred: boolean }): ReturnType<typeof nativeDofProjection> | undefined {",
      "|| this.renderingViews || this.pendingViewState || !this.rasterViewportIsFull() || options.explicitTarget || options.deferred",
      "): { readonly path: \"deferred\" | \"meshlet\" | \"visibility\"; readonly key: string; readonly format: string; readonly sampleCount: 1 | 4; readonly sharedPhysical: boolean } | undefined {",
      "if (path !== \"deferred\" && path !== \"meshlet\" && path !== \"visibility\") return undefined;",
      "if ((requested === \"deferred\" || requested === \"meshlet\" || requested === \"visibility\") && typeof native.getNativeDeferredSurface === \"function\" && knownPost &&",
      "const pipeline = requested === \"deferred\" ? new this.nativeDrawingPipelines!.DeferredPipeline(native.nativeGpuDevice, options)",
      "const requested = this.drawingPathOptions.mode === \"meshlet\" ? \"meshlet\" : this.drawingPathOptions.mode === \"visibility\" ? \"visibility\" : \"deferred\";",
      "if (!native.nativeGpuDevice || !native.getNativeDeferredSurface || !native.getNativeDeferredProbe || !native.hasNativeSurfaceViewOverride) return this.deferredFrameFallback(\"deferred borrowed attachments and probe support are unavailable\");",
      "if (lights.length > 1 || lights.some(light => light.kind !== \"directional\")) return this.deferredFrameFallback(\"the deferred physical path supports at most one directional light\");",
      "if (admission.reason || !admission.ibl) return this.deferredFrameFallback(admission.reason ?? \"the physical probe feature is unavailable\");",
      "if (attachments.sampleCount !== 1 && attachments.sampleCount !== 4) throw new RenderDeviceError(\"Deferred target sample count is unsupported\", \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\");",
      "{ environmentBackground, environmentFog, advanced: prepareAdvanced, explicitTarget: explicitRenderTarget, deferred: deferredInFrame });",
      "renderScale: this.renderScale, globalClipping: clippingFrame.hasActiveGlobal(), transmission: transmissionRequested, deferred: deferredInFrame });",
      "selectiveEarlyReason = sampleCount > 1 ? \"signal-msaa-target-unavailable\" : \"signal-target-unavailable\";",
      "selectiveEarlyReason = \"signal-target-unavailable\";",
      "if (!captureReads.length) throw new RenderDeviceError(\"Direct transmission capture is unavailable\", \"TRANSMISSION_CAPTURE_UNAVAILABLE\");",
      "const deferred = deferredOpaqueEligible ? this.deferredInterleavedOpaquePass({ forward, items, target: ownedTargets[0], postprocess, qrOutput, frameContext: forwardContext, lights,",
      "this.graph.addPass(deferred ?? forward);",
      "const deferred = deferredInFrame ? this.deferredOpaquePass({ forward, items, target: ownedTargets[0], postprocess, qrOutput, frameContext: forwardContext, lights,",
      "// The native deferred opaque pass (5.0) does not draw through ForwardPass's signal checks.",
      "const reason = selectiveEarlyReason ?? (deferredInFrame ? \"deferred-drawing-path\" : !selectiveCandidate ? \"target-not-selected\" :",
      "throw new RenderDeviceError(\"Native depth-of-field coverage proof is unavailable\", \"NATIVE_DOF_FRAME_STALE\");",
      "// the deferred v2 import). Another submission could overwrite a",
      "setSelectiveBloomSkipped(this.canvas ?? this.device, reason ?? (signal ? undefined : \"signal-target-unavailable\"));",
      "throw new RenderDeviceError(\"Per-member materialClippingFor is unavailable for batched instances\", \"BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED\");",
      "* S5-DEF-02: the noise-free PRD-07 wetness response on native deferred",
      "const reason = gpuTimeMs === null ? timing?.wholeFrameGpuReason ?? \"GPU frame timing unavailable\" : undefined;",
    ]
  },
  {
    file: "packages/rendering/src/renderer/CullingBatching.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* planned, \"unavailable\" = the device lacks `WEBGL_multi_draw` (or the",
      "readonly multiDrawMode?: \"multi-draw\" | \"none\" | \"unavailable\";",
      "* fallback (`multiDrawMode:\"unavailable\"`) instead of a plan the device",
      "multiDrawMode: plan.multiDrawGroups.length > 0 ? \"multi-draw\" : multiDrawAvailable ? \"none\" : \"unavailable\"",
    ]
  },
  {
    file: "packages/rendering/src/renderer/DeviceLifecycle.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* Returns an unsubscribe; no-ops and returns a stub on non-WebGL2 devices or",
      "* when the lifecycle host seam is unavailable.",
    ]
  },
  {
    file: "packages/rendering/src/renderer/FrameDepthConvention.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      ": device.kind === \"webgl2\" ? \"EXT_clip_control is unavailable\"",
    ]
  },
  {
    file: "packages/rendering/src/renderer/FrameGraph.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Best-effort FrameCamera for the PR 0b stub; PRD 01 publishes real history later. */",
      "/** Publish the producer's resolved per-view coverage; null means unavailable. */",
    ]
  },
  {
    file: "packages/rendering/src/renderer/PixelRatio.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* unsubscribe function; a no-op when matchMedia is unavailable.",
    ]
  },
  {
    file: "packages/rendering/src/renderer/PostprocessExecution.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** A signal frame must not race the deferred v2 HDR stage driver. */",
      "* deferred bag is still loading, or `legacy-chain:<reason>` when the seam",
      "* Starts (once) and returns the deferred `post/v2Entry` load. The sync",
      "errors.push(new RenderDeviceError(\"Postprocess target release was deferred by reentrant cleanup\", \"POSTPROCESS_TARGET_RELEASE_DEFERRED\"));",
      "// Without the deferred module bag the seam runs the fused present only:",
      "// renderer — the deferred chunk the bundle gate measures. The sync",
    ]
  },
  {
    file: "packages/rendering/src/renderer/postSkipped.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new Error(\"Native post lifecycle disposal deferred by reentrant registration\");",
    ]
  },
  {
    file: "packages/rendering/src/renderer/Prd06ShaderWarmup.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* TAA path is on. The C-28-stub semantics (resolve after a synchronous",
    ]
  },
  {
    file: "packages/rendering/src/renderer/qrSubFlags.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// silently hands back the PR-0a stub (legacy pbr-direct for every lit",
      "message: \"A3D_QR_CORE generator is on but the C-02 real program cache was never provided (lanes/prd01 not loaded — tree-shaken?); using the stub legacy-PBR cache\",",
    ]
  },
  {
    file: "packages/rendering/src/renderer/RendererFactory.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "]).then(([deferred, meshlet, visibility, admission, probe]) => ({",
      "DeferredPipeline: deferred.DeferredPipeline,",
      "nativeDrawingSceneFromRenderItems: deferred.nativeDrawingSceneFromRenderItems,",
    ]
  },
  {
    file: "packages/rendering/src/renderer/ScalarVolumeFrame.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (2); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "readonly deferred: boolean;",
      "throw new RenderDeviceError(\"Scalar volume frame device is unavailable or stale\", \"SCALAR_VOLUME_FRAME_STALE\");",
      "if (route.globalClipping || route.transmission || route.deferred) {",
    ]
  },
  {
    file: "packages/rendering/src/renderer/SceneDepthCopyPass.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Scene depth copy belongs to an unavailable or different device generation\", \"SCENE_DEPTH_COPY_DEVICE_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"Scene depth copy device is unavailable\", \"SCENE_DEPTH_COPY_DEVICE_UNAVAILABLE\");",
    ]
  },
  {
    file: "packages/rendering/src/renderer/SceneRasterLease.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!bindings) return stale(\"Prepared temporal bindings are unavailable\");",
    ]
  },
  {
    file: "packages/rendering/src/renderer/SceneRasterParticipantLease.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "catch { return invalid(\"Participant buffer device state is unavailable\"); }",
    ]
  },
  {
    file: "packages/rendering/src/renderer/SceneRasterSnapshot.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** CSS dimensions may be unavailable for an offscreen target. */",
    ]
  },
  {
    file: "packages/rendering/src/renderer/SelectiveBloom.ts",
    reason: "explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (2); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (device.kind !== \"webgl2\" || !device.clearRenderTarget || v2Decline !== null || !postV2ModulesAvailable()) return \"backend-or-v2-unavailable\";",
      "if (!host) return \"backend-or-v2-unavailable\";",
      "// On the v2 HDR route before-tonemap is explicitly deferred until after",
    ]
  },
  {
    file: "packages/rendering/src/resources/RenderTargetPool.ts",
    reason: "deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Retired targets are unavailable for reuse but remain owned until disposal",
    ]
  },
  {
    file: "packages/rendering/src/ShaderFailures.ts",
    reason: "redaction fallback text used when an error message or cause cannot be read safely",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "rawLog = \"Shader failure (details unavailable)\";",
    ]
  },
  {
    file: "packages/rendering/src/shadows/Prd02DepthShaderLibrary.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1); historical note recording that a former stub/placeholder was removed or replaced by the real path (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// C-11 feature registration + real resolver (\"provide real for the stub\")",
      "* Real C-11 resolution (supersedes the PR-0a stub for the PRD-02 depth path):",
    ]
  },
  {
    file: "packages/rendering/src/shadows/SpecializedDepthShader.ts",
    reason: "internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* off-screen placeholder and the same flag. This avoids emitting non-finite",
    ]
  },
  {
    file: "packages/rendering/src/TerrainTiles.ts",
    reason: "legacy throwing stub kept for one minor version; it throws with a replacement hint instead of doing nothing",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* geometry. Kept as a throwing stub for one minor version. Real world terrain",
    ]
  },
  {
    file: "packages/rendering/src/TexturedPBRMaterial.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* Test hook (PRD-04 P2-8): substitute the legacy-shader-source probe with a stub source",
    ]
  },
  {
    file: "packages/rendering/src/transparency/WeightedTransparency.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (3); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new Error(\"Weighted transparency device is unavailable.\");",
      "const why = `weighted target or pipeline unavailable: ${cause}`;",
      "if (device.disposed || device.contextLost) return \"device unavailable\";",
      "if (request.support?.floatBlend !== true || request.support?.depthTexture !== true || request.support?.shaderVariants !== true) return \"weighted blending, depth sampling, or shader variants unavailable\";",
    ]
  },
  {
    file: "packages/rendering/src/vfx/BlendFallback.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** Batch draws nothing this frame (multiply under the C-04 stub). */",
    ]
  },
  {
    file: "packages/rendering/src/vfx/contributors.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Legacy generator (C-04 stub) → parity-mode slots; real C-02 → v2 slots.",
      "* (the stub reports false → VOLUMETRIC_DEPTH_PENDING, analytic fog covers",
    ]
  },
  {
    file: "packages/rendering/src/vfx/DecalPass.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// `multiply` for grime — under the C-04 stub multiply is emulated as",
      "`prd07.decals: multiply blend emulated as alpha-over (black at 1−luminance) for page \"${geometry.pageKey}\" under the C-04 stub`",
    ]
  },
  {
    file: "packages/rendering/src/vfx/MeshParticlePass.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// C-02 stub ambient: constant-term only (u_sh9[0] drives a3dSampleIrradianceSH).",
    ]
  },
  {
    file: "packages/rendering/src/vfx/ParticleBatchPass.ts",
    reason: "C-04 named-blend fallback: on a backend without named blends, blendMode lowers to alpha-over per the §6.2.7 table and is reported once per key",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (this.frameDepth.pendingNote === \"SOFT_DEPTH_PENDING\") this.note(\"SOFT_DEPTH_PENDING\", null, \"scene depth is the C-01 stub; soft particles are off\");",
      "if (id) this.note(res.degraded, null, `batch \"${batch.key}\" blend \"${String(batch.desc.blend)}\" emulated under the C-04 stub`);",
      "// C-04 is still a stub on every shipping backend: `blendMode` is ignored",
    ]
  },
  {
    file: "packages/rendering/src/vfx/SceneDepthAdapter.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Returns the real depth source when PRD 01 provides it; while the stub reports",
    ]
  },
  {
    file: "packages/rendering/src/vfx/shaders/decal.glsl.ts",
    reason: "C-04 named-blend fallback: multiply grime blend emulated as alpha-over where named blends are absent (documented degradation)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// a stub). Angle fade + distance fade are folded into alpha per §6.9.",
      "// stub as alpha-over with black at 1 − luminance (VFX_BLEND_FALLBACK).",
      "/** Multiply grime blend → C-04-stub alpha-over emulation. */",
      "? `// C-04 stub: multiply grime → alpha-over with black at 1−luminance.",
    ]
  },
  {
    file: "packages/rendering/src/vfx/shaders/mesh-particle.glsl.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "uniform vec4 u_sh9[9];   // A3DSH9 — a3dSampleIrradianceSH convention (C-02 stub: L0 only)",
      "// C-02 stub shape: L0 band only until the prd02 sh9 chunk is real.",
    ]
  },
  {
    file: "packages/rendering/src/vfx/shaders/particle.glsl.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "readonly blendAdditiveFallback: boolean; // additive emulated under alpha-over (C-04 stub)",
    ]
  },
  {
    file: "packages/rendering/src/VolumeRenderer.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!this.resources) throw new Error(\"VolumeRenderer: device resources are unavailable.\");",
      "throw new Error(\"VolumeRenderer: device texture allocation is unavailable.\");",
      "if (!this.host) throw new Error(\"VolumeRenderer: device texture retirement host is unavailable.\");",
      "if (!Number.isInteger(limit) || limit < 1) throw new Error(\"VolumeRenderer: WebGL2 MAX_3D_TEXTURE_SIZE is unavailable.\");",
    ]
  },
  {
    file: "packages/rendering/src/VolumetricFog.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* needs scene depth; when the caller knows it's unavailable it should keep",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/BatchExecutionCapability.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "export type WebGLBatchUnavailable = \"native-attestation-unavailable\";",
      "return \"native-attestation-unavailable\";",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/LegacyPost.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (2); documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided (1); warned fallback or diagnostic that reports the missing capability instead of faking success (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* OutputPass stub): single tonemap operator + sRGB encode. `exposure`",
      "* The deferred `post/v2Entry` module bag (import()ed by the async path —",
      ": host.device.beginSrgbOutputFallbackScope(\"Display-P3 is unavailable for the encoded postprocess tail\");",
      "// The present declined the hook (no HDR bloom reached it): the deferred",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/MultiDraw.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (typeof this.host.gl.frontFace !== \"function\" && winding !== \"ccw\") throw new RenderDeviceError(\"Front-face winding is unavailable\", \"UNSUPPORTED_RENDER_STATE\");",
      "if (typeof this.host.gl.blendColor !== \"function\" && blendConstant.some((channel) => channel !== 0)) throw new RenderDeviceError(\"Blend constant is unavailable\", \"UNSUPPORTED_RENDER_STATE\");",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/Probe.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"WebGL2 float readback failed or its source became unavailable\", \"WEBGL_FLOAT_READBACK_FAILED\", { error });",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/ScalarVolumeHost.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "return unsupported(\"Scalar volume frame device is unavailable or stale\", \"SCALAR_VOLUME_FRAME_STALE\");",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/TextureFormats.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// slot keeps serving the () => null stub so `resolveCompressedTextureFormat`",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/TextureResidencyAdapter.ts",
    reason: "warned fallback or diagnostic that reports the missing capability instead of faking success (1); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "readonly mode: \"placeholder\" | \"compressed\" | \"fallback\" | \"uncompressed\";",
      "allocation = { handle, texture, generation: this.epoch, bytes, release, mode: \"placeholder\", invalid: false };",
      "// Queue every live name; an unavailable fence remains charged until loss.",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/TextureUpload.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// An unavailable loss query is not evidence that native work finished.",
      "// A depth-only color placeholder and a target invalidated by context",
    ]
  },
  {
    file: "packages/rendering/src/WebGL2Device.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (4); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (3); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (2); warned fallback or diagnostic that reports the missing capability instead of faking success (1); internal placeholder object/value (never displayed, submitted or reported as real output) used during construction, reflection, ID allocation or a pending load (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* MAX_TEXTURE_SIZE of the canvas's WebGL2 context (4096 when unavailable).",
      "if (zeroToOne) throw new RenderDeviceError(\"EXT_clip_control is unavailable for a zero-to-one depth convention\", \"INVALID_DEPTH_CONVENTION\");",
      "finish(new RenderDeviceError(\"WebGL2 fence completion APIs are unavailable\", \"GPU_COMPLETION_UNAVAILABLE\"));",
      "if (requested !== \"srgb\") fallbackReason = \"Drawing buffer color-space selection is unavailable\";",
      "try { this.gl.deleteShader(vertex); } catch { /* context already unavailable */ }",
      "try { this.gl.deleteShader(fragment); } catch { /* context already unavailable */ }",
      "try { this.gl.deleteProgram(linkedProgram); } catch { /* context already unavailable */ }",
      "throw new RenderDeviceError(\"Storage buffers are unavailable on WebGL2\", \"UNSUPPORTED_BUFFER_USAGE\", { usage });",
      "throw new RenderDeviceError(\"WebGL sampler limits are unavailable\", \"WEBGL_PORTABLE_RESOURCE_LIMIT\");",
      "// Depth-only targets keep a placeholder Texture in `colorTexture`; give it a",
      "// A deferred retirement callback may fail after its initial action left",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/DeferredPipeline.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (22); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (1); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (1); fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "/** A single-sample output view, including when deferred MSAA is enabled. */",
      "/** Optional shared attachments, used only by the deferred pipeline. */",
      "/** Permit an explicitly reported forward path when an optional path is unavailable. */",
      "/** Deferred raster sample count; output is resolved to the single-sample surface. */",
      "readonly requested: \"deferred\" | \"meshlet\" | \"visibility\";",
      "readonly active: \"deferred\" | \"meshlet\" | \"visibility\" | \"forward\";",
      "// represented in this bounded deferred material format.",
      "if (!allowPhysical) fail(`materials[${index}].shading`, \"physical materials require the deferred renderer\");",
      "// The deferred geometry pass consumes alpha as scratch only after the",
      "if (prepared.usesPhysical && (dfgCoefficients().byteLength > maxBuffer || dfgCoefficients().byteLength > maxStorage)) throw new RenderDeviceError(\"Physical deferred DFG data exceeds device storage limits\", \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\", { field: \"maxStorageBufferBindingSize\" });",
      "if (!fence || typeof fence.then !== \"function\") throw new Error(\"Native drawing queue completion is unavailable\");",
      "this.fallbackReason = `deferred requires 3 color attachments and 24 bytes/sample (device: ${attachments}, ${bytes})`;",
      "if (!options.allowFallback || this.sampleCount !== 1) throw new RenderDeviceError(this.sampleCount !== 1 ? `${this.fallbackReason}; multisampled native forward fallback is unavailable` : this.fallbackReason, \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\", { field: \"maxColorAttachments\" });",
      "return { label: depthFormat === \"depth32float\" ? \"aura-deferred-geometry\" : \"aura-deferred-shared-depth-geometry\", layout: \"auto\", vertex: { module, entryPoint: \"vertexMain\", buffers: NATIVE_VERTEX_LAYOUT }, fragment: { module, entryPoint: \"fragmentMain\", targets: [{ format: \"rgba16float\" }, { format: \"rgba16float\" }, { format: \"rgba16float\" }] }, primitive: { topology: \"triangle-list\", cullMode: \"back\" }, depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: \"less-equal\" }, multisample: { count: this.sampleCount } };",
      "const label = kind === \"basic\" ? \"aura-deferred-resolve\" : kind === \"probe\" ? \"aura-deferred-probe-resolve\" : \"aura-deferred-physical-resolve\";",
      "/** @internal Rasterize a meshlet owner's indirect draws into borrowed deferred attachments. */",
      "throw new RenderDeviceError(\"Deferred meshlets require device-owned shared attachments\", \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\", { field: \"deferredAttachments\" });",
      "if (frame.deferredAttachments) throw new RenderDeviceError(\"The native forward fallback cannot preserve shared deferred attachments\", \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\", { field: \"deferredAttachments\" });",
      "const result = this.fallback.render(frame); return { requested: \"deferred\", active: \"forward\", fallbackReason: this.fallbackReason, drawCalls: result.draws, triangles: result.triangles };",
      "if (probeInput && !shared) throw new RenderDeviceError(\"A deferred environment probe requires a device-owned submission lease\", \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\", { field: \"physical.probe\" });",
      "throw new RenderDeviceError(\"Physical deferred drawing exceeds sampled texture, uniform or binding limits\", \"NATIVE_DRAW_CAPABILITY_UNAVAILABLE\", { field: \"physical\" });",
      "probeBuffer = this.device.createBuffer({ label: \"aura-deferred-probe\", size: probe.uniforms.byteLength, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });",
      "const encoder = this.device.createCommandEncoder({ label: \"aura-deferred\" });",
      ": { requested: \"deferred\", active: \"deferred\", drawCalls: (prepared.triangleCount ? 1 : 0) + 1, triangles: prepared.triangleCount };",
      "if (!Number.isFinite(divisor) || divisor === 0) fail(\"viewProjection\", \"must be invertible for physical deferred drawing\");",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/DeferredProbe.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(`Deferred probe ${field} ${message}`, \"NATIVE_DRAW_INVALID_INPUT\", { field });",
      "* Convert the result of packA3DEnvironmentUniforms into a deferred input. The",
      "// Padding never participates in the forward or deferred evaluation.",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/MeshletPipeline.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (12); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "let deferred: DeferredPipeline | undefined = await DeferredPipeline.createWarmed(",
      "owner.sharedDeferred.set(sharedDeferred.sampleCount, deferred);",
      "deferred = undefined;",
      "deferred?.dispose();",
      "if (sampleCount !== 1 && sampleCount !== 4) invalid(\"sampleCount\", \"must be 1 or 4 for shared deferred attachments\");",
      "let deferred = this.sharedDeferred.get(sampleCount);",
      "if (!deferred) {",
      "deferred = this.sharedDeferred.get(sampleCount);",
      "deferred = candidate;",
      "try { candidate.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], \"Meshlet deferred pipeline creation and cleanup failed\", { cause: error }); }",
      "return deferred.renderMeshlets(frame, prepared => {",
      "for (const deferred of this.sharedDeferred.values()) deferred.visitNativeRetirementOwners(visit);",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/NativeGpuSort.ts",
    reason: "comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "catch { return \"unavailable error\"; }",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/NativePointQuads.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (2); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!proof || !proof.ready) throw new RenderDeviceError(\"Point quad lease is unavailable\", \"WEBGPU_POINT_QUAD_PROOF_INVALID\");",
      "* must keep its buffers private and must not alter them, encode deferred work",
      "begin: () => { this.arena.assertOpen(); if (this.state !== \"uploaded\") throw new RenderDeviceError(\"Point quad lease is unavailable\", \"WEBGPU_POINT_QUAD_LEASE_STATE\"); this.submissionPins += 1; },",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/ResourceInterop.ts",
    reason: "deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (5); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "state: \"requesting\" | \"waiting\" | \"unavailable\" | \"failed\" | \"passed\";",
      "* Retired leases whose fence is still being requested, is unavailable, or",
      "fence.state = \"unavailable\";",
      "} else if (!this.invalidated && (record?.fence?.state === \"failed\" || record?.fence?.state === \"unavailable\")) {",
      "if (!this.invalidated && (record.fence?.state === \"failed\" || record.fence?.state === \"unavailable\")) {",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/ScalarVolumePass.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "throw new RenderDeviceError(\"Scalar volume frame device is unavailable or stale\", \"SCALAR_VOLUME_FRAME_STALE\");",
      "throw new RenderDeviceError(\"Scalar volume device or generation is unavailable\", \"SCALAR_VOLUME_FRAME_STALE\");",
    ]
  },
  {
    file: "packages/rendering/src/webgpu/VisibilityBufferPipeline.ts",
    reason: "'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// Preserve the deferred geometry pass's normal-derivative roughness AA,",
      "* Match the bounded deferred physical/probe resolve, but fetch the material by",
    ]
  },
  {
    file: "packages/rendering/src/WebGPUDevice.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent (42); 'deferred' names a real mechanism (deferred drawing path, deferred promise/load/queue/module chunk), not missing work (15); deferred GPU resource retirement behind a completion fence (a real lifecycle mechanism; a failed or unavailable fence keeps the resource pending) (8); warned fallback or diagnostic that reports the missing capability instead of faking success (3); comment documenting the fail-closed or fallback behaviour when a capability (storage, pointer capture, crypto, timer query, context) is unavailable (2); explicit capability-status value or reason ('unavailable') reported to callers and diagnostics (1)",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!handle) throw new RenderDeviceError(\"Native buffer handle is unavailable\", \"WEBGPU_BUFFER_UNAVAILABLE\", { bufferId: buffer.id });",
      "throw new RenderDeviceError(\"Required WebGPU features are unavailable\", \"WEBGPU_FEATURES_UNAVAILABLE\", { missingFeatures });",
      "if (missingLimits.length) throw new RenderDeviceError(\"Required WebGPU limits are unavailable\", \"WEBGPU_LIMITS_UNAVAILABLE\", { missingLimits });",
      "if (!canvasContext.unconfigure) throw new Error(\"WebGPU canvas unconfiguration is unavailable\");",
      "if (!this.device.createTexture || !this.device.queue.writeTexture) throw new RenderDeviceError(\"Texture streaming uploads are unavailable\", \"WEBGPU_RESIDENCY_UNAVAILABLE\");",
      "throw new Error(\"WebGPU canvas unconfiguration is unavailable\");",
      "if (!target.nativeView) throw new RenderDeviceError(\"Point raster target is unavailable\", \"WEBGPU_POINT_VIEWPORT_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"Point raster canvas is unavailable\", \"WEBGPU_POINT_VIEWPORT_UNAVAILABLE\");",
      "// A failed or unavailable fence is not a release: the lease (and this",
      "if (!this.canvasContext) return this.colorNegotiation = { requested, active: \"srgb\", supported: [\"srgb\"], ...(requested === \"display-p3\" ? { fallbackReason: \"Canvas context is unavailable\" } : {}) };",
      "if (previous === null) return restoreSrgb(\"Canvas color-space configuration is unavailable\");",
      "if (this.activeColorSpace !== \"srgb\" || !this.canvasColorUsable) return restoreSrgb(\"Canvas color-space configuration is unavailable\");",
      "return this.colorNegotiation = { requested, active: \"srgb\", supported: supported(), fallbackReason: \"Canvas color-space configuration is unavailable\" };",
      "if (!this.canvasColorUsable) throw new RenderDeviceError(\"Canvas color configuration is unavailable\", \"WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED\");",
      "throw new RenderDeviceError(\"A verified Display-P3 canvas is unavailable\", \"WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED\");",
      "catch { this.canvasColorUsable = false; this.displayP3Verified = false; throw new RenderDeviceError(\"Display-P3 canvas configuration is unavailable\", \"WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED\"); }",
      "throw new RenderDeviceError(\"Canvas color configuration is unavailable\", \"WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED\");",
      "throw new RenderDeviceError(\"Display-P3 canvas texture is unavailable or incompatible\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "if (!view) throw new RenderDeviceError(\"Display-P3 canvas view is unavailable\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "\"Display-P3 requires a confirmed opaque unorm canvas and a supported output pass or HDR tone route; offscreen P3, direct scene output, preserved alpha and additional post combinations are unavailable.\",",
      "// Internal deferred work may sample this same depth attachment; a",
      "if (view === null || view === undefined) throw new RenderDeviceError(\"WebGPU MRT texture view is unavailable\", \"WEBGPU_MRT_UNAVAILABLE\");",
      "if (multisampleView === null || multisampleView === undefined) throw new RenderDeviceError(\"WebGPU MRT multisample texture view is unavailable\", \"WEBGPU_MRT_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"WebGPU MRT target became unavailable or aliased during allocation\", \"WEBGPU_MRT_ATTACHMENT_ALIAS\");",
      "if (!encoder.copyTextureToTexture) throw new RenderDeviceError(\"WebGPU texture-region copy is unavailable\", \"WEBGPU_COPY_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"WebGPU Gaussian splat scratch is unavailable\", \"GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE\");",
      "if (!view) throw new RenderDeviceError(\"Canvas surface is unavailable\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "/** Frame-scoped HDR color/depth attachment lease for a native deferred pass. */",
      "if (owned.nativeExtraColors.length) throw new RenderDeviceError(\"Deferred single-color surfaces cannot represent MRT targets\", \"WEBGPU_MRT_SURFACE_UNSUPPORTED\");",
      "if (this.activeRenderTarget !== owned) throw new RenderDeviceError(\"Deferred surface must be the active target\", \"WEBGPU_DEFERRED_SURFACE_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"Deferred surface requires an HDR color target\", \"WEBGPU_DEFERRED_SURFACE_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"Deferred surface requires native color and depth attachments\", \"WEBGPU_DEFERRED_SURFACE_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"Deferred surface lease is stale\", \"WEBGPU_DEFERRED_SURFACE_STALE\");",
      "if (!Array.isArray(commands) || commands.length === 0) throw new RenderDeviceError(\"Deferred surface needs a command buffer\", \"WEBGPU_DEFERRED_SURFACE_INVALID\");",
      "throw new RenderDeviceError(\"Deferred input cannot alias its output attachments\", \"WEBGPU_DEFERRED_SURFACE_INVALID\");",
      "/** Borrow an uploaded cube probe; submit its resource as a deferred read. */",
      "throw new RenderDeviceError(\"Deferred probe requires a live sampled linear cube texture\", \"WEBGPU_DEFERRED_PROBE_INVALID\");",
      "throw new RenderDeviceError(\"Deferred float32 probe filtering requires float32-filterable\", \"WEBGPU_FLOAT32_FILTERABLE_REQUIRED\");",
      "if (!this.device.createSampler) throw new RenderDeviceError(\"Deferred probe sampler is unavailable\", \"WEBGPU_DEFERRED_PROBE_UNAVAILABLE\");",
      "if (texture.disposed) throw new RenderDeviceError(\"Deferred probe texture is disposed\", \"DISPOSED_RESOURCE\");",
      "throw new RenderDeviceError(\"Canvas surface is unavailable\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "if (!canvas || canvasOwners.get(canvas) !== this.canvasOwner) throw new RenderDeviceError(\"WebGPU canvas surface is unavailable\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "throw new RenderDeviceError(\"Canvas texture is unavailable, incompatible or aliases a device-owned resource\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "if (!canvasView) throw new RenderDeviceError(\"WebGPU canvas view is unavailable\", \"WEBGPU_SURFACE_UNAVAILABLE\");",
      "if (!native) throw new RenderDeviceError(\"Native readback source is unavailable\", \"NATIVE_READBACK_TARGET_MISSING\");",
      "if (!encoder.copyTextureToTexture) throw new RenderDeviceError(\"WebGPU texture copy is unavailable\", \"WEBGPU_COPY_UNAVAILABLE\");",
      "const deferred = [...this.#pointDeferredRetirements];",
      "for (const handle of deferred) this.retireNative(handle);",
      "throw new RenderDeviceError(\"Display-P3 color resolve is unavailable or stale\", \"WEBGPU_P3_SOURCE_UNSUPPORTED\");",
      "if (!this.canvasContext) return false; // Preserve the existing canvas-unavailable diagnostic.",
      "throw new RenderDeviceError(\"Native post frame ownership is unavailable\", \"POSTPROCESS_HISTORY_FRAME_BUSY\");",
      "if (!owned.nativeTexture || !owned.nativeView || owned.colorTexture.disposed) throw new RenderDeviceError(\"Native depth-of-field target is unavailable\", \"WEBGPU_DOF_TARGET_UNSUPPORTED\");",
      "(args.sampler && !this.device.createSampler)) throw new RenderDeviceError(\"Native depth-of-field layouts are unavailable\", \"WEBGPU_DOF_HOST_UNAVAILABLE\");",
      "const deferred = [...this.#mrtDeferredRetirements];",
      "for (const resource of deferred) this.retireNative(resource);",
      "if (!bindLayout) throw new RenderDeviceError(\"Native depth-of-field bind layout is unavailable\", \"WEBGPU_DOF_HOST_UNAVAILABLE\");",
      "if (!texture || texture.disposed || !native || !view || texture.format !== \"rgba8\") throw new RenderDeviceError(\"Native depth coverage attachment is unavailable\", \"WEBGPU_DOF_TARGET_UNSUPPORTED\");",
      "* Returns null when disabled, missing WGSL, or requesting unavailable inputs;",
      "if (!this.renderTargets.has(target)) throw new RenderDeviceError(\"Render target is unavailable\", \"FOREIGN_RESOURCE\", { targetId: target.id });",
      "if (failures.length) throw new AggregateError(failures, \"Failed to retire deferred WebGPU bundle resources\");",
      "if (!texture) throw new RenderDeviceError(\"Generated PBR clustered light texture is unavailable\", \"WEBGPU_CLUSTER_LIGHTING_INVALID\");",
      "if (!pipeline.getBindGroupLayout || !this.device.createBindGroup) throw new RenderDeviceError(\"Storage bind groups are unavailable\", \"WEBGPU_STORAGE_BINDING_UNAVAILABLE\");",
      "if (binding.sampler.mirror) throw new RenderDeviceError(\"Mirror-once sampler addressing is unavailable on WebGPU\", \"WEBGPU_SAMPLER_MIRROR_UNSUPPORTED\", { label: texture.label });",
      "* deferred clear. The caller must still submit with the resource interop",
      "if (!target || !native) throw new RenderDeviceError(\"Render-target texture is unavailable\", \"WEBGPU_TEXTURE_UNAVAILABLE\", { label: texture.label });",
      "if (!native) throw new RenderDeviceError(\"Render-target texture is unavailable\", \"WEBGPU_TEXTURE_UNAVAILABLE\", { label: texture.label });",
      "throw new RenderDeviceError(\"Portable texture binding is unavailable\", \"WEBGPU_TEXTURE_BINDING_REQUIRED\", { binding: descriptor.name });",
      "// WGSL fallback (it is a real packed-depth shader, not a flat-colour stub).",
    ]
  },
  {
    file: "packages/rendering/src/world/shared/shaders/worldLightFallback.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* While `generateProgram` throws `PROGRAM_GENERATOR_PENDING` (C-02 stub),",
      "* light, SH sky irradiance (C-09 stub), sky-horizon env specular, linear fog",
      "* (C-21 stub), and `a3dSunShadowAt` = 1.0 (C-11 stub). Every Path S frame is",
      "uniform vec4 u_shIrradiance[9];    // C-09 SH9 stub coefficients (.xyz; vec4: the device rejects 27-float arrays)",
      "uniform vec3 u_fogColor;           // C-21 linear fog (stub)",
      "// C-09 SH9 stub irradiance (constant-term approximation on Path S).",
      "// C-11 stub: no shadow maps until PRD 02 is real.",
      "// C-21 stub fog: linear in [near, far].",
    ]
  },
  {
    file: "packages/rendering/src/world/vegetation/shaders/foliage.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "// alpha test (Path S, where the C-15 stub ignores alphaToCoverage).",
    ]
  },
  {
    file: "packages/rendering/src/world/water/WaterMaterial.ts",
    reason: "documented contract-seam fallback (C-xx / PR 0a slot): the inert or legacy surface used only while the owning lane provider is absent or its A3D_QR_* flag is off; the real implementation replaces it when provided",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "* (env specular / sun GGX / shadow stub / linear fog) into `ShaderSources`",
      ": a3dWorldEnvSpecular(R, 0.03);   // mode 0 env; mode 1 SSR arrives via C-13 (stub = env)",
    ]
  },
  {
    file: "packages/scene/src/TransformNodeInternals.ts",
    reason: "fail-closed capability refusal: throws or returns a typed error when a host API, backend feature or required binding is absent",
    expires: EXPIRES,
    reviewer: REVIEWER,
    markers: [
      "if (!access) throw new Error(\"Transform transaction access is unavailable.\");",
    ]
  },
  {
    file: "packages/assets/src/vite/auraPhysics.ts",
    reason: "5.2.0 physics on demand (lane 519): describes the stripped-build stub that replaces the Rapier init module and fails closed with the typed PHYSICS_BACKEND_MISSING error; a real, documented build mode, not an unimplemented feature",
    expires: EXPIRES,
    reviewer: "agent (release 5.2.0 lane 519 merge, 2026-11-07)",
    markers: [
      "*   initialisation module (`#aura3d/rapier-init`) replaced by a stub without a Rapier import, so no Rapier chunk is",
      "*   emitted. The stub's entry points throw the typed PHYSICS_BACKEND_MISSING error with {@link PHYSICS_STRIPPED_MESSAGE}.",
      "/** Source of the stub that replaces the Rapier initialisation module in a stripped build (no Rapier import). */",
    ]
  },
  {
    file: "packages/engine/src/agent-api/app/createAuraAppCore.ts",
    reason: "5.2.0 physics on demand (lane 519): the preview physics bridge is created when the opt-in on-demand backend finishes loading; describes real deferred loading, not a missing feature",
    expires: EXPIRES,
    reviewer: "agent (release 5.2.0 lane 519 merge, 2026-11-07)",
    markers: [
      "/** The preview bridge for headless / canvas-2D mounts; deferred (created on load) while on-demand physics is loading. */",
    ]
  },
  {
    file: "packages/engine/src/agent-api/physics/onDemandPhysics.ts",
    reason: "5.2.0 physics on demand (lane 519): app.physics before the opt-in backend load fails closed with the typed PHYSICS_NOT_READY error (await app.physics.ready?.()); deferred bodies are replayed on load",
    expires: EXPIRES,
    reviewer: "agent (release 5.2.0 lane 519 merge, 2026-11-07)",
    markers: [
      "/** True once the backend has loaded and the deferred declared bodies were created. */",
      "const unavailable = (member: string): Error => {",
      "return () => { throw unavailable(`${name}.${key}()`); };",
      "return () => { throw unavailable(`${key}()`); };",
    ]
  },
  {
    file: "packages/rendering/src/webgl2/LegacyPost.ts",
    reason: "5.2.1 P3 safe fallback: a Display-P3 request on a post chain without an OutputPass route opens the sRGB fallback scope and records this fallbackReason instead of failing the mount; describes a real fallback, not a missing feature",
    expires: EXPIRES,
    reviewer: "agent (release 5.2.1 safety lane, 2026-11-08)",
    markers: [
      "if (!p3TailFallback) tailOutputScope = host.device.beginSrgbOutputFallbackScope(\"Display-P3 is unavailable for this post chain\");",
    ]
  },
];

export const runtimeEdgeAllowlistMarkers: readonly string[] = runtimeEdgeAllowlist.flatMap((group) =>
  group.markers.map((marker) => `${group.file}:${marker}`)
);
