import { Renderer, type RenderSource } from "/packages/rendering/src/Renderer.js";
import { Geometry } from "/packages/rendering/src/Geometry.js";
import { VertexFormat } from "/packages/rendering/src/VertexFormat.js";
import { VertexBuffer } from "/packages/rendering/src/VertexBuffer.js";
import { IndexBuffer } from "/packages/rendering/src/IndexBuffer.js";
import { TextureBinding } from "/packages/rendering/src/TextureBinding.js";
import { Texture } from "/packages/rendering/src/Texture.js";
import { Sampler } from "/packages/rendering/src/Sampler.js";
import { TexturedPBRMaterial } from "/packages/rendering/src/TexturedPBRMaterial.js";
import { createExtensionScalarAtlas } from "/packages/rendering/src/ExtensionScalarAtlas.js";
import { createDefaultShaderLibrary, DEFAULT_TEXTURED_PBR_SHADER_NAME } from "/packages/rendering/src/ShaderLibrary.js";

const SIZE=128;
const slots=["clearcoat","clearcoatRoughness","clearcoatNormal","sheenColor","sheenRoughness","anisotropy","iridescence","iridescenceThickness"] as const;
const scalarSlots=["clearcoat","clearcoatRoughness","sheenRoughness","iridescence","iridescenceThickness"] as const;
const identity=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const projection=new Float32Array(identity);projection[10]=-1;
const sampler=new Sampler({minFilter:"linear-mipmap-linear",magFilter:"linear",addressU:"repeat",addressV:"mirror-repeat",maxAnisotropy:8});
const result:any={status:"waiting",scope:"rendering native WebGPU; not createAuraApp",frames:[],metrics:[],errors:[]};
(window as any).__AURA_WEBGPU_ATLAS_301__=result;
function sphere(color=true, uv1=true, tint=false):Geometry {
  const attributes:any[]=[{semantic:"position",components:3,offset:0},{semantic:"normal",components:3,offset:12},{semantic:"uv",components:2,offset:24},{semantic:"tangent",components:4,offset:32}];
  let stride=48;if(color){attributes.push({semantic:"color",components:4,offset:stride});stride+=16;}if(uv1){attributes.push({semantic:"uv1",components:2,offset:stride});stride+=8;}
  const vertices=new VertexBuffer(new VertexFormat(attributes,stride),33*17);const indices:number[]=[];
  for(let y=0;y<=16;y++)for(let x=0;x<=32;x++){
    const u=x/32,v=y/16,theta=u*Math.PI*2,phi=v*Math.PI;const n=[Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta)];const i=y*33+x;
    vertices.setAttribute(i,"position",n.map(a=>a*.78));vertices.setAttribute(i,"normal",n);vertices.setAttribute(i,"uv",[u,v]);vertices.setAttribute(i,"tangent",[-Math.sin(theta),0,Math.cos(theta),1]);
    if(color)vertices.setAttribute(i,"color",tint?[.15,1,.25,1]:[1,1,1,1]);if(uv1)vertices.setAttribute(i,"uv1",[v*.7+.13,u*.6+.21]);
    if(y<16&&x<32){const a=i,b=i+1,c=i+33,d=i+34;indices.push(a,c,b,b,c,d);}
  }
  return new Geometry(vertices,new IndexBuffer(indices,33*17));
}
function pixels(swapped=false){const width=17,height=9,data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;const r=x<8?25:235,g=y<4?55:205;data.set(swapped?[g,r,220-(x%3)*55,255-(y%3)*90]:[r,g,35+(x%3)*80,20+(y%3)*105],i);}return{width,height,data};}
function decoyPixels(slot:string){const image=pixels();const active:Record<string,number[]>={clearcoat:[0],clearcoatRoughness:[1],clearcoatNormal:[0,1,2],sheenColor:[0,1,2],sheenRoughness:[3],anisotropy:[0,1,2],iridescence:[0],iridescenceThickness:[1]};for(let i=0;i<image.data.length;i++)if(!active[slot]!.includes(i%4))image.data[i]=255-image.data[i]!;return image;}
function delta(a:Uint8Array,b:Uint8Array){let sum=0,changed=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a[i+c]!-b[i+c]!);sum+=d;if(d>3)changed++;}return{changed,mean:sum/(SIZE*SIZE*3)};}
function retain(id:string,data:Uint8Array){let raw="";for(const byte of data)raw+=String.fromCharCode(byte);result.frames.push({id,width:SIZE,height:SIZE,pixelsBase64:btoa(raw)});}
async function run(){
  result.status="running";const renderer=await Renderer.create({backend:"webgpu",width:SIZE,height:SIZE,clearColor:[.015,.02,.03,1]});const device:any=renderer.device;
  // Test-only native module substitution exposes intermediate GPU values. It is
  // never used by the acceptance matrix and does not change production shaders.
  const debug=new URLSearchParams(location.search).get("debug");
  const environmentRegression=new URLSearchParams(location.search).has("environment-regression");
  const native=(device as any).device;
  const createModule=native.createShaderModule.bind(native);
  const writeBuffer=native.queue.writeBuffer.bind(native.queue);
  let currentId="";result.uniformUploads=[];result.drawUniformUploads=[];result.debug=debug;
  native.queue.writeBuffer=(buffer:any,offset:number,data:any,...rest:any[])=>{
    if(buffer.label==="extension-atlas-uniforms"){
      const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
      result.uniformUploads.push({id:currentId,values:Array.from(new Float32Array(bytes.slice().buffer))});
    }
    if(environmentRegression && buffer.label?.endsWith("-draw-uniforms")){
      const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
      const values=new Float32Array(bytes.slice().buffer);
      result.drawUniformUploads.push({id:currentId,environmentEnabled:values[27],diffuseIntensity:values[23],specularIntensity:values[31]});
    }
    return writeBuffer(buffer,offset,data,...rest);
  };
  if(debug){
    const expressions:Record<string,string>={
      "film-mask":"vec3<f32>(filmMask)",
      "thickness":"vec3<f32>(thickness/650.0)",
      "fresnel-difference":"vec3<f32>(0.5)+5.0*(atlasThinFilm(substrateF0,u_atlas.iridescence.z,thickness,vdh)-fresnelSchlick(vdh,substrateF0))",
      "ggx-visibility":"vec3<f32>(ggxDistribution(ndh,substrateRoughness)*ggxVisibilitySmithCorrelated(ndv,ndl,substrateRoughness)*0.1)",
      "raw-film":"vec3<f32>(0.5)+filmDirect*50.0",
      "normal-dot-products":"vec3<f32>(ndl,ndv,ndh)"
    };
    if(!expressions[debug])throw new Error("Unknown atlas diagnostic output");
    native.createShaderModule=(descriptor:any)=>{
      if(!descriptor.code.includes("fn atlasExtensionLighting"))return createModule(descriptor);
      const original=descriptor.code;let code=original.replace(/return \(direct\+environment\*\(coat\*0\.04\+sheen\*pow\(1\.0-ndv,5\.0\)\+filmEnvironment\)\)\*u_atlas\.factors\.z;/,`return ${expressions[debug]};`);
      code=code.replace("if (materialAlpha < u_draw.material.x) { discard; }", "");
      code=code.replace("return vec4<f32>(encodePbrOutput(linearColor), outputAlpha);","return vec4<f32>(atlasExtensionLighting(normal,tangentFrame,viewDirection,lightDirection,uv,uv1,shadow,environmentSpecularContribution,f0,roughness),1.0);");
      if(code===original||!code.includes(`return ${expressions[debug]};`))throw new Error("Native atlas diagnostic substitution did not match production shader");
      return createModule({...descriptor,code});
    };
  }
  const target=device.createRenderTarget({width:SIZE,height:SIZE,format:"rgba8",label:"r04-native-atlas"});const geometries=[sphere(),sphere(false,false),sphere(true,true,true)];
  try{
    result.backend=device.kind;result.adapter=device.info;const compilationErrors:any[]=[];
    async function render(id:string,disabled?:string,swap?:string,uvSlot?:string,transformSlot?:string,geometry=geometries[0],decoy?:string,zeroFilm=false,environmentStrength=1){
      currentId=id;const resources:Texture[]=[];const options:any={baseColor:[.35,.28,.22,1],metallic:.15,roughness:.32,clearcoatFactor:1,clearcoatRoughnessFactor:.7,clearcoatNormalScale:1,sheenColorFactor:[.65,.25,.4],sheenRoughnessFactor:.65,anisotropyStrength:.85,iridescenceFactor:1,iridescenceIor:1.4,iridescenceThicknessMinimum:90,iridescenceThicknessMaximum:650,emissiveColor:[.01,.005,.002],environmentIntensity:.12,renderState:{cullMode:"none"}};
      if(environmentRegression){
        // F0=0 with LUT(A=1,B=0) is an exact zero substrate IBL oracle.
        // A dielectric film over that substrate must still reflect environment.
        const environment=new Texture({width:1,height:1,data:new Uint8Array([255,255,255,255]),colorSpace:"linear"});
        const brdf=new Texture({width:1,height:1,data:new Uint8Array([255,0,0,255]),colorSpace:"linear"});
        resources.push(environment,brdf);
        Object.assign(options,{ior:1,metallic:0,clearcoatFactor:0,sheenColorFactor:[0,0,0],anisotropyStrength:0,emissiveColor:[0,0,0],environmentIntensity:0,
          environmentMapTexture:new TextureBinding({name:"u_environmentMapTexture",texture:environment}),environmentMapIntensity:0,environmentMapSpecularIntensity:environmentStrength,
          environmentBrdfLutTexture:new TextureBinding({name:"u_environmentBrdfLutTexture",texture:brdf})});
      }
      if(zeroFilm)options.iridescenceFactor=0;
      const input:any={};for(const slot of scalarSlots)input[slot]=decoy===slot?decoyPixels(slot):pixels(swap===slot);
      options.extensionScalarAtlas=createExtensionScalarAtlas(input);resources.push(options.extensionScalarAtlas.texture);
      for(const slot of ["baseColor","normal","metallicRoughness","occlusion","emissive",...slots]){
        if(disabled===slot)continue;
        const data=decoy===slot?decoyPixels(slot):pixels(swap===slot);if(slot==="normal")for(let i=0;i<data.data.length;i+=4)data.data.set([128,128,255,255],i);
        const texture=new Texture({...data,colorSpace:slot==="baseColor"||slot==="sheenColor"||slot==="emissive"?"srgb":"linear"});resources.push(texture);options[`${slot}Texture`]=texture;options[`${slot}Sampler`]=sampler;
        if(uvSlot===slot)options.textureTexCoords={[slot]:1};if(transformSlot===slot)options[`${slot}TextureTransform`]={offset:[.23,.37],scale:[1.7,.6],rotation:.5};
      }
      const material=new TexturedPBRMaterial(options);
      try{
        if(id==="all") {
          const variant = material.shaderVariant;
          if (!variant) throw new Error("Native extension atlas material did not select a shader variant");
          compilationErrors.push(...await device.getShaderCompilationDiagnostics(createDefaultShaderLibrary().compileVariant(DEFAULT_TEXTURED_PBR_SHADER_NAME, variant)));
        }
        if(!geometry)throw new Error("Atlas regression geometry is missing");
        const source:RenderSource={renderItems:[{geometry,material,modelMatrix:identity,modelViewProjectionMatrix:projection,label:"r04-native-atlas-sphere"}],renderTarget:target,cameraPosition:[0,0,3],cameraPolicy:"identity",
          ...(environmentRegression?{environmentLighting:{color:[0,0,0],intensity:0,environmentMapTexture:options.environmentMapTexture,environmentMapIntensity:0,environmentMapSpecularIntensity:environmentStrength,environmentMapEncoding:"linear",environmentBrdfLutTexture:options.environmentBrdfLutTexture}}:{})};
        renderer.render(source);
        device.setRenderTarget(target);const image=await device.readPixelsAsync(0,0,SIZE,SIZE);retain(id,image);return image;
      }finally{material.dispose();for(const texture of resources)texture.dispose();}
    }
    const baseline=await render("all");
    if(environmentRegression){
      const noEnvironment=await render("film-no-environment",undefined,undefined,undefined,undefined,geometries[0],undefined,false,0);
      const noFilm=await render("no-film-environment",undefined,undefined,undefined,undefined,geometries[0],undefined,true,1);
      const neither=await render("no-film-no-environment",undefined,undefined,undefined,undefined,geometries[0],undefined,true,0);
      result.environmentRegression={film:delta(baseline,noEnvironment),zeroSubstrate:delta(noFilm,neither)};
      result.compilation=compilationErrors;result.errors.push(...await device.drainWebGPUPostErrors());result.status="ready";return;
    }

    if(debug){
      const disabled=await render("iridescence-disabled","iridescence");
      const thicknessUv=await render("thickness-uv1",undefined,undefined,"iridescenceThickness");
      const intensityUv=await render("iridescence-uv1",undefined,undefined,"iridescence");
      const thicknessSwap=await render("thickness-swapped",undefined,"iridescenceThickness");
      const thicknessTransform=await render("thickness-transform",undefined,undefined,undefined,"iridescenceThickness");
      result.metrics.push({mode:"iridescence-disabled",...delta(baseline,disabled)},{mode:"thickness-uv1",...delta(baseline,thicknessUv)},
        {mode:"iridescence-uv1",...delta(baseline,intensityUv)}, {mode:"thickness-swapped",...delta(baseline,thicknessSwap)},
        {mode:"thickness-transform",...delta(baseline,thicknessTransform)});
      result.compilation=compilationErrors;result.errors.push(...await device.drainWebGPUPostErrors());result.status="ready";return;
    }
    for(const slot of slots){for(const mode of ["disabled","swapped","uv1","transform","decoy"]){const image=await render(`${slot}-${mode}`,mode==="disabled"?slot:undefined,mode==="swapped"?slot:undefined,mode==="uv1"?slot:undefined,mode==="transform"?slot:undefined,geometries[0],mode==="decoy"?slot:undefined);result.metrics.push({slot,mode,...delta(baseline,image)});}}
    const zeroA=await render("zero-film-baseline",undefined,undefined,undefined,undefined,geometries[0],undefined,true);
    const zeroB=await render("zero-film-swapped-intensity",undefined,"iridescence",undefined,undefined,geometries[0],undefined,true);
    const zeroC=await render("zero-film-swapped-thickness",undefined,"iridescenceThickness",undefined,undefined,geometries[0],undefined,true);
    result.zeroFilm={intensity:delta(zeroA,zeroB),thickness:delta(zeroA,zeroC)};
    const noAttributes=await render("missing-optional-attributes",undefined,undefined,undefined,undefined,geometries[1]);result.missingAttributes=delta(baseline,noAttributes);
    const tinted=await render("vertex-color",undefined,undefined,undefined,undefined,geometries[2]);result.vertexColor=delta(baseline,tinted);
    result.compilation=compilationErrors;result.diagnostics=device.getDiagnostics();result.errors.push(...await device.drainWebGPUPostErrors());result.status="ready";
  }finally{target.dispose();for(const geometry of geometries)geometry.dispose();renderer.dispose();}
}
document.querySelector("#run")!.addEventListener("click",()=>{void run().catch(error=>{result.status="error";result.errors.push(error.stack??String(error));}).finally(()=>{document.querySelector("#status")!.textContent=JSON.stringify({...result,frames:result.frames.map((f:any)=>f.id)},null,2);});},{once:true});
