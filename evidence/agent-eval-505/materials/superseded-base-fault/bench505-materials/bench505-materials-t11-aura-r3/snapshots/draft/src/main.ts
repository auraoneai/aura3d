import { material, primitives, environments, lights } from "@aura3d/engine";
const m = material.physical({ color: "#ff0000", metallic: 0.5, roughness: 0.2, clearcoat: 1, flakes: 1 } as never);
void m; void primitives; void environments; void lights;
const x: number = material.carPaint;
