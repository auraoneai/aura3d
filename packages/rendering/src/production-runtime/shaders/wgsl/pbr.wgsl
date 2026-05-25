struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) normal: vec3<f32> };
@fragment fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> { return vec4<f32>(abs(input.normal), 1.0); }
