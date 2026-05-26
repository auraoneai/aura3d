#version 300 es
// @aura3d-shader:production-pbr-frag-v1
precision highp float;
in vec3 vNormal;
out vec4 fragColor;
const float PI = 3.14159265359;
float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}
vec3 fresnelSchlick(vec3 f0, float vDotH) {
  return f0 + (vec3(1.0) - f0) * pow(saturate(1.0 - vDotH), 5.0);
}
float distributionGGX(float nDotH, float roughness) {
  float alpha = max(roughness, 0.045);
  alpha *= alpha;
  float alpha2 = alpha * alpha;
  float denom = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
  return alpha2 / max(PI * denom * denom, 0.00001);
}
float geometrySmith(float nDotV, float nDotL, float roughness) {
  float k = pow(roughness + 1.0, 2.0) / 8.0;
  float gv = nDotV / max(nDotV * (1.0 - k) + k, 0.00001);
  float gl = nDotL / max(nDotL * (1.0 - k) + k, 0.00001);
  return gv * gl;
}
vec3 evaluatePBR(vec3 baseColor, float metallic, float roughness, vec3 normal) {
  vec3 N = normalize(normal);
  vec3 V = normalize(vec3(0.0, 0.18, 1.0));
  vec3 L = normalize(vec3(0.34, 0.72, 0.6));
  vec3 H = normalize(V + L);
  float nDotL = saturate(dot(N, L));
  float nDotV = max(saturate(dot(N, V)), 0.00001);
  float nDotH = saturate(dot(N, H));
  float vDotH = saturate(dot(V, H));
  vec3 f0 = mix(vec3(0.04), baseColor, metallic);
  vec3 F = fresnelSchlick(f0, vDotH);
  float D = distributionGGX(nDotH, roughness);
  float G = geometrySmith(nDotV, nDotL, roughness);
  vec3 specular = D * G * F / max(4.0 * nDotV * nDotL, 0.00001);
  vec3 diffuse = (vec3(1.0) - F) * (1.0 - metallic) * baseColor / PI;
  vec3 ambient = baseColor * mix(vec3(0.04, 0.045, 0.055), vec3(0.18, 0.22, 0.3), saturate(N.y * 0.5 + 0.5));
  return ambient + (diffuse + specular) * nDotL * 3.0;
}
void main() {
  vec3 color = evaluatePBR(vec3(0.86, 0.88, 0.9), 0.0, 0.38, vNormal);
  fragColor = vec4(pow(clamp(color, vec3(0.0), vec3(1.0)), vec3(1.0 / 2.2)), 1.0);
}
