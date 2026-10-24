import { framecmp } from "./framecmp-lib";

framecmp([
  { slug: "silt-and-signal", hook: "__AURA_SILT__", query: "?manual=1&chapter=0&objective=1", repeatLoads: 6, steps: [
    { name: "rings", drive: `api.pose({ position: [138, 9, 42], target: [138, 5, 5], up: [0, 1, 0], fov: 62 }); api.render(); api.render();` }
  ] }
]);
