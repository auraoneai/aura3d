import type { Material } from "../../../packages/rendering/src/Material";
import type { MaterialBinding, MaterialBindingResult } from "../../../packages/rendering/src/MaterialBinding";
import type { RenderShaderProgram, UniformValue } from "../../../packages/rendering/src/RenderDevice";

/** Compile-only compatibility contract for existing flat and opt-in recursive consumers. */
export function checkMaterialBindingTypes(binding: MaterialBinding, material: Material, shader: RenderShaderProgram): void {
  const flat: MaterialBindingResult<UniformValue> = binding.bind(material, shader);
  const uniforms: ReadonlyMap<string, UniformValue> = flat.uniforms;
  const recursive = binding.bindRecursive(material, shader);
  // @ts-expect-error Recursive values must be narrowed before use as flat uniforms.
  const unsafe: MaterialBindingResult<UniformValue> = recursive;
  void uniforms;
  void unsafe;
}
