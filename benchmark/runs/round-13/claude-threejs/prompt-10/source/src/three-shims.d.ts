// Three.js 0.165.0 ships no bundled TypeScript declarations and no @types/three
// is provided by the fixed benchmark scaffold. These ambient module shims let the
// strict `tsc --noEmit` typecheck pass while we drive the runtime APIs directly.
declare module 'three';
declare module 'three/addons/controls/OrbitControls.js';
declare module 'three/addons/loaders/GLTFLoader.js';
declare module 'three/addons/environments/RoomEnvironment.js';
