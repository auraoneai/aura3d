import { Geometry, VertexBuffer, VertexFormat, IndexBuffer, PBRMaterial, Renderer, type RenderItem, type RenderSource } from '../../packages/rendering/src/index';
import { DirectionalLight, PointLight, SpotLight, PerspectiveCamera, type Light } from '../../packages/scene/src/index';

type V = readonly [number, number, number];
const width=640, height=480;
const norm=(v:V):V=>{const n=Math.hypot(...v);return [v[0]/n,v[1]/n,v[2]/n];};
const cross=(a:V,b:V):V=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:V,b:V)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const box=(scale:V,p:V)=>new Float32Array([scale[0],0,0,0,0,scale[1],0,0,0,0,scale[2],0,...p,1]);
/** Fixed oracle established before running: mean absolute attenuation change on
 * world-locked receiver samples, <= .03. Pixel coordinates are reprojected each
 * frame; same-camera unshadowed pixels divide out intended illumination motion.
 * No analytic cascade selection is included in the rendered metric. */
export async function runShadowStability301(durationMs=60_000) {
  if(durationMs<60_000) throw new Error('P02 needs sixty actual seconds');
  const canvas=document.createElement('canvas'); canvas.width=width;canvas.height=height;document.body.replaceChildren(canvas);
  const renderer=await Renderer.create({canvas,width,height,backend:'webgl2',preserveDrawingBuffer:true,clearColor:[.03,.04,.06,1],requiredFeatures:['basic-rendering','pixel-readback','render-targets']});
  const floor=new PBRMaterial({name:'p02-receiver',baseColor:[.65,.65,.65,1],roughness:1,metallic:0,environmentIntensity:.1});
  const caster=new PBRMaterial({name:'p02-caster',baseColor:[.9,.04,.02,1],roughness:1,metallic:0});
  const calibrationCaster=new PBRMaterial({
    name:'p02-calibration-shadow-only',baseColor:[.9,.04,.02,1],roughness:1,metallic:0,
    // The physical comb remains a normal renderer shadow caster, but it must
    // not contaminate the retained color frames or occlude visible subjects.
    // This is the public render-state contract used by the forward pass; the
    // renderer-owned shadow passes deliberately use their own depth pipeline.
    renderState:{blend:false,depthWrite:false,cullMode:'none',colorWrite:[false,false,false,false]}
  });
  const geometry=Geometry.litCube(1);
  const items:RenderItem[]=[{label:'receiver',geometry,material:floor,modelMatrix:box([30,.1,30],[0,-.05,0]),castShadow:false},
    ...[-3,0,3].map(x=>({label:`caster-${x}`,geometry,material:caster,modelMatrix:box([.7,2,.7],[x,1,0])}))];
  // A physical slat comb puts many shadow edges across the receiver. Three
  // isolated posts cover too little of the fixed grid to discriminate aliasing:
  // even relocating their complete shadow averages below the .03 oracle.
  // Offset the elevated comb along the nominal light ray [4,8,5]. Its
  // directional shadow stays centered on the grid, while the camera on the
  // opposite z side sees the receiver underneath instead of looking through
  // sixty red slats. Real visible geometry still participates in both renders.
  // Keep the calibration comb on the same light-to-receiver ray, but close to
  // the light and above the complete moving-camera frustum. At height 5 the
  // comb entered the top edge of retained review frames even though its alpha
  // was zero: shadow casters must remain opaque in the depth pass, so alpha
  // blending cannot make one item both shadow-visible and color-invisible.
  // Moving along the ray preserves the directional projection onto the fixed
  // receiver oracle without introducing a test-only shadow-caster path.
  const combHeight=7.25,combOffsetX=combHeight*4/8,combOffsetZ=combHeight*5/8;
  const slatCount=60,vertices=new VertexBuffer(VertexFormat.P3N3,slatCount*geometry.vertexBuffer.vertexCount),indices:number[]=[];
  for(let slat=0;slat<slatCount;slat++){
    const offset=slat*geometry.vertexBuffer.vertexCount;
    for(let vertex=0;vertex<geometry.vertexBuffer.vertexCount;vertex++){
      const p=geometry.vertexBuffer.getAttribute(vertex,'position');
      vertices.setAttribute(offset+vertex,'position',[p[0]!*.07-5.9+slat*.2+combOffsetX,p[1]!*.08+combHeight,p[2]!*10+combOffsetZ]);
      vertices.setAttribute(offset+vertex,'normal',geometry.vertexBuffer.getAttribute(vertex,'normal'));
    }
    for(const index of geometry.indexBuffer!.data)indices.push(offset+index);
  }
  const slatGeometry=new Geometry(vertices,new IndexBuffer(indices,vertices.vertexCount));
  items.push({label:'physical-shadow-slat-comb',geometry:slatGeometry,material:calibrationCaster,modelMatrix:box([1,1,1],[0,0,0])});
  const points:V[]=[];
  for(let x=-6;x<=6;x+=.2) for(let z=-4;z<=5;z+=.2) {
    if([-3,0,3].some(c=>Math.abs(x-c)<.6)&&Math.abs(z)<.6) continue;
    points.push([x,.001,z]);
  }
  const camera=new PerspectiveCamera({fovYRadians:Math.PI/4,aspect:width/height,near:.1,far:40});
  const lights={directional:new DirectionalLight('p02-directional'),spot:new SpotLight('p02-spot'),point:new PointLight('p02-point')};
  lights.spot.range=50;lights.spot.angle=Math.PI/3;lights.point.range=50;
  // First-cycle diagnostic only: retain native GL values after actual uploads.
  // This distinguishes configured intent from an omitted/stale GPU binding.
  const nativeUniforms:Record<string,unknown>[]=[];
  let inspectNativeUniforms=true;
  const nativeDraw=renderer.device.draw.bind(renderer.device);
  renderer.device.draw=(command)=>{
    nativeDraw(command);
    if(!inspectNativeUniforms||command.label!=='receiver')return;
    const gl=(renderer.device as unknown as {gl:WebGL2RenderingContext}).gl;
    const program=gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram|null;
    if(!program)return;
    const values:Record<string,unknown>={};
    for(const name of ['u_shadowMapEnabled','u_shadowMapBias','u_shadowMapSlopeBias','u_shadowMapStrength','u_shadowMapMatrix','u_shadowMapTexelSize','u_shadowMapTexture','u_lightCount','u_lightData[0]','u_lightData[1]','u_lightData[2]','u_lightData[3]','u_spotShadowMapEnabled','u_pointShadowMapEnabled']){
      const location=gl.getUniformLocation(program,name);
      const value=location?gl.getUniform(program,location):null;
      values[name]=ArrayBuffer.isView(value)?Array.from(value as unknown as ArrayLike<number>):value;
    }
    nativeUniforms.push(values);
  };
  const modes=['directional','spot','point','snappingDisabled','jitteredLight'] as const;
  type Mode=typeof modes[number];
  const previous=new Map<Mode,(number|null)[]>();
  type Sample={lightIntensity:number;shadowBias:number;shadowSlopeBias:number;atMs:number;frameId:number;shimmerScore:number;receiverSamples:number;shadowedSamples:number;attenuation:(number|null)[];eye:V;shadow:Readonly<Record<string,unknown>>;drawCalls:number;litDrawCalls:number};
  const sequences:Record<string,Sample[]>={};for(const m of modes)sequences[m]=[];
  let frameId=0, readbackMs=0; const start=performance.now();
  const mean=(values:number[])=>values.reduce((a,b)=>a+b,0)/Math.max(1,values.length);
  const samplePixels=(pixels:Uint8Array,eye:V,target:V):(number|null)[]=>{
    const forward=norm(sub(target,eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward),tan=Math.tan(Math.PI/8);
    return points.map(p=>{const d=sub(p,eye),depth=dot(d,forward);if(depth<=0)return null;
      const x=(dot(d,right)/(depth*tan*width/height)+1)*width/2-.5;
      const y=(dot(d,up)/(depth*tan)+1)*height/2-.5;
      if(x<1||y<1||x>=width-2||y>=height-2)return null;
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      const lum=(px:number,py:number)=>{const i=(py*width+px)*4;const r=pixels[i]!,g=pixels[i+1]!,b=pixels[i+2]!;
        return r>g*1.3&&r>b*1.3?NaN:(r+g+b)/3;};
      const v=lum(ix,iy)*(1-fx)*(1-fy)+lum(ix+1,iy)*fx*(1-fy)+lum(ix,iy+1)*(1-fx)*fy+lum(ix+1,iy+1)*fx*fy;
      return Number.isFinite(v)?v:null;
    });
  };
  const images:Array<{atMs:number;frameId:number;png:string}>=[];
  let iteration=0;
  try {
    while(true){
      await new Promise<void>(r=>requestAnimationFrame(()=>r()));
      if(document.visibilityState!=='visible')throw new Error('Shadow stress lost foreground');
      const elapsed=performance.now()-start,phase=elapsed/1000;
      const eye:V=[Math.sin(phase*.7)*.5,7,-10-5*Math.sin(phase*.3)],target:V=[0,0,0];
      const forward=norm(sub(target,eye)),cameraRight=norm(cross(forward,[0,1,0])),cameraUp=cross(cameraRight,forward);
      camera.transform.setLocalMatrix([...cameraRight,0,...cameraUp,0,-forward[0],-forward[1],-forward[2],0,...eye,1]);
      camera.updateCameraMatrices();
      for(const mode of modes){
        const kind=mode==='point'?'point':mode==='spot'?'spot':'directional';
        const light:Light=lights[kind];const jitter=mode==='jitteredLight'?Math.sin(iteration*2.4)*.5:0;
        const position:V=[4+jitter*4,8,5];const dir=norm(sub([jitter,0,0],position));
        const right=norm(cross(dir,[0,1,0])),up=cross(right,dir);
        light.transform.setLocalMatrix([right[0],right[1],right[2],0,up[0],up[1],up[2],0,-dir[0],-dir[1],-dir[2],0,...position,1]);light.updateWorldTransform();light.castsShadow=true;
        // Directional intensity is irradiance; point/spot intensity attenuates
        // by inverse squared distance. Match 3 units at the origin receiver,
        // instead of an effectively unlit 3-candela lamp ten metres away.
        const lightIntensity=kind==='directional'?3:3*dot(position,position);
        light.intensity=lightIntensity;
        const input: RenderSource={renderItems:items,collectedLights:[{kind,color:[1,1,1] as V,intensity:lightIntensity,position,direction:dir,range:50,spotAngle:Math.PI/3,penumbra:.1,castsShadow:true,layerMask:0xffffffff,source:light}],cameraPolicy:'require' as const};
        const litDiag=renderer.render({...input,shadow:false},camera);frameId++;
        let t=performance.now();const lit=samplePixels(renderer.device.readPixels(0,0,width,height),eye,target);readbackMs+=performance.now()-t;
        const litPng=iteration===0?canvas.toDataURL('image/png'):undefined;
        // Spot/point use perspective depth (near=.01, far=50). At this
        // scene's ~10m receiver, a 2m occluder separates depth by only .00025.
        // An orthographic .001 bias plus the default slope scale erases it.
        // Keep the receiver oracle fixed; use projection-appropriate depth
        // offsets for both perspective light families, identical in all frames.
        const perspectiveShadow=kind!=='directional';
        const shadowBias=perspectiveShadow ? .000001 : .001;
        const shadowSlopeBias=perspectiveShadow ? .001 : 1;
        const diag=renderer.render({...input,shadow:{light,size:512,bias:shadowBias,slopeBias:shadowSlopeBias,pcfSamples:16,pcfRadius:1.5,strength:.8,filter:'pcf',cascadeCount:kind==='directional'?4:undefined,stabilize:mode!=='snappingDisabled'}},camera);frameId++;
        t=performance.now();const dark=samplePixels(renderer.device.readPixels(0,0,width,height),eye,target);readbackMs+=performance.now()-t;
        const attenuation=lit.map((v,i)=>v!==null&&v>30&&dark[i]!==null?Math.max(0,1-dark[i]!/v):null);
        const before=previous.get(mode);const deltas:number[]=[];
        if(before)attenuation.forEach((v,i)=>{if(v!==null&&before[i]!=null)deltas.push(Math.abs(v-before[i]!));});
        const active=attenuation.filter((v):v is number=>v!==null&&v>.03).length;
        const shadow=renderer.getShadowEvidence();
        if(iteration===0 || active<20) {
          (window as unknown as {__shadow301Probe:unknown}).__shadow301Probe={mode,eye,target,lit, dark,attenuation,active,nativeUniforms,lightIntensity,shadowBias,shadowSlopeBias,shadow,litDiag,diag,viewProjection:Array.from(camera.viewProjectionMatrix),litPng,darkPng:canvas.toDataURL('image/png')};
        }
        if(active<20){
          const gl=(renderer.device as unknown as {gl:WebGL2RenderingContext}).gl;
          const oldProgram=gl.getParameter(gl.CURRENT_PROGRAM),oldFramebuffer=gl.getParameter(gl.FRAMEBUFFER_BINDING),oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldActive=gl.getParameter(gl.ACTIVE_TEXTURE);
          const location=gl.getUniformLocation(oldProgram,'u_shadowMapTexture');
          if(!location)throw new Error('Missing actual shadow sampler location');
          const unit=gl.getUniform(oldProgram,location);
          gl.activeTexture(gl.TEXTURE0+unit);const shadowTexture=gl.getParameter(gl.TEXTURE_BINDING_2D);
          const program=gl.createProgram()!,vao=gl.createVertexArray(),fbo=gl.createFramebuffer(),texture=gl.createTexture();
          const shaders:WebGLShader[]=[];
          try{
            if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Depth diagnostic requires float color target');
            for(const [type,source] of [[gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}'],[gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform highp sampler2D shadow;out vec4 color;void main(){float d=texelFetch(shadow,ivec2(gl_FragCoord.xy),0).r;color=vec4(d,0,0,1);}']] as const){
              const shader=gl.createShader(type)!;gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)!);gl.attachShader(program,shader);shaders.push(shader);
            }
            gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)!);
            gl.activeTexture(gl.TEXTURE0+15);const prior15=gl.getParameter(gl.TEXTURE_BINDING_2D);
            gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,512,512,0,gl.RGBA,gl.FLOAT,null);
            gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
            if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Depth diagnostic framebuffer incomplete');
            gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'shadow'),unit);gl.bindVertexArray(vao);gl.viewport(0,0,512,512);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.drawArrays(gl.TRIANGLES,0,3);
            const values=new Float32Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.FLOAT,values);
            let minimum=1,maximum=0,covered=0;for(let i=0;i<values.length;i+=4){minimum=Math.min(minimum,values[i]!);maximum=Math.max(maximum,values[i]!);if(values[i]!<1)covered++;}
            const matrix=shadow!.lightMatrix as number[];
            const receivers=points.map(point=>{const w=matrix[3]!*point[0]+matrix[7]!*point[1]+matrix[11]!*point[2]+matrix[15]!;const projected=[0,1,2].map(row=>(matrix[row]!*point[0]+matrix[row+4]!*point[1]+matrix[row+8]!*point[2]+matrix[row+12]!)/w);const x=Math.floor((projected[0]!*.5+.5)*512),y=Math.floor((projected[1]!*.5+.5)*512);return {point,x,y,depth:projected[2]!*.5+.5,stored:x>=0&&y>=0&&x<512&&y<512?values[(y*512+x)*4]:null};});
            Object.assign((window as unknown as {__shadow301Probe:object}).__shadow301Probe,{depthDiagnostic:{minimum,maximum,covered,receivers,texturePresent:!!shadowTexture,glError:gl.getError()}});
            gl.bindTexture(gl.TEXTURE_2D,prior15);
          }catch(error){Object.assign((window as unknown as {__shadow301Probe:object}).__shadow301Probe,{depthDiagnosticError:String(error)});}
          finally{gl.bindFramebuffer(gl.FRAMEBUFFER,oldFramebuffer);gl.useProgram(oldProgram);gl.bindVertexArray(oldVAO);gl.activeTexture(oldActive);for(const shader of shaders)gl.deleteShader(shader);gl.deleteProgram(program);gl.deleteVertexArray(vao);gl.deleteFramebuffer(fbo);gl.deleteTexture(texture);}
          throw new Error(`${mode}: no measured shadow on receiver (${active})`);
        }
        if(before&&deltas.length<200)throw new Error(`${mode}: insufficient reprojected receiver overlap (${deltas.length}; need 200)`);
        if(!shadow)throw new Error('Missing actual shadow resource witness');
        if(kind==='directional'&&(shadow.cascades as unknown[]).length!==4)throw new Error('Actual cascades absent');
        if(kind==='point'&&(shadow.pointFaceRects as unknown[]).length!==24)throw new Error('Actual point atlas absent');
        sequences[mode]!.push({lightIntensity,shadowBias,shadowSlopeBias,atMs:performance.now()-start,frameId,shimmerScore:mean(deltas),receiverSamples:deltas.length,shadowedSamples:active,attenuation,eye,shadow,drawCalls:diag.drawCalls,litDrawCalls:litDiag.drawCalls});
        if(mode==='directional' && (images.length===0 || performance.now()-start-images.at(-1)!.atMs>=15_000)) images.push({atMs:performance.now()-start,frameId,png:canvas.toDataURL('image/png')});
        previous.set(mode,attenuation);
      }
      inspectNativeUniforms=false;
      iteration++;
      // Each light has its own actual completion timestamp; variable render
      // cost must not shorten spot/point/control windows below sixty seconds.
      if(modes.every(mode=>{
        const series=sequences[mode]!;
        return series.at(-1)!.atMs-series[0]!.atMs>=durationMs;
      }))break;
      // Sample no faster than 2 Hz. Report the actual minimum sampling rate below;
      // GPU/readback work is part of elapsed time, never simulated path time.
      const delay=start+iteration*500-performance.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));
    }
    const samples=sequences.directional!.map((s,i)=>({...s,shimmerScore:Math.max(...['directional','spot','point'].map(k=>Number(sequences[k]![i]!.shimmerScore)))}));
    const gaps=samples.slice(1).map((s,i)=>Number(s.atMs)-Number(samples[i]!.atMs));
    return {schema:'muse301-shadows/v1',samples,threshold:.03,controls:{snappingDisabledScore:mean(sequences.snappingDisabled!.slice(1).map(s=>Number(s.shimmerScore))),jitteredLightScore:mean(sequences.jitteredLight!.slice(1).map(s=>Number(s.shimmerScore)))},oracle:'Fixed world receiver grid 0.2m, bilinear projected RGB; attenuation=1-shadow/lit, mean absolute temporal delta; fixed threshold .03 established before run; 512px PCF16; same scene/camera/time for paired controls',samplingHz:1000/Math.max(...gaps),lightTypes:['spot','point','directional'],sequences,images,renderedFrames:frameId,readbackMs,width,height,backend:renderer.device.kind,adapter:renderer.device.info.renderer};
  } finally {renderer.dispose();calibrationCaster.dispose();slatGeometry.vertexBuffer.dispose();slatGeometry.indexBuffer?.dispose();geometry.vertexBuffer.dispose();geometry.indexBuffer?.dispose();}
}
(window as unknown as {runShadowStability301:typeof runShadowStability301}).runShadowStability301=runShadowStability301;
