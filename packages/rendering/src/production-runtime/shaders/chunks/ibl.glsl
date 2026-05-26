// @aura3d-shader:production-ibl-v1
vec3 sampleIBLDiffuse(vec3 normal) { return vec3(0.6, 0.65, 0.7) * (0.5 + 0.5 * normal.y); }
vec3 sampleIBLSpecular(vec3 reflection, float roughness) { return mix(vec3(1.0), vec3(0.25), roughness) * max(reflection.y * 0.5 + 0.5, 0.0); }
