# Assets

The asset package is responsible for loading, validating, caching, and converting external data into runtime resources. Current evidence is strongest around glTF/GLB loading, texture validation, material metadata, and render-resource creation.

## Loader Boundary

Loaders should reject malformed or unsupported input with explicit diagnostics. They should not silently reinterpret invalid glTF data as partial success.

`GLTFLoader` owns glTF parsing and validation. `createGLTFRenderResources(...)` bridges validated asset data into renderer geometry, material, and texture resources.

## Decoder Boundary

Compression extensions such as Meshopt, Draco, WebP, and KTX2/BasisU require decoder, transcoder, or upload paths. Meshopt and Draco are external decoder hooks, while KTX2/BasisU has a bounded loaders.gl-backed render-resource transcode path. Docs and templates must still describe limits instead of implying full compatibility.

## Cache Boundary

The asset manager may cache loaded dependencies and retry failed loads, but apps still own release timing for long-lived views, editor previews, and product configurators.

## Current Limits

The pinned corpus is a starter corpus, not a complete compatibility matrix. Multi-UV render resources, decoder-enabled Meshopt corpus runs, and broad production texture-transcoding corpus coverage remain known limits.
