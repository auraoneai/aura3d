import { ShaderMaterialThreeCompat } from "@aura3d/rendering";
document.body.dataset.a3dExample = `three-compat-shader-lab:${new ShaderMaterialThreeCompat("void main(){}", "precision highp float; out vec4 fragColor; void main(){fragColor=vec4(1.0);}").diagnose().pass}`;
