# A3D Product Configurator

Real production app for product visualization. It loads imported GLB assets from the production corpus, binds a real HDR environment, renders through the public `@aura3d/engine/production-runtime` SDK (`loadGltfScene`, `loadHdrEnvironment`, `createProductViewer`), exposes `window.__a3dV6Runtime` as a legacy compatibility probe, and supports a configuration interaction without using Three.js as the product runtime.
