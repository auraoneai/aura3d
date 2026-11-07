import { material } from "@aura3d/engine";
const a = material.fabric({ color: "#6e0f1c", sheen: 1, sheenColor: "#ff5060", sheenRoughness: 0.4, proceduralTexture: material.proceduralTexture("fabric", { scale: 40 }) });
const b = material.physical({ color: "#fff", transmission: 1, thickness: 1, ior: 1.5, roughness: 0.02, opacity: 0.3, transparent: true, anisotropy: 0.8, anisotropyRotation: 0 });
console.log(a, b, Object.keys(material.proceduralTextures));
