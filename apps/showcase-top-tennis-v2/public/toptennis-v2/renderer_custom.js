lt("WebGLRenderer.render: camera is not an instance of THREE.Camera.");
return}
if(I===!0)return;
P!==null&&P.renderStart(L,J);
let ae=Qe.enabled===!0&&Qe.isPresenting===!0,se=w!==null&&(G===null||ae)&&w.begin(R,G);
if(L.matrixWorldAutoUpdate===!0&&L.updateMatrixWorld(),J.parent===null&&J.matrixWorldAutoUpdate===!0&&J.updateMatrixWorld(),Qe.enabled===!0&&Qe.isPresenting===!0&&(w===null||w.isCompositing()===!1)&&(Qe.cameraAutoUpdate===!0&&Qe.updateCamera(J),J=Qe.getCamera()),L.isScene===!0&&L.onBeforeRender(R,L,J,G),v=Ee.get(L,_.length),v.init(J),v.state.textureUnits=X.getTextureUnits(),_.push(v),me.multiplyMatrices(J.projectionMatrix,J.matrixWorldInverse),le.setFromProjectionMatrix(me,xi,J.reversedDepth),pe=this.localClippingEnabled,he=_e.init(this.clippingPlanes,pe),y=Ae.get(L,E.length),y.init(),E.push(y),Qe.enabled===!0&&Qe.isPresenting===!0){
let $e=R.xr.getDepthSensingMesh();
$e!==null&&on($e,J,-1/0,R.sortObjects)}
on(L,J,0,R.sortObjects),y.finish(),P!==null&&P.updateLights(v.state.lightsArray),R.sortObjects===!0&&y.sort(j,de),te=Qe.enabled===!1||Qe.isPresenting===!1||Qe.hasDepthSensing()===!1,te&&Ke.addToRenderList(y,L),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),he===!0&&_e.beginShadows();
let re=v.state.shadowsArray;
if(He.render(re,L,J),he===!0&&_e.endShadows(),(se&&w.hasRenderPass())===!1){
let $e=y.opaque,Ve=y.transmissive;
if(v.setupLights(),J.isArrayCamera){
let et=J.cameras;
if(Ve.length>0)for(let it=0,xt=et.length;
it<xt;
it++){
let At=et[it];
bn($e,Ve,L,At)}
te&&Ke.render(L);
for(let it=0,xt=et.length;
it<xt;
it++){
let At=et[it];
hn(y,L,At,At.viewport)}
}
else Ve.length>0&&bn($e,Ve,L,J),te&&Ke.render(L),hn(y,L,J)}
G!==null&&D===0&&(X.updateMultisampleRenderTarget(G),X.updateRenderTargetMipmap(G)),se&&w.end(R),L.isScene===!0&&L.onAfterRender(R,L,J),ze.resetDefaultState(),H=-1,Y=null,_.pop(),_.length>0?(v=_[_.length-1],X.setTextureUnits(v.state.textureUnits),he===!0&&_e.setGlobalState(R.clippingPlanes,v.state.camera)):v=null,E.pop(),E.length>0?y=E[E.length-1]:y=null,P!==null&&P.renderEnd()}
;
function on(L,J,ae,se){
if(L.visible===!1)return;
if(L.layers.test(J.layers)){
if(L.isGroup)ae=L.renderOrder;
else if(L.isLOD)L.autoUpdate===!0&&L.update(J);
else if(L.isLightProbeGrid)v.pushLightProbeGrid(L);
else if(L.isLight)v.pushLight(L),L.castShadow&&v.pushShadow(L);
else if(L.isSprite){
if(!L.frustumCulled||L.intersectsFrustum(le)){
se&&Ue.setFromMatrixPosition(L.matrixWorld).applyMatrix4(me);
let $e=ee.update(L),Ve=L.material;
Ve.visible&&y.push(L,$e,Ve,ae,Ue.z,null,J)}
}
else if((L.isMesh||L.isLine||L.isPoints)&&(!L.frustumCulled||L.intersectsFrustum(le))){
let $e=ee.update(L),Ve=L.material;
if(se&&(L.boundingSphere!==void 0?(L.boundingSphere===null&&L.computeBoundingSphere(),Ue.copy(L.boundingSphere.center)):($e.boundingSphere===null&&$e.computeBoundingSphere(),Ue.copy($e.boundingSphere.center)),Ue.applyMatrix4(L.matrixWorld).applyMatrix4(me)),Array.isArray(Ve)){
let et=$e.groups;
for(let it=0,xt=et.length;
it<xt;
it++){
let At=et[it],tt=Ve[At.materialIndex];
tt&&tt.visible&&y.push(L,$e,tt,ae,Ue.z,At,J)}
}
else Ve.visible&&y.push(L,$e,Ve,ae,Ue.z,null,J)}
}
let Xe=L.children;
for(let $e=0,Ve=Xe.length;
$e<Ve;
$e++)on(Xe[$e],J,ae,se)}
function hn(L,J,ae,se){
let{
opaque:re,transmissive:Xe,transparent:$e}
=L;
v.setupLightsView(ae),he===!0&&_e.setGlobalState(R.clippingPlanes,ae),se&&S.viewport(q.copy(se)),re.length>0&&Zn(re,J,ae),Xe.length>0&&Zn(Xe,J,ae),$e.length>0&&Zn($e,J,ae),S.buffers.depth.setTest(!0),S.buffers.depth.setMask(!0),S.buffers.color.setMask(!0),S.setPolygonOffset(!1)}
function bn(L,J,ae,se){
if((ae.isScene===!0?ae.overrideMaterial:null)!==null)return;
if(v.state.transmissionRenderTarget[se.id]===void 0){
let tt=z.has("EXT_color_buffer_half_float")||z.has("EXT_color_buffer_float");
v.state.transmissionRenderTarget[se.id]=new kn(1,1,{
generateMipmaps:!0,type:tt?vi:Vn,minFilter:ps,samples:Math.max(4,A.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:Rt.workingColorSpace}
)}
let Xe=v.state.transmissionRenderTarget[se.id],$e=se.viewport||q;
Xe.setSize($e.z*R.transmissionResolutionScale,$e.w*R.transmissionResolutionScale);
let Ve=R.getRenderTarget(),et=R.getActiveCubeFace(),it=R.getActiveMipmapLevel();
R.setRenderTarget(Xe),R.getClearColor(Re),Ye=R.getClearAlpha(),Ye<1&&R.setClearColor(16777215,.5),R.clear(),te&&Ke.render(ae);
let xt=R.toneMapping;
R.toneMapping=_i;
let At=se.viewport;
if(se.viewport!==void 0&&(se.viewport=void 0),v.setupLightsView(se),he===!0&&_e.setGlobalState(R.clippingPlanes,se),Zn(L,ae,se),X.updateMultisampleRenderTarget(Xe),X.updateRenderTargetMipmap(Xe),z.has("WEBGL_multisampled_render_to_texture")===!1){
let tt=!1;
for(let Ft=0,an=J.length;
Ft<an;
Ft++){
let Zt=J[Ft],{
object:Vt,geometry:wn,material:Ze,group:Fn}
=Zt;
if(Ze.side===Tt&&Vt.layers.test(se.layers)){
let Dt=Ze.side;
Ze.side=zn,Ze.needsUpdate=!0,Tn(Vt,ae,se,wn,Ze,Fn),Ze.side=Dt,Ze.needsUpdate=!0,tt=!0}
}
tt===!0&&(X.updateMultisampleRenderTarget(Xe),X.updateRenderTargetMipmap(Xe))}
R.setRenderTarget(Ve,et,it),R.setClearColor(Re,Ye),At!==void 0&&(se.viewport=At),R.toneMapping=xt}
function Zn(L,J,ae){
let se=J.isScene===!0?J.overrideMaterial:null;
for(let re=0,Xe=L.length;
re<Xe;
re++){
let $e=L[re],{
object:Ve,geometry:et,group:it}
=$e,xt=$e.material;
xt.allowOverride===!0&&se!==null&&(xt=se),Ve.layers.test(ae.layers)&&Tn(Ve,J,ae,et,xt,it)}
}
function Tn(L,J,ae,se,re,Xe){
P!==null&&re.isNodeMaterial&&P.setObject(L,re),L.onBeforeRender(R,J,ae,se,re,Xe),L.modelViewMatrix.multiplyMatrices(ae.matrixWorldInverse,L.matrixWorld),L.normalMatrix.getNormalMatrix(L.modelViewMatrix),re.onBeforeRender(R,J,ae,se,L,Xe),re.transparent===!0&&re.side===Tt&&re.forceSinglePass===!1?(re.side=zn,re.needsUpdate=!0,R.renderBufferDirect(ae,J,se,re,L,Xe),re.side=ds,re.needsUpdate=!0,R.renderBufferDirect(ae,J,se,re,L,Xe),re.side=Tt):R.renderBufferDirect(ae,J,se,re,L,Xe),L.onAfterRender(R,J,ae,se,re,Xe)}
function Mn(L,J,ae){
J.isScene!==!0&&(J=ke);
let se=W.get(L),re=v.state.lights,Xe=v.state.shadowsArray,$e=re.state.version,Ve=ue.getParameters(L,re.state,Xe,J,ae,v.state.lightProbeGridArray),et=ue.getProgramCacheKey(Ve),it=se.programs;
se.environment=L.isMeshStandardMaterial||L.isMeshLambertMaterial||L.isMeshPhongMaterial?J.environment:null,se.fog=J.fog;
let xt=L.isMeshStandardMaterial||L.isMeshLambertMaterial&&!L.envMap||L.isMeshPhongMaterial&&!L.envMap;
se.envMap=$.get(L.envMap||se.environment,xt),se.envMapRotation=se.environment!==null&&L.envMap===null?J.environmentRotation:L.envMapRotation,it===void 0&&(L.addEventListener("dispose",Be),it=new Map,se.programs=it);
let At=it.get(et);
if(At!==void 0){
if(se.currentProgram===At&&se.lightsStateVersion===$e)return Us(L,Ve),At}
else Ve.uniforms=ue.getUniforms(L),P!==null&&L.isNodeMaterial&&P.build(L,ae,Ve),L.onBeforeCompile(Ve,R),At=ue.acquireProgram(Ve,et),it.set(et,At),se.uniforms=Ve.uniforms;
let tt=se.uniforms;
return(!L.isShaderMaterial&&!L.isRawShaderMaterial||L.clipping===!0)&&(tt.clippingPlanes=_e.uniform),Us(L,Ve),se.needsLights=$o(L),se.lightsStateVersion=$e,se.needsLights&&(tt.ambientLightColor.value=re.state.ambient,tt.lightProbe.value=re.state.probe,tt.sunLights.value=re.state.sun,tt.sunLightShadows.value=re.state.sunShadow,tt.directionalLights.value=re.state.directional,tt.directionalLightShadows.value=re.state.directionalShadow,tt.spotLights.value=re.state.spot,tt.spotLightShadows.value=re.state.spotShadow,tt.rectAreaLights.value=re.state.rectArea,tt.ltc_1.value=re.state.rectAreaLTC1,tt.ltc_2.value=re.state.rectAreaLTC2,tt.pointLights.value=re.state.point,tt.pointLightShadows.value=re.state.pointShadow,tt.hemisphereLights.value=re.state.hemi,tt.sunShadowMatrix.value=re.state.sunShadowMatrix,tt.sunShadowCascade.value=re.state.sunShadowCascade,tt.directionalShadowMatrix.value=re.state.directionalShadowMatrix,tt.spotLightMatrix.value=re.state.spotLightMatrix,tt.spotLightMap.value=re.state.spotLightMap,tt.pointShadowMatrix.value=re.state.pointShadowMatrix),se.lightProbeGrid=v.state.lightProbeGridArray.length>0,se.currentProgram=At,se.uniformsList=null,At}
function ji(L){
if(L.uniformsList===null){
let J=L.currentProgram.getUniforms();
L.uniformsList=Tr.seqWithValue(J.seq,L.uniforms)}
return L.uniformsList}
function Us(L,J){
let ae=W.get(L);
ae.outputColorSpace=J.outputColorSpace,ae.batching=J.batching,ae.batchingColor=J.batchingColor,ae.instancing=J.instancing,ae.instancingColor=J.instancingColor,ae.instancingMorph=J.instancingMorph,ae.skinning=J.skinning,ae.morphTargets=J.morphTargets,ae.morphNormals=J.morphNormals,ae.morphColors=J.morphColors,ae.morphTargetsCount=J.morphTargetsCount,ae.numClippingPlanes=J.numClippingPlanes,ae.numIntersection=J.numClipIntersection,ae.vertexAlphas=J.vertexAlphas,ae.vertexTangents=J.vertexTangents,ae.toneMapping=J.toneMapping}
function yc(L,J){
if(L.length===0)return null;
if(L.length===1)return L[0].texture!==null?L[0]:null;
d.setFromMatrixPosition(J.matrixWorld);
for(let ae=0,se=L.length;
ae<se;
ae++){
let re=L[ae];
if(re.texture!==null&&re.boundingBox.containsPoint(d))return re}
return null}
function Un(L,J,ae,se,re){
J.isScene!==!0&&(J=ke),X.resetTextureUnits();
let Xe=J.fog,$e=se.isMeshStandardMaterial||se.isMeshLambertMaterial||se.isMeshPhongMaterial?J.environment:null,Ve=G===null?R.outputColorSpace:G.isXRRenderTarget===!0?G.texture.colorSpace:Rt.workingColorSpace,et=se.isMeshStandardMaterial||se.isMeshLambertMaterial&&!se.envMap||se.isMeshPhongMaterial&&!se.envMap,it=$.get(se.envMap||$e,et),xt=se.vertexColors===!0&&!!ae.attributes.color&&ae.attributes.color.itemSize===4,At=!!ae.attributes.tangent&&(!!se.normalMap||se.anisotropy>0),tt=!!ae.morphAttributes.position,Ft=!!ae.morphAttributes.normal,an=!!ae.morphAttributes.color,Zt=_i;
se.toneMapped&&(G===null||G.isXRRenderTarget===!0)&&(Zt=R.toneMapping);
let Vt=ae.morphAttributes.position||ae.morphAttributes.normal||ae.morphAttributes.color,wn=Vt!==void 0?Vt.length:0,Ze=W.get(se),Fn=v.state.lights;
if(he===!0&&(pe===!0||L!==Y)){
let Yt=L===Y&&se.id===H;
_e.setState(se,L,Yt)}
let Dt=!1;
se.version===Ze.__version?(Ze.needsLights&&Ze.lightsStateVersion!==Fn.state.version||Ze.outputColorSpace!==Ve||re.isBatchedMesh&&Ze.batching===!1||!re.isBatchedMesh&&Ze.batching===!0||re.isBatchedMesh&&Ze.batchingColor===!0&&re._colorsTexture===null||re.isBatchedMesh&&Ze.batchingColor===!1&&re._colorsTexture!==null||re.isInstancedMesh&&Ze.instancing===!1||!re.isInstancedMesh&&Ze.instancing===!0||re.isSkinnedMesh&&Ze.skinning===!1||!re.isSkinnedMesh&&Ze.skinning===!0||re.isInstancedMesh&&Ze.instancingColor===!0&&re.instanceColor===null||re.isInstancedMesh&&Ze.instancingColor===!1&&re.instanceColor!==null||re.isInstancedMesh&&Ze.instancingMorph===!0&&re.morphTexture===null||re.isInstancedMesh&&Ze.instancingMorph===!1&&re.morphTexture!==null||Ze.envMap!==it||se.fog===!0&&Ze.fog!==Xe||Ze.numClippingPlanes!==void 0&&(Ze.numClippingPlanes!==_e.numPlanes||Ze.numIntersection!==_e.numIntersection)||Ze.vertexAlphas!==xt||Ze.vertexTangents!==At||Ze.morphTargets!==tt||Ze.morphNormals!==Ft||Ze.morphColors!==an||Ze.toneMapping!==Zt||Ze.morphTargetsCount!==wn||!!Ze.lightProbeGrid!=v.state.lightProbeGridArray.length>0)&&(Dt=!0):(Dt=!0,Ze.__version=se.version);
let ii=Ze.currentProgram;
Dt===!0&&(ii=Mn(se,J,re),P&&se.isNodeMaterial&&P.onUpdateProgram(se,ii,Ze));
let Ei=!1,Qi=!1,Fs=!1,zt=ii.getUniforms(),rn=Ze.uniforms;
if(S.useProgram(ii.program)&&(Ei=!0,Qi=!0,Fs=!0),se.id!==H&&(H=se.id,Qi=!0),Ze.needsLights){
let Yt=yc(v.state.lightProbeGridArray,re);
Ze.lightProbeGrid!==Yt&&(Ze.lightProbeGrid=Yt,Qi=!0)}
if(Ei||Y!==L){
S.buffers.depth.getReversed()&&L.reversedDepth!==!0&&(L._reversedDepth=!0,L.updateProjectionMatrix()),zt.setValue(C,"projectionMatrix",L.projectionMatrix),zt.setValue(C,"viewMatrix",L.matrixWorldInverse);
let ts=zt.map.cameraPosition;
ts!==void 0&&ts.setValue(C,be.setFromMatrixPosition(L.matrixWorld)),A.logarithmicDepthBuffer&&zt.setValue(C,"logDepthBufFC",2/(Math.log(L.far+1)/Math.LN2)),(se.isMeshPhongMaterial||se.isMeshToonMaterial||se.isMeshLambertMaterial||se.isMeshBasicMaterial||se.isMeshStandardMaterial||se.isShaderMaterial)&&zt.setValue(C,"isOrthographic",L.isOrthographicCamera===!0),Y!==L&&(Y=L,Qi=!0,Fs=!0)}
if(Ze.needsLights&&(Fn.state.sunShadowMap.length>0&&zt.setValue(C,"sunShadowMap",Fn.state.sunShadowMap,X),Fn.state.directionalShadowMap.length>0&&zt.setValue(C,"directionalShadowMap",Fn.state.directionalShadowMap,X),Fn.state.spotShadowMap.length>0&&zt.setValue(C,"spotShadowMap",Fn.state.spotShadowMap,X),Fn.state.pointShadowMap.length>0&&zt.setValue(C,"pointShadowMap",Fn.state.pointShadowMap,X)),re.isSkinnedMesh){
zt.setOptional(C,re,"bindMatrix"),zt.setOptional(C,re,"bindMatrixInverse");
let Yt=re.skeleton;
Yt&&(Yt.boneTexture===null&&Yt.computeBoneTexture(),zt.setValue(C,"boneTexture",Yt.boneTexture,X))}
re.isBatchedMesh&&(zt.setOptional(C,re,"batchingTexture"),zt.setValue(C,"batchingTexture",re._matricesTexture,X),zt.setOptional(C,re,"batchingIdTexture"),zt.setValue(C,"batchingIdTexture",re._indirectTexture,X),zt.setOptional(C,re,"batchingColorTexture"),re._colorsTexture!==null&&zt.setValue(C,"batchingColorTexture",re._colorsTexture,X));
let es=ae.morphAttributes;
if((es.position!==void 0||es.normal!==void 0||es.color!==void 0)&&Z.update(re,ae,ii),(Qi||Ze.receiveShadow!==re.receiveShadow)&&(Ze.receiveShadow=re.receiveShadow,zt.setValue(C,"receiveShadow",re.receiveShadow)),(se.isMeshStandardMaterial||se.isMeshLambertMaterial||se.isMeshPhongMaterial)&&se.envMap===null&&J.environment!==null&&(rn.envMapIntensity.value=J.environmentIntensity),rn.dfgLUT!==void 0&&(rn.dfgLUT.value=R_()),Qi){
if(zt.setValue(C,"toneMappingExposure",R.toneMappingExposure),Ze.needsLights&&vs(rn,Fs),Xe&&se.fog===!0&&Me.refreshFogUniforms(rn,Xe),Me.refreshMaterialUniforms(rn,se,ce,ie,v.state.transmissionRenderTarget[L.id]),Ze.needsLights&&Ze.lightProbeGrid){
let Yt=Ze.lightProbeGrid;
rn.probesSH.value=Yt.texture,rn.probesMin.value.copy(Yt.boundingBox.min),rn.probesMax.value.copy(Yt.boundingBox.max),rn.probesResolution.value.copy(Yt.resolution)}
Tr.upload(C,ji(Ze),rn,X)}
if(se.isShaderMaterial&&se.uniformsNeedUpdate===!0&&(Tr.upload(C,ji(Ze),rn,X),se.uniformsNeedUpdate=!1),se.isSpriteMaterial&&zt.setValue(C,"center",re.center),zt.setValue(C,"modelViewMatrix",re.modelViewMatrix),zt.setValue(C,"normalMatrix",re.normalMatrix),zt.setValue(C,"modelMatrix",re.matrixWorld),se.uniformsGroups!==void 0){
let Yt=se.uniformsGroups;
for(let ts=0,Bs=Yt.length;
ts<Bs;
ts++){
let au=Yt[ts];
ve.update(au,ii),ve.bind(au,ii)}
}
return ii}
function vs(L,J){
L.ambientLightColor.needsUpdate=J,L.lightProbe.needsUpdate=J,L.sunLights.needsUpdate=J,L.sunLightShadows.needsUpdate=J,L.directionalLights.needsUpdate=J,L.directionalLightShadows.needsUpdate=J,L.pointLights.needsUpdate=J,L.pointLightShadows.needsUpdate=J,L.spotLights.needsUpdate=J,L.spotLightShadows.needsUpdate=J,L.rectAreaLights.needsUpdate=J,L.hemisphereLights.needsUpdate=J}
function $o(L){
return L.isMeshLambertMaterial||L.isMeshToonMaterial||L.isMeshPhongMaterial||L.isMeshStandardMaterial||L.isShadowMaterial||L.isShaderMaterial&&L.lights===!0}
this.getActiveCubeFace=function(){
return U}
,this.getActiveMipmapLevel=function(){
return D}
,this.getRenderTarget=function(){
return G}
,this.setRenderTargetTextures=function(L,J,ae){
let se=W.get(L);
se.__autoAllocateDepthBuffer=L.resolveDepthBuffer===!1,se.__autoAllocateDepthBuffer===!1&&(se.__useRenderToTexture=!1),W.get(L.texture).__webglTexture=J,W.get(L.depthTexture).__webglTexture=se.__autoAllocateDepthBuffer?void 0:ae,se.__hasExternalTextures=!0}
,this.setRenderTargetFramebuffer=function(L,J){
let ae=W.get(L);
ae.__webglFramebuffer=J,ae.__useDefaultFramebuffer=J===void 0}
,this.setRenderTarget=function(L,J=0,ae=0){
G=L,U=J,D=ae;
let se=null,re=!1,Xe=!1;
if(L){
let Ve=W.get(L);
if(Ve.__useDefaultFramebuffer!==void 0){
S.bindFramebuffer(C.FRAMEBUFFER,Ve.__webglFramebuffer),q.copy(L.viewport),Se.copy(L.scissor),ye=L.scissorTest,S.viewport(q),S.scissor(Se),S.setScissorTest(ye),H=-1;
return}
else if(Ve.__webglFramebuffer===void 0)X.setupRenderTarget(L);
else if(Ve.__hasExternalTextures)X.rebindTextures(L,W.get(L.texture).__webglTexture,W.get(L.depthTexture).__webglTexture);
else if(L.depthBuffer){
let xt=L.depthTexture;
if(Ve.__boundDepthTexture!==xt){
if(xt!==null&&W.has(xt)&&(L.width!==xt.image.width||L.height!==xt.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");
X.setupDepthRenderbuffer(L)}
}
let et=L.texture;
(et.isData3DTexture||et.isDataArrayTexture||et.isCompressedArrayTexture)&&(Xe=!0);
let it=W.get(L).__webglFramebuffer;
L.isWebGLCubeRenderTarget?(Array.isArray(it[J])?se=it[J][ae]:se=it[J],re=!0):L.samples>0&&X.useMultisampledRTT(L)===!1?se=W.get(L).__webglMultisampledFramebuffer:Array.isArray(it)?se=it[ae]:se=it,q.copy(L.viewport),Se.copy(L.scissor),ye=L.scissorTest}
else q.copy(ge).multiplyScalar(ce).floor(),Se.copy(Te).multiplyScalar(ce).floor(),ye=Oe;
if(ae!==0&&(se=N),S.bindFramebuffer(C.FRAMEBUFFER,se)&&S.drawBuffers(L,se),S.viewport(q),S.scissor(Se),S.setScissorTest(ye),re){
let Ve=W.get(L.texture);
C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_CUBE_MAP_POSITIVE_X+J,Ve.__webglTexture,ae)}
else if(Xe){
let Ve=J;
for(let et=0;
et<L.textures.length;
et++){
let it=W.get(L.textures[et]);
C.framebufferTextureLayer(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0+et,it.__webglTexture,ae,Ve)}
}
else if(L!==null&&ae!==0){
let Ve=W.get(L.texture);
C.framebufferTexture2D(C.FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,Ve.__webglTexture,ae)}
H=-1}
;
function Ir(L){
let J=W.get(L);
return(J.__readFormat!==L.format||J.__readType!==L.type)&&(J.__readFormat=L.format,J.__readType=L.type,J.__formatReadable=A.textureFormatReadable(L.format),J.__typeReadable=A.textureTypeReadable(L.type)),J}
this.readRenderTargetPixels=function(L,J,ae,se,re,Xe,$e,Ve=0){
if(!(L&&L.isWebGLRenderTarget)){
lt("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");
return}
let et=W.get(L).__webglFramebuffer;
if(L.isWebGLCubeRenderTarget&&$e!==void 0&&(et=et[$e]),et){
S.bindFramebuffer(C.FRAMEBUFFER,et);
try{
let it=L.textures[Ve],xt=it.format,At=it.type;
L.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+Ve);
let tt=Ir(it);
if(tt.__formatReadable===!1){
lt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");
return}
if(tt.__typeReadable===!1){
lt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");
return}
J>=0&&J<=L.width-se&&ae>=0&&ae<=L.height-re&&C.readPixels(J,ae,se,re,Pe.convert(xt),Pe.convert(At),Xe)}
finally{
let it=G!==null?W.get(G).__webglFramebuffer:null;
S.bindFramebuffer(C.FRAMEBUFFER,it)}
}
}
,this.readRenderTargetPixelsAsync=async function(L,J,ae,se,re,Xe,$e,Ve=0){
if(!(L&&L.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");
let et=W.get(L).__webglFramebuffer;
if(L.isWebGLCubeRenderTarget&&$e!==void 0&&(et=et[$e]),et)if(J>=0&&J<=L.width-se&&ae>=0&&ae<=L.height-re){
S.bindFramebuffer(C.FRAMEBUFFER,et);
let it=L.textures[Ve],xt=it.format,At=it.type;
L.textures.length>1&&C.readBuffer(C.COLOR_ATTACHMENT0+Ve);
let tt=Ir(it);
if(tt.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");
if(tt.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");
let Ft=C.createBuffer();
C.bindBuffer(C.PIXEL_PACK_BUFFER,Ft),C.bufferData(C.PIXEL_PACK_BUFFER,Xe.byteLength,C.STREAM_READ),C.readPixels(J,ae,se,re,Pe.convert(xt),Pe.convert(At),0),C.bindBuffer(C.PIXEL_PACK_BUFFER,null);
let an=G!==null?W.get(G).__webglFramebuffer:null;
S.bindFramebuffer(C.FRAMEBUFFER,an);
let Zt=C.fenceSync(C.SYNC_GPU_COMMANDS_COMPLETE,0);
return C.flush(),await wd(C,Zt,4),C.bindBuffer(C.PIXEL_PACK_BUFFER,Ft),C.getBufferSubData(C.PIXEL_PACK_BUFFER,0,Xe),C.bindBuffer(C.PIXEL_PACK_BUFFER,null),C.deleteBuffer(Ft),C.deleteSync(Zt),Xe}
else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}
,this.copyFramebufferToTexture=function(L,J=null,ae=0){
let se=Math.pow(2,-ae),re=Math.floor(L.image.width*se),Xe=Math.floor(L.image.height*se),$e=J!==null?J.x:0,Ve=J!==null?J.y:0;
X.setTexture2D(L,0),C.copyTexSubImage2D(C.TEXTURE_2D,ae,0,0,$e,Ve,re,Xe),S.unbindTexture()}
,this.copyTextureToTexture=function(L,J,ae=null,se=null,re=0,Xe=0){
let $e,Ve,et,it,xt,At,tt,Ft,an,Zt=L.isCompressedTexture?L.mipmaps[Xe]:L.image;
if(ae!==null)$e=ae.max.x-ae.min.x,Ve=ae.max.y-ae.min.y,et=ae.isBox3?ae.max.z-ae.min.z:1,it=ae.min.x,xt=ae.min.y,At=ae.isBox3?ae.min.z:0;
else{
let rn=Math.pow(2,-re);
$e=Math.floor(Zt.width*rn),Ve=Math.floor(Zt.height*rn),L.isDataArrayTexture?et=Zt.depth:L.isData3DTexture?et=Math.floor(Zt.depth*rn):et=1,it=0,xt=0,At=0}
se!==null?(tt=se.x,Ft=se.y,an=se.z):(tt=0,Ft=0,an=0);
let Vt=Pe.convert(J.format),wn=Pe.convert(J.type),Ze;
J.isData3DTexture?(X.setTexture3D(J,0),Ze=C.TEXTURE_3D):J.isDataArrayTexture||J.isCompressedArrayTexture?(X.setTexture2DArray(J,0),Ze=C.TEXTURE_2D_ARRAY):(X.setTexture2D(J,0),Ze=C.TEXTURE_2D),S.activeTexture(C.TEXTURE0),S.pixelStorei(C.UNPACK_FLIP_Y_WEBGL,J.flipY),S.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL,J.premultiplyAlpha),S.pixelStorei(C.UNPACK_ALIGNMENT,J.unpackAlignment);
let Fn=S.getParameter(C.UNPACK_ROW_LENGTH),Dt=S.getParameter(C.UNPACK_IMAGE_HEIGHT),ii=S.getParameter(C.UNPACK_SKIP_PIXELS),Ei=S.getParameter(C.UNPACK_SKIP_ROWS),Qi=S.getParameter(C.UNPACK_SKIP_IMAGES);
S.pixelStorei(C.UNPACK_ROW_LENGTH,Zt.width),S.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Zt.height),S.pixelStorei(C.UNPACK_SKIP_PIXELS,it),S.pixelStorei(C.UNPACK_SKIP_ROWS,xt),S.pixelStorei(C.UNPACK_SKIP_IMAGES,At);
let Fs=L.isDataArrayTexture||L.isData3DTexture,zt=J.isDataArrayTexture||J.isData3DTexture;
if(L.isDepthTexture){
let rn=W.get(L),es=W.get(J),Yt=W.get(rn.__renderTarget),ts=W.get(es.__renderTarget);
S.bindFramebuffer(C.READ_FRAMEBUFFER,Yt.__webglFramebuffer),S.bindFramebuffer(C.DRAW_FRAMEBUFFER,ts.__webglFramebuffer);
for(let Bs=0;
Bs<et;
Bs++)Fs&&(C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,W.get(L).__webglTexture,re,At+Bs),C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,W.get(J).__webglTexture,Xe,an+Bs)),C.blitFramebuffer(it,xt,$e,Ve,tt,Ft,$e,Ve,C.DEPTH_BUFFER_BIT,C.NEAREST);
S.bindFramebuffer(C.READ_FRAMEBUFFER,null),S.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}
else if(re!==0||L.isRenderTargetTexture||W.has(L)){
let rn=W.get(L),es=W.get(J);
S.bindFramebuffer(C.READ_FRAMEBUFFER,F),S.bindFramebuffer(C.DRAW_FRAMEBUFFER,B);
for(let Yt=0;
Yt<et;
Yt++)Fs?C.framebufferTextureLayer(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,rn.__webglTexture,re,At+Yt):C.framebufferTexture2D(C.READ_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,rn.__webglTexture,re),zt?C.framebufferTextureLayer(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,es.__webglTexture,Xe,an+Yt):C.framebufferTexture2D(C.DRAW_FRAMEBUFFER,C.COLOR_ATTACHMENT0,C.TEXTURE_2D,es.__webglTexture,Xe),re!==0?C.blitFramebuffer(it,xt,$e,Ve,tt,Ft,$e,Ve,C.COLOR_BUFFER_BIT,C.NEAREST):zt?C.copyTexSubImage3D(Ze,Xe,tt,Ft,an+Yt,it,xt,$e,Ve):C.copyTexSubImage2D(Ze,Xe,tt,Ft,it,xt,$e,Ve);
S.bindFramebuffer(C.READ_FRAMEBUFFER,null),S.bindFramebuffer(C.DRAW_FRAMEBUFFER,null)}
else zt?L.isDataTexture||L.isData3DTexture?C.texSubImage3D(Ze,Xe,tt,Ft,an,$e,Ve,et,Vt,wn,Zt.data):J.isCompressedArrayTexture?C.compressedTexSubImage3D(Ze,Xe,tt,Ft,an,$e,Ve,et,Vt,Zt.data):C.texSubImage3D(Ze,Xe,tt,Ft,an,$e,Ve,et,Vt,wn,Zt):L.isDataTexture?C.texSubImage2D(C.TEXTURE_2D,Xe,tt,Ft,$e,Ve,Vt,wn,Zt.data):L.isCompressedTexture?C.compressedTexSubImage2D(C.TEXTURE_2D,Xe,tt,Ft,Zt.width,Zt.height,Vt,Zt.data):C.texSubImage2D(C.TEXTURE_2D,Xe,tt,Ft,$e,Ve,Vt,wn,Zt);
S.pixelStorei(C.UNPACK_ROW_LENGTH,Fn),S.pixelStorei(C.UNPACK_IMAGE_HEIGHT,Dt),S.pixelStorei(C.UNPACK_SKIP_PIXELS,ii),S.pixelStorei(C.UNPACK_SKIP_ROWS,Ei),S.pixelStorei(C.UNPACK_SKIP_IMAGES,Qi),Xe===0&&J.generateMipmaps&&C.generateMipmap(Ze),S.unbindTexture()}
,this.initRenderTarget=function(L){
W.get(L).__webglFramebuffer===void 0&&X.setupRenderTarget(L)}
,this.initTexture=function(L){
L.isCubeTexture?X.setTextureCube(L,0):L.isData3DTexture?X.setTexture3D(L,0):L.isDataArrayTexture||L.isCompressedArrayTexture?X.setTexture2DArray(L,0):X.setTexture2D(L,0),S.unbindTexture()}
,this.resetState=function(){
U=0,D=0,G=null,S.reset(),ze.reset()}
,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{
detail:this}
))}
get coordinateSystem(){
return xi}
get outputColorSpace(){
return this._outputColorSpace}
set outputColorSpace(e){
this._outputColorSpace=e;
let t=this.getContext();
t.drawingBufferColorSpace=Rt._getDrawingBufferColorSpace(e),t.unpackColorSpace=Rt._getUnpackColorSpace()}
}
;
var ac=[[45,35,165,236,116,234],[261,35,402,236,331.5,234],[468,34,577,225,523,223],[673,37,787,237,723.5,235],[892,36,996,237,962.5,235],[1084,36,1222,235,1153,233],[29,256,194,450,127.5,448],[270,259,409,451,390.5,450],[483,258,574,451,520,449],[645,257,775,450,746.5,448],[837,298,1043,451,931.5,451],[1043,303,1245,451,1130,450],[38,489,170,683,118,681],[260,477,419,684,353,682],[460,469,602,684,513,682],[687,451,796,685,749.5,683],[863,497,1043,684,929.5,682],[1083,490,1220,684,1151,682],[31,711,195,893,125.5,891],[233,714,402,894,331,892],[440,714,633,894,562,892],[661,711,832,894,728.5,892],[872,716,1027,894,943,892],[1068,717,1238,894,1172.5,892],[45,912,193,1074,114,1072],[244,912,425,1073,315,1071],[464,913,618,1073,531.5,1071],[657,910,817,1074,723.5,1072],[871,913,1034,1077,943.5,1077],[1082,916,1240,1074,1149,1072],[46,1078,161,1245,104.5,1243],[262,1079,388,1246,317.5,1244],[477,1080,576,1245,528,1243],[671,1080,772,1246,723,1244],[888,1077,988,1242,933.5,1240],[1094,1095,1228,1244,1108.5,1242]],df=[0,1,6,9,2,12,13,14,15,16,18,19,20,21,22,24,25,26,27,1,3,4,6,9,5];
var lc=hp(pf()),Wh=[0,250,502,752,1005,1254],mf=[0,264,538,781,1013,1254],P_=[254,530,770,1007,1224],L_=[114,121,109,137,118,129,132,130,125,128,131,105,159,126,120,109,113,154,123,123,122,120,102,116,120],Xh=L_.map((i,e)=>{
let t=Math.floor(e/5),n=e%5;
return[Wh[n]+(e===24?32:0),mf[t],e===21?445:Wh[n+1],mf[t+1],Wh[n]+i,P_[t]]}
);
Xh[22][0]=475;
Xh[23][2]=1032;
var D_=[[63,20,190,242,140,240],[303,35,464,243,382,241],[532,38,709,243,610,241],[804,38,975,242,889,240],[1046,28,1203,242,1125,240],[27,279,217,508,135,506],[272,268,468,509,392,507],[544,272,720,509,640,507],[825,254,953,511,890,509],[1043,281,1209,508,1125,506],[37,541,231,745,148,743],[272,537,477,745,354,743],[532,538,740,746,654,744],[797,542,986,746,873,744],[1049,536,1204,746,1126,744],[60,771,225,978,147,976],[277,776,481,978,355,976],[542,774,736,978,654,976],[808,776,961,978,882,976],[1047,775,1204,978,1126,976],[71,999,179,1195,132,1193],[312,1004,403,1198,363,1196],[480,1039,741,1195,563,1193],[753,1044,1014,1195,837,1193],[1048,1006,1210,1199,1129,1197]];
function gf(i,e){
let t=globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),n=e?Xh:D_,s=e?.0082:.0087,r=new no(new dr({
transparent:!0,alphaTest:.72,depthWrite:!0,toneMapped:!1}
));
r.visible=!1,i.add(r);
let o=e?[[8,176,345,582,166,575],[352,176,681,582,492,575],[696,176,944,582,790,575],[944,176,1254,582,1092,575]]:[[8,770,323,1168,164,1160],[360,770,615,1168,490,1160],[708,770,887,1168,790,1160],[944,770,1254,1168,1092,1160]],a=.0041,l=[[304,544],[716,450],[1084,492],[1458,547]],c=[0,1,2,3].map(P=>[P*384,328,(P+1)*384,780,P*384+192,770]),u,m=!1,f="classic";
function p(P){
f=!e&&P==="photo"?"photo":"classic",f==="photo"&&!u&&(u=new Di().load("/assets/players/front-template-v1/bald-bearded-front.png",()=>{
m=!0}
,void 0,()=>{
}
),u.colorSpace=Nt,u.minFilter=kt,u.magFilter=kt,u.generateMipmaps=!1)}
let x,b=!1,g=null,h=!1,M=!1,T=!1,d,y,v=!1,E="",_={
frame:1,flip:!1}
;
function w(){
T||(T=!0,d=new Di().load(e?"/assets/players/2d-back.png":"/assets/players/2d-front.png",()=>{
h=!0}
,void 0,()=>{
M=!0}
),e&&(x=new Di().load("/assets/players/2d-idle-toss.png",()=>{
b=!0}
,void 0,()=>{
}
),x.colorSpace=Nt,x.minFilter=kt,x.magFilter=kt,x.generateMipmaps=!1),y=new Di().load("/assets/players/2d-side-steps.png",()=>{
v=!0}
,void 0,()=>{
}
),y.colorSpace=Nt,y.minFilter=kt,y.magFilter=kt,y.generateMipmaps=!1,d.colorSpace=Nt,d.minFilter=kt,d.magFilter=kt,d.generateMipmaps=!1,r.material.map=d,r.material.needsUpdate=!0)}
function R(P,N,F,B=null){
if(F&&w(),r.visible=F&&h,!r.visible)return!1;
_=(0,lc.selectPose)(P,N,e,!!t?.matches),g=e&&b&&_.frame===5&&B!==null?(0,lc.idleTossPose)(B):null,g&&(_.idlePose=g.pose);
let U=v&&_.step!==void 0,D=f==="photo"&&m,G=_.step!==void 0?6+_.step:df[_.frame];
D&&(_.photoPose=G);
let H=(D?"photo":"classic")+_.frame+":"+_.flip+":"+(g?"idle"+g.pose:U?_.step:"base");
if(H!==E){
E=H;
let q=D?u:g?x:U?y:d,Se=D?[.0087,.0093,.0087,.01,.0108,.0108][Math.floor(G/6)]:g?a:U?e?.0045:.0046:s,[ye,Re,Ye,Ne,ie,ce]=D?ac[G]:g?c[g.pose]:U?o[_.step]:n[_.frame],j=Ye-ye,de=Ne-Re;
r.material.map=q;
let ge=g?1536:1254,Te=g?1024:1254,Oe=D?_.frame===18:_.flip;
q.repeat.set((Oe?-1:1)*j/ge,de/Te),q.offset.set((Oe?Ye:ye)/ge,1-Ne/Te),r.scale.set(j*Se,de*Se,1),r.center.set(Oe?1-(ie-ye)/j:(ie-ye)/j,1-(ce-Re)/de)}
r.position.set(P.x*5.5,.025,P.y*8);
let Y=!e&&P.y<-.9;
return r.material.depthTest=!Y,r.material.depthWrite=!Y,r.renderOrder=Y?10:0,!0}
function I(P){
if(!r.visible||_.frame!==5)return null;
let N,F;
if(g){
let G=H=>[(l[H][0]-c[H][4])*a,(770-l[H][1])*a];
if([N,F]=G(g.pose),g.flight!==null){
let H=g.flight,Y=G(1),q=G(2);
N=Y[0]+(q[0]-Y[0])*H,F=Y[1]+(q[1]-Y[1])*H+.3*4*H*(1-H)}
}
else if(f==="photo"&&m)N=(146-ac[12][4])*.0087,F=(ac[12][5]-592)*.0087;
else{
let[G,H,Y,q,Se,ye]=n[5],[Re,Ye]=e?[219,365]:[198,383];
N=(Re-Se)*s,F=(ye-Ye)*s}
let B=new k(1,0,0).applyQuaternion(P.quaternion),U=new k(0,1,0).applyQuaternion(P.quaternion),D=new k(0,0,1).applyQuaternion(P.quaternion);
return r.position.clone().addScaledVector(B,N).addScaledVector(U,F).addScaledVector(D,.09)}
return{
update:R,setSkin:p,heldBallPosition:I,debug:()=>({
ready:h,failed:M,skin:f,photoReady:m,stepsReady:v,idleReady:b,rearCourtOverlay:!r.material.depthTest,visible:r.visible,..._}
)}
}
var zo=new k;
function ai(i,e,t,n,s,r){
let o=2*Math.PI*s/4,a=Math.max(r-2*s,0),l=Math.PI/4;
zo.copy(e),zo[n]=0,zo.normalize();
let c=.5*o/(o+a),u=1-zo.angleTo(i)/l;
return Math.sign(zo[t])===1?u*c:a/(o+a)+c+c*(1-u)}
var _s=class i extends Mt{
constructor(e=1,t=1,n=1,s=2,r=.1){
let o=s*2+1;
if(r=Math.min(e/2,t/2,n/2,r),super(1,1,1,o,o,o),this.type="RoundedBoxGeometry",this.parameters={
width:e,height:t,depth:n,segments:s,radius:r}
,o===1)return;
let a=this.toNonIndexed();
this.index=null,this.attributes.position=a.attributes.position,this.attributes.normal=a.attributes.normal,this.attributes.uv=a.attributes.uv;
let l=new k,c=new k,u=new k(e,t,n).divideScalar(2).subScalar(r),m=this.attributes.position.array,f=this.attributes.normal.array,p=this.attributes.uv.array,x=m.length/6,b=new k,g=.5/o;
for(let h=0,M=0;
h<m.length;
h+=3,M+=2)switch(l.fromArray(m,h),c.copy(l),c.x-=Math.sign(c.x)*g,c.y-=Math.sign(c.y)*g,c.z-=Math.sign(c.z)*g,c.normalize(),m[h+0]=u.x*Math.sign(l.x)+c.x*r,m[h+1]=u.y*Math.sign(l.y)+c.y*r,m[h+2]=u.z*Math.sign(l.z)+c.z*r,f[h+0]=c.x,f[h+1]=c.y,f[h+2]=c.z,Math.floor(h/x)){
case 0:b.set(1,0,0),p[M+0]=ai(b,c,"z","y",r,n),p[M+1]=1-ai(b,c,"y","z",r,t);
break;
case 1:b.set(-1,0,0),p[M+0]=1-ai(b,c,"z","y",r,n),p[M+1]=1-ai(b,c,"y","z",r,t);
break;
case 2:b.set(0,1,0),p[M+0]=1-ai(b,c,"x","z",r,e),p[M+1]=ai(b,c,"z","x",r,n);
break;
case 3:b.set(0,-1,0),p[M+0]=1-ai(b,c,"x","z",r,e),p[M+1]=1-ai(b,c,"z","x",r,n);
break;
case 4:b.set(0,0,1),p[M+0]=1-ai(b,c,"x","y",r,e),p[M+1]=1-ai(b,c,"y","x",r,t);
break;
case 5:b.set(0,0,-1),p[M+0]=ai(b,c,"x","y",r,e),p[M+1]=1-ai(b,c,"y","x",r,t);
break}
}
static fromJSON(e){
return new i(e.width,e.height,e.depth,e.segments,e.radius)}
}
;
function vt(i,e=!1){
let t=i[0].index!==null,n=new Set(Object.keys(i[0].attributes)),s=new Set(Object.keys(i[0].morphAttributes)),r={
}
,o={
}
,a=i[0].morphTargetsRelative,l=new st,c=0;
for(let u=0;
u<i.length;
++u){
let m=i[u],f=0;
if(t!==(m.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;
for(let p in m.attributes){
if(!n.has(p))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+'. All geometries must have compatible attributes; make sure "'+p+'" attribute exists among all geometries, or in none of them.'),null;
r[p]===void 0&&(r[p]=[]),r[p].push(m.attributes[p]),f++}
if(f!==n.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". Make sure all geometries have the same number of attributes."),null;
if(a!==m.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". .morphTargetsRelative must be consistent throughout all geometries."),null;
for(let p in m.morphAttributes){
if(!s.has(p))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+".  .morphAttributes must be consistent throughout all geometries."),null;
o[p]===void 0&&(o[p]=[]),o[p].push(m.morphAttributes[p])}
if(e){
let p;
if(t)p=m.index.count;
else if(m.attributes.position!==void 0)p=m.attributes.position.count;
else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+u+". The geometry must have either an index or a position attribute"),null;
l.addGroup(c,p,u),c+=p}
}
if(t){
let u=0,m=[];
for(let f=0;
f<i.length;
++f){
let p=i[f].index;
for(let x=0;
x<p.count;
++x)m.push(p.getX(x)+u);
u+=i[f].attributes.position.count}
l.setIndex(m)}
for(let u in r){
let m=xf(r[u]);
if(!m)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+u+" attribute."),null;
l.setAttribute(u,m)}
for(let u in o){
let m=o[u][0].length;
if(m!==0){
l.morphAttributes=l.morphAttributes||{
}
,l.morphAttributes[u]=[];
for(let f=0;
f<m;
++f){
let p=[];
for(let b=0;
b<o[u].length;
++b)p.push(o[u][b][f]);
let x=xf(p);
if(!x)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+u+" morphAttribute."),null;
l.morphAttributes[u].push(x)}
}
}
return l}
function xf(i){
let e,t,n,s=-1,r=0;
for(let c=0;
c<i.length;
++c){
let u=i[c];
if(e===void 0&&(e=u.array.constructor),e!==u.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;
if(t===void 0&&(t=u.itemSize),t!==u.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;
if(n===void 0&&(n=u.normalized),n!==u.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;
if(s===-1&&(s=u.gpuType),s!==u.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;
r+=u.count*t}
let o=new e(r),a=new ft(o,t,n),l=0;
for(let c=0;
c<i.length;
++c){
let u=i[c];
if(u.isInterleavedBufferAttribute){
let m=l/t;
for(let f=0,p=u.count;
f<p;
f++)for(let x=0;
x<t;
x++){
let b=u.getComponent(f,x);
a.setComponent(f+m,x,b)}
}
else o.set(u.array,l);
l+=u.count*t}
return s!==void 0&&(a.gpuType=s),a}
var wt=(i=0,e=0,t=0)=>new k(i,e,t),cc=wt(0,1,0),ko=wt(.88,.94,.88),en=(i,e=.83)=>new qe({
color:i,roughness:e}
);
function Wt(i,e,t,n=[0,0,0]){
let s=new ot(i,e);
return s.position.set(...n),s.castShadow=s.receiveShadow=!0,t.add(s),s}
function Wn(i,e,t){
let n=wt(...e),s=wt(...t),r=s.clone().sub(n);
i.position.copy(n.add(s).multiplyScalar(.5)),i.scale.y=Math.max(.001,r.length()),i.quaternion.setFromUnitVectors(cc,r.normalize())}
function Ar(i){
let e=new Map;
for(let t of i.children){
if(!t.isMesh)continue;
let n=e.get(t.material)||[];
n.push(t),e.set(t.material,n)}
for(let[t,n]of e){
if(n.length<2)continue;
let s=n.map(o=>(o.updateMatrix(),(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrix))),r=vt(s);
s.forEach(o=>o.dispose()),r&&(n.forEach(o=>i.remove(o)),Wt(r,t,i))}
}
function Zi(i,e=24){
let t=[],n=[],s=[],r=e+1;
i.forEach(([l,c,u],m)=>{
for(let f=0;
f<=e;
f++){
let p=f/e*Math.PI*2;
t.push(Math.cos(p)*c,l,Math.sin(p)*u),n.push(1-f/e,(l-i[0][0])/(i.at(-1)[0]-i[0][0]))}
}
);
for(let l=0;
l<i.length-1;
l++)for(let c=0;
c<e;
c++){
let u=l*r+c,m=u+1,f=u+r,p=f+1;
s.push(u,f,m,m,f,p)}
for(let[l,c]of[[0,!0],[i.length-1,!1]]){
let u=t.length/3;
t.push(0,i[l][0],0),n.push(.5,c?0:1);
for(let m=0;
m<e;
m++){
let f=l*r+m,p=f+1;
s.push(u,c?f:p,c?p:f)}
}
let o=new st;
o.setAttribute("position",new De(t,3)),o.setAttribute("uv",new De(n,2)),o.setIndex(s),o.computeVertexNormals();
let a=o.attributes.normal;
for(let l=0;
l<i.length;
l++){
let c=l*r,u=c+e,m=wt(a.getX(c)+a.getX(u),a.getY(c)+a.getY(u),a.getZ(c)+a.getZ(u)).normalize();
a.setXYZ(c,m.x,m.y,m.z),a.setXYZ(u,m.x,m.y,m.z)}
return o}
function Go(i){
let e=new We(i);
return e.r*.2126+e.g*.7152+e.b*.0722>.32?"#214b3e":"#f3efdf"}
function _f(i,e,t){
let n=document.createElement("canvas");
n.width=1024,n.height=512;
let s=n.getContext("2d");
s.fillStyle=e,s.fillRect(0,0,1024,512),s.globalAlpha=.065,s.fillStyle=t;
for(let o=0;
o<512;
o+=4)for(let a=o%8?2:0;
a<1024;
a+=4)s.fillRect(a,o,1,2);
s.globalAlpha=1;
for(let o of[0,512,1024])s.fillStyle=t,s.beginPath(),s.moveTo(o-24,512),s.lineTo(o-10,90),s.lineTo(o+10,90),s.lineTo(o+24,512),s.fill(),s.globalAlpha=.3,s.fillRect(o-29,140,2,350),s.fillRect(o+27,140,2,350),s.globalAlpha=1;
s.fillStyle=t,s.fillRect(89,145,333,25),s.globalAlpha=.55,s.fillRect(89,179,333,5),s.globalAlpha=1,s.font="bold 29px Arial",s.textAlign="center",s.fillText("TOP TENNIS",256,134),s.font="bold 24px Arial",s.fillText("WORLD COURT",768,142),s.font="bold 115px Arial",s.fillText(i?"01":"02",768,285),s.fillRect(716,310,104,5);
let r=new Hn(n);
return r.colorSpace=Nt,r.anisotropy=4,r}
function yf(i,e,t){
let o=new Float32Array(867),a=[];
for(let u=0;
u<16;
u++)for(let m=0;
m<16;
m++){
let f=u*17+m,p=f+17;
a.push(f,f+1,p,f+1,p+1,p)}
let l=new st;
l.setAttribute("position",new ft(o,3)),l.setIndex(a);
let c=Wt(l,e,i);
return c.frustumCulled=!1,{
mesh:c,update(u,m,f){
let p=new yn([wt(...u),wt(...m),wt(...f)],!1,"centripetal");
for(let b=0;
b<=16;
b++){
let g=b/16,h=p.getPoint(g),M=p.getTangent(g).normalize(),T=(Math.abs(M.z)<.9?wt(0,0,1):wt(1,0,0)).cross(M).normalize(),d=M.clone().cross(T).normalize(),y=g*(t.length-1),v=Math.min(t.length-2,Math.floor(y)),E=Ln.lerp(t[v],t[v+1],y-v);
for(let _=0;
_<=16;
_++){
let w=_/16*Math.PI*2,R=h.clone().addScaledVector(T,Math.cos(w)*E).addScaledVector(d,Math.sin(w)*E*.94);
l.attributes.position.setXYZ(b*17+_,R.x,R.y,R.z)}
}
l.attributes.position.needsUpdate=!0,l.computeVertexNormals();
let x=l.attributes.normal;
for(let b=0;
b<=16;
b++){
let g=b*17,h=g+16,M=wt(x.getX(g)+x.getX(h),x.getY(g)+x.getY(h),x.getZ(g)+x.getZ(h)).normalize();
x.setXYZ(g,M.x,M.y,M.z),x.setXYZ(h,M.x,M.y,M.z)}
x.needsUpdate=!0}
}
}
function N_(i,e,t){
let n=en("#eeeae0",.88),s=en("#b6b8b2",.82),r=en("#424b4f",.84),o=en(t?"#b94032":"#3c6488",.78),a=en("#ccd0cb",.38),l=new qe({
color:"#bc8835",metalness:.58,roughness:.25,emissive:"#453316",emissiveIntensity:.16}
),c=[],u=U=>{
let D=new je;
return U.add(D),c.push(D),D}
,m=new gt(1,16,12),f=(U,D,G,H=[0,0,0])=>{
let Y=Wt(m,D,U,H);
return Y.scale.set(...G),Y}
,p=(U,D,G,H,Y=.02)=>Wt(new _s(...D,2,Y),H,U,G),x=(U,D,G,H)=>Wt(Zi([[-.5,G*.78,G*.78],[-.4,G,G*.94],[-.16,G*1.04,G*.97],[.16,H*1.04,H*.97],[.4,H,H*.94],[.5,H*.8,H*.8]],16),D,U),b=(U,D,G)=>Wt(new St(G,G,1,16),D,U),g=(U,D,G,H,Y)=>{
let q=Wt(new Qt(D,G,6,20),H,U,Y);
return q.rotation.x=Math.PI/2,q}
,h=u(e);
h.name="apollo-pressure-suit",Wt(Zi([[-.28,.195,.144],[-.22,.229,.16],[-.07,.245,.164],[.12,.274,.166],[.2,.261,.151],[.26,.17,.117]],20),n,h,[0,1.18,0]),p(h,[.39,.24,.27],[0,.94,.006],n,.08),g(h,.127,.022,a,[0,1.447,0]),g(h,.123,.012,r,[0,1.464,0]),p(h,[.37,.47,.19],[0,1.205,.232],n,.045),p(h,[.3,.105,.17],[0,1.505,.228],n,.028),p(h,[.345,.035,.199],[0,1.335,.239],s,.008),p(h,[.345,.026,.199],[0,1.065,.239],s,.006);
for(let U of[-1,1]){
let D=p(h,[.034,.4,.024],[U*.176,1.207,-.151],s,.008);
D.rotation.z=U*.1,f(h,o,[.037,.037,.009],[U*.093,1.335,-.159]),f(h,a,[.031,.031,.014],[U*.116,1.074,-.167]),f(h,r,[.017,.017,.016],[U*.116,1.074,-.178])}
p(h,[.128,.09,.035],[0,1.255,-.172],n,.015),p(h,[.081,.022,.008],[0,1.26,-.194],o,.004);
let M=new yn([wt(.12,1.075,-.183),wt(.23,.998,-.153),wt(.285,1.02,.015),wt(.24,1.16,.224)]);
Wt(new Gn(M,16,.019,6,!1),a,h);
let T=document.createElement("canvas");
T.width=256,T.height=128;
let d=T.getContext("2d");
d.fillStyle="#eeeae0",d.fillRect(0,0,256,128);
for(let U=0;
U<13;
U++)d.fillStyle=U%2?"#f5eee1":"#ad382e",d.fillRect(8,8+U*6,114,6);
d.fillStyle="#284b74",d.fillRect(8,8,50,42),d.fillStyle="#fff";
for(let U=13;
U<48;
U+=7)for(let D=13;
D<55;
D+=8)d.fillRect(D,U,2,2);
d.fillStyle=t?"#a6342a":"#355c80",d.font="bold 72px Arial",d.textAlign="center",d.fillText(t?"01":"02",192,83);
let y=new Hn(T);
y.colorSpace=Nt;
let v=en("#ffffff");
v.map=y;
let E=Wt(new Kt(.28,.14),v,h,[0,1.208,.337]),_=Wt(new Kt(.13,.065),v,h,[0,1.378,-.159]);
_.rotation.y=Math.PI,Ar(h);
let w=u(e);
w.name="apollo-helmet",f(w,n,[.191,.206,.182],[0,.01,.006]),f(w,r,[.166,.154,.086],[0,.014,-.116]),f(w,l,[.151,.139,.078],[0,.017,-.13]);
let R=Wt(new Qt(.157,.015,6,20,Math.PI),n,w,[0,.059,-.115]);
R.scale.y=.7;
for(let U of[-1,1])f(w,a,[.013,.034,.034],[U*.181,.035,-.02]);
Ar(w);
function I(){
let U=u(e),D=x(U,n,.095,.08),G=x(U,n,.08,.061),H=f(U,n,[.083,.082,.08]),Y=f(U,n,[.105,.102,.1]),q=b(U,o,.102),Se=x(U,a,.063,.063),ye=f(U,n,[.049,.061,.04]),Re=f(U,n,[.023,.034,.022]);
return{
upper:D,lower:G,elbow:H,shoulder:Y,band:q,cuff:Se,hand:ye,thumb:Re}
}
function P(){
let U=u(i),D=new je;
return U.add(D),p(D,[.165,.105,.31],[0,.005,-.025],n,.04),p(D,[.152,.19,.145],[0,.093,.036],n,.03),p(D,[.17,.035,.32],[0,-.046,-.026],r,.013),p(D,[.157,.035,.16],[0,.157,.034],s,.012),p(D,[.138,.035,.018],[0,.035,-.178],s,.004),Ar(D),{
upper:x(U,n,.121,.103),lower:x(U,n,.1,.077),knee:f(U,n,[.105,.106,.102]),band:b(U,o,.13),boot:D}
}
let N=[I(),I()],F=[P(),P()],B=(U,D,G)=>U.map((H,Y)=>H+(D[Y]-H)*G);
return{
setVisible(U){
c.forEach(D=>{
D.visible=U}
)}
,updateBody(U,D){
h.position.y=U.hipY-.91,w.position.copy(D.position),w.rotation.copy(D.rotation)}
,updateArm(U,D,G,H,Y){
let q=N[U];
Wn(q.upper,G,H),Wn(q.lower,H,Y),q.shoulder.position.set(...G),q.elbow.position.set(...H),Wn(q.band,B(G,H,.25),B(G,H,.39)),Wn(q.cuff,B(H,Y,.82),B(H,Y,.94)),q.hand.position.set(...Y),q.hand.quaternion.setFromUnitVectors(cc,wt(...Y).sub(wt(...H)).normalize()),q.thumb.position.copy(q.hand.position).add(wt(-D*.031,.018,-.01).applyQuaternion(q.hand.quaternion)),q.thumb.quaternion.copy(q.hand.quaternion)}
,updateLeg(U,D,G){
let H=F[U];
Wn(H.upper,D.hip,D.knee),Wn(H.lower,D.knee,D.foot),H.knee.position.set(...D.knee),Wn(H.band,B(D.hip,D.knee,.28),B(D.hip,D.knee,.4)),H.boot.position.copy(G.position),H.boot.rotation.copy(G.rotation)}
}
}
function vf(i,e){
let t=globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),n=new je;
n.name=e?"player-athlete":"rival-athlete",i.add(n),n.scale.copy(ko);
let s=new je;
n.add(s);
let r=e?"player":"ai",o={
skin:e?"#c9926d":"#805039",shirt:e?"#f3f0dc":"#db582f",pants:e?"#214b3e":"#25364d",shoes:"#f3f0dc",racket:"#1d2927"}
,a=te=>({
...o,...window.TennisAppearance?.resolve(te,r)}
),l=a(),c=en("#f3efdf"),u=en("#214b3e"),m=en(e?"#d0bc70":"#f1d8ac"),f=en(l.shirt),p=en(Go(l.shirt)),x=en(l.pants),b=en(l.pants);
b.color.multiplyScalar(.75);
let g=en(l.shoes),h=en(Go(l.shoes)),M=e?u:en("#db582f"),T=en("#ffffff");
T.map=_f(e,l.shirt,Go(l.shirt));
let d=en(l.skin,.9),y=en(e?"#30281f":"#211e1c",.96),v=en("#352820"),E=en(l.skin);
E.color.multiplyScalar(.5);
function _(te){
let V=a(te);
if(V.skin!==l.skin&&(d.color.set(V.skin),E.color.set(V.skin).multiplyScalar(.5)),V.shirt!==l.shirt){
let C=Go(V.shirt),Q=T.map;
f.color.set(V.shirt),p.color.set(C),T.map=_f(e,V.shirt,C),T.needsUpdate=!0,Q.dispose()}
V.pants!==l.pants&&(x.color.set(V.pants),b.color.set(V.pants).multiplyScalar(.75)),V.shoes!==l.shoes&&(g.color.set(V.shoes),h.color.set(Go(V.shoes))),V.racket!==l.racket&&ie.color.set(V.racket),l=V}
let w=new gt(1,20,12),R=(te,V,C,Q=[0,0,0])=>{
let z=Wt(w,V,te,Q);
return z.scale.set(...C),z}
,I=(te,V,C,Q,z=.015)=>Wt(new _s(...V,2,z),Q,te,C),P=(te,V,C,Q)=>Wt(Zi([[-.5,C*.9,C*.85],[-.41,C,C*.94],[-.1,C*1.01,C*.96],[.24,Q*1.03,Q*.95],[.46,Q,Q*.92],[.5,Q*.93,Q*.87]],20),V,te),N=Wt(Zi([[-.25,.17,.111],[-.23,.186,.122],[-.13,.188,.125],[-.02,.208,.136],[.09,.238,.148],[.16,.25,.142],[.205,.223,.124],[.24,.145,.094],[.26,.08,.07]]),T,s,[0,1.18,0]),F=Wt(Zi([[-.095,.162,.098],[-.065,.183,.121],[.07,.184,.122],[.105,.167,.111]]),x,s,[0,.91,0]),B=Wt(Zi([[-.012,.175,.114],[.012,.175,.114]]),x,s),U=Wt(new Qt(.077,.011,8,32),p,s);
U.rotation.x=Math.PI/2,U.scale.z=.85;
let D=R(s,d,[.057,.081,.061]),G=new je;
s.add(G);
let H=new gt(1,28,20),Y=H.attributes.position;
for(let te=0;
te<Y.count;
te++){
let V=Y.getY(te),C=1-Math.max(0,-V)*.27,Q=Y.getZ(te),z=Q<0?Math.max(Q,-.88):Q;
Y.setXYZ(te,Y.getX(te)*.111*C,V*.158,z*.119-(V<-.3?.009:0))}
H.computeVertexNormals(),Wt(H,d,G);
let q=new gt(1,32,16,0,Math.PI*2,0,Math.PI*.6),Se=q.attributes.position;
for(let te=0;
te<Se.count;
te++){
let V=Se.getX(te),C=Se.getY(te),Q=Se.getZ(te),A=Math.max(0,-Q)*Math.max(0,.5-C)*.065;
Se.setXYZ(te,V*.115,C*(e?.145:.132)+.03+A+Math.max(0,C)*V*.018,Q*.123+.009)}
q.computeVertexNormals(),Wt(q,y,G);
for(let te of[-1,1]){
R(G,d,[.017,.03,.02],[te*.105,-.013,.001]),R(G,E,[.006,.016,.01],[te*.118,-.013,-.005]),R(G,c,[.015,.007,.004],[te*.04,.011,-.106]),R(G,v,[.005,.006,.003],[te*.04,.01,-.11]);
let V=R(G,y,[.02,.004,.004],[te*.039,.03,-.105]);
V.rotation.z=te*.09}
if(R(G,d,[.014,.026,.02],[0,-.014,-.115]),R(G,E,[.023,.0035,.003],[0,-.062,-.107]),e){
let te=Wt(Zi([[-.019,.119,.128],[.019,.119,.128]],32),u,G,[0,.061,0]);
te.rotation.x=-.07,I(G,[.035,.016,.006],[0,.06,-.126],m,.003);
let V=R(G,u,[.024,.023,.018],[.07,.053,.103]);
V.rotation.z=-.3}
Ar(G);
function ye(){
let te=new je;
n.add(te);
let V=Zi([[-.164,.015,.014],[-.144,.061,.032],[-.1,.075,.039],[-.035,.069,.061],[.035,.055,.074],[.102,.054,.052],[.12,.025,.029]],20);
V.rotateX(Math.PI/2),Wt(V,g,te,[0,.018,0]);
let C=[[-.169,.014],[-.151,.058],[-.115,.077],[-.06,.078],[0,.067],[.07,.06],[.116,.055],[.128,.022]],Q=(S,O,W)=>{
let X=Zi(C.map(([$,oe])=>[$,oe,S]),20);
X.rotateX(Math.PI/2),Wt(X,O,te,[0,W,0])}
;
Q(.017,c,-.043),Q(.006,u,-.061);
let z=I(te,[.066,.012,.09],[0,.058,-.03],g,.008);
z.rotation.x=.28;
for(let S of[-1,1]){
let O=I(te,[.008,.026,.089],[S*.067,.006,-.032],h,.004);
O.rotation.x=-.16}
let A=[];
for(let S=0;
S<4;
S++){
let O=-.061+S*.016,W=.054+S*.005;
A.push(-.026,W,O,.026,W,O)}
return te.add(new On(new st().setAttribute("position",new De(A,3)),new un({
color:"#c0bdaa"}
))),Ar(te),te}
let Re=[-1,1].map(()=>({
shorts:P(n,x,.105,.112),hem:P(n,b,.106,.106),skin:yf(n,d,[.086,.082,.063,.07,.047]),sock:P(n,c,.049,.051),sockStripe:P(n,M,.052,.052),foot:ye()}
)),Ye=[-1,1].map(()=>({
sleeve:P(s,f,.079,.068),cuff:P(s,p,.069,.069),skin:yf(s,d,[.061,.06,.047,.051,.03]),wristband:P(s,c,.041,.041),hand:R(s,d,[.038,.049,.03]),thumb:R(s,d,[.019,.029,.019])}
)),Ne=new je;
s.add(Ne);
let ie=en(l.racket,.5),ce=en(e?"#ceba71":"#f07c47",.45);
I(Ne,[.037,.184,.034],[0,.068,0],c,.008);
let j=[];
for(let te=0;
te<7;
te++)j.push(-.02,-.012+te*.025,.02,.02,.003+te*.025,.02);
Ne.add(new On(new st().setAttribute("position",new De(j,3)),new un({
color:"#b8b8a8"}
)));
let de=(te,V,C)=>Wt(new Gn(new yn(te),16,C,8,!1),V,Ne);
de([wt(-.1,.34,0),wt(-.025,.19,0),wt(0,.14,0)],ie,.012),de([wt(.1,.34,0),wt(.025,.19,0),wt(0,.14,0)],ie,.012);
let ge=Wt(new Qt(.168,.013,10,48),ie,Ne,[0,.46,0]);
ge.scale.y=1.32;
let Te=Wt(new Qt(.169,.004,6,48),ce,Ne,[0,.46,-.011]);
Te.scale.y=1.32;
let Oe=[];
for(let te=-.14;
te<=.141;
te+=.025){
let V=Math.sqrt(1-(te/.168)**2)*.217;
Oe.push(te,.46-V,0,te,.46+V,0)}
for(let te=-.19;
te<=.191;
te+=.024){
let V=Math.sqrt(1-(te/.222)**2)*.165;
Oe.push(-V,.46+te,0,V,.46+te,0)}
Ne.add(new On(new st().setAttribute("position",new De(Oe,3)),new un({
color:"#e4e4cd",transparent:!0,opacity:.62}
))),Ar(Ne);
let le=[N,F,B,U,D,G,...Re.flatMap(te=>[te.shorts,te.hem,te.skin.mesh,te.sock,te.sockStripe,te.foot]),...Ye.flatMap(te=>[te.sleeve,te.cuff,te.skin.mesh,te.wristband,te.hand,te.thumb])],he="tennis",pe=null;
function me(te="tennis"){
te=te==="apollo"?"apollo":"tennis",te!==he&&(he=te,he==="apollo"&&!pe&&(pe=N_(n,s,e)),le.forEach(V=>{
V.visible=he==="tennis"}
),pe?.setVisible(he==="apollo"))}
function be(te,V,C,Q,z){
let A=[V*.225,Q,0],S=wt(...C).sub(wt(...A)),O=Math.max(.001,S.length()),W=S.normalize(),X=wt(V*.8,-.45,.9);
X.addScaledVector(W,-X.dot(W)).normalize();
let $=(.3**2-.285**2+O**2)/(2*O),oe=wt(...A).addScaledVector(W,$).addScaledVector(X,Math.sqrt(Math.max(0,.3**2-$**2))).toArray(),K=A.map((ue,Me)=>ue+(oe[Me]-ue)*.43),ee=[A[0]-V*.028,A[1]-.009,A[2]];
Wn(te.sleeve,ee,K),Wn(te.cuff,K.map((ue,Me)=>ue+(A[Me]-ue)*.09),K),he==="tennis"&&te.skin.update(K,oe,C),Wn(te.wristband,C.map((ue,Me)=>ue+(oe[Me]-ue)*.22),C.map((ue,Me)=>ue+(oe[Me]-ue)*.07)),te.hand.position.set(...C),te.hand.quaternion.setFromUnitVectors(cc,wt(...C).sub(wt(...oe)).normalize()),te.thumb.position.copy(te.hand.position).add(wt(-V*.025,.015,-.009).applyQuaternion(te.hand.quaternion)),te.thumb.quaternion.copy(te.hand.quaternion),he==="apollo"&&pe.updateArm(z,V,A,oe,C)}
function Ue(te,V){
_(te.appearance);
let C={
...te,slidePoseStatic:!!t?.matches,serveContactPoint:[.035*5.5/ko.x,(V.phase==="serveToss"?V.ball.z:te.strokeContactZ??.32+2.6**2/(2*(9.81/2.177)))*2.177/ko.y,-.04*8/ko.z],...te.strokeContactZ==null?{
}
:{
strokeContactZ:te.strokeContactZ/ko.y}
}
,Q=window.TennisPose.pose(C,V);
n.position.set(te.x*5.5,0,te.y*8),n.rotation.y=e?0:Math.PI,s.rotation.set(Q.leanX,Q.torsoYaw,Q.leanZ),s.position.copy(wt(0,Q.hipY,0).sub(wt(0,Q.hipY,0).applyQuaternion(s.quaternion)));
let z=Q.hipY-.91;
return N.position.y=1.18+z,F.position.y=Q.hipY,B.position.y=.982+z,U.position.y=1.439+z,D.position.y=1.48+z,G.position.set(0,Q.headY,0),G.rotation.y=Ln.clamp((V.ball.x-te.x)*(e?1:-1)*.2,-.22,.22)-Q.torsoYaw*.45,G.rotation.x=Q.mode==="smash"?.22:Q.mode==="toss"?.15:-.025,he==="apollo"&&pe.updateBody(Q,G),Q.legs.forEach((A,S)=>{
let O=Re[S],W=A.hip.map(($,oe)=>$+(A.knee[oe]-$)*.48);
Wn(O.shorts,A.hip,W),Wn(O.hem,W.map(($,oe)=>$+(A.hip[oe]-$)*.065),W);
let X=A.foot.map(($,oe)=>$+(A.knee[oe]-$)*.33);
he==="tennis"&&O.skin.update(W,A.knee,X),Wn(O.sock,X,A.foot),Wn(O.sockStripe,X.map(($,oe)=>$+(A.foot[oe]-$)*.11),X.map(($,oe)=>$+(A.foot[oe]-$)*.23)),O.foot.position.set(A.foot[0],A.foot[1]-.02,A.foot[2]-.042),O.foot.rotation.set(A.planted?0:-.2,(S?1:-1)*.07,0),he==="apollo"&&pe.updateLeg(S,A,O.foot)}
),be(Ye[0],-1,Q.left,Q.shoulderY,0),be(Ye[1],1,Q.right,Q.shoulderY,1),Ne.position.set(...Q.right),Ne.quaternion.setFromUnitVectors(cc,wt(...Q.racketDirection).normalize()),Q}
return{
root:n,update:Ue,getPoseDebug:te=>(n.updateMatrixWorld(!0),{
scale:n.scale.toArray(),feet:Re.map(V=>V.foot.getWorldPosition(wt()).toArray()),footBounds:Re.map(V=>{
let C=new qt().setFromObject(V.foot);
return{
min:C.min.toArray(),max:C.max.toArray()}
}
),racketStrings:Array.from({
length:16}
,(V,C)=>{
let Q=C*Math.PI/8;
return Ne.localToWorld(wt(Math.cos(Q)*.168,.46+Math.sin(Q)*.168*1.32,0)).toArray()}
),racketCenter:Ne.localToWorld(wt(0,.46,0)).toArray(),racketTop:Ne.localToWorld(wt(0,.67,0)).toArray(),ballInRacket:te?Ne.worldToLocal(te.clone()).toArray():null}
),setOutfit:me,getOutfit:()=>he,setAppearance:_,getAppearance:()=>({
skin:`#${d.color.getHexString()}`,shirt:`#${f.color.getHexString()}`,pants:`#${x.color.getHexString()}`,shoes:`#${g.color.getHexString()}`,racket:`#${ie.color.getHexString()}`}
)}
}
function bf(i,e){
let t=new je;
t.name=`character-${i.id}`;
let n={
skin:new qe({
color:e,roughness:.9}
),hair:new qe({
color:i.hairColor,roughness:.96}
),band:new qe({
color:i.bandColor,roughness:.9}
),eye:new qe({
color:"#f3efdf"}
),detail:new qe({
color:"#37281f"}
)}
,s=new Map;
function r(u,m,f=[1,1,1],p=[0,0,0],x=[0,0,0]){
let b=new ct().compose(new k(...p),new _t().setFromEuler(new Sn(...x)),new k(...f)),g=m.index?m.toNonIndexed():m.clone();
m.dispose(),g.applyMatrix4(b);
let h=s.get(u)||[];
h.push(g),s.set(u,h)}
let o=(u,m,f,p)=>r(u,new gt(1,12,8),m,f,p),a=new gt(1,20,14),l=a.attributes.position;
for(let u=0;
u<l.count;
u++){
let m=l.getY(u),f=l.getZ(u),p=1-Math.max(0,-m)*.23;
l.setXYZ(u,l.getX(u)*.106*p,m*.153,(f<0?Math.max(f,-.88):f)*.117-(m<-.3?.006:0))}
a.computeVertexNormals(),r("skin",a);
for(let u of[-1,1])o("skin",[.015,.027,.018],[u*.101,-.013,.001]),o("eye",[.012,.005,.003],[u*.038,.011,-.104]),o("detail",[.004,.0045,.003],[u*.038,.01,-.107]),o("hair",[.018,.004,.004],[u*.038,.029,-.103],[0,0,u*.09]);
o("skin",[.013,.024,.019],[0,-.014,-.111]),o("detail",[.019,.0025,.003],[0,-.063,-.106]);
let c=i.hair;
if(c!=="bald"){
let u=new gt(1,20,12,0,Math.PI*2,0,Math.PI*.6),m=u.attributes.position,f=["curly","wavy","long"].includes(c),p=c==="buzz";
for(let x=0;
x<m.count;
x++){
let b=m.getX(x),g=m.getY(x),h=m.getZ(x),M=Math.max(0,-h),T=M*Math.max(0,.5-g)*.075;
c==="receding"&&(T+=M*.044);
let d=f?1+.045*Math.sin(Math.atan2(h,b)*8+g*19):1;
c==="swept"&&(T+=Math.max(0,g)*(.015-b*.022)),c==="spiky"&&(T+=Math.max(0,g)*(.013+.009*Math.sin(b*27))),m.setXYZ(x,b*(f?.12:.11)*d,g*(p?.143:f?.147:.138)+(p?.015:.025)+T,h*(f?.13:.121)*d+.007)}
if(u.computeVertexNormals(),r("hair",u),c==="curly"||c==="wavy"||c==="long"){
let x=c==="curly"?16:12;
for(let b=0;
b<x;
b++){
let g=b/x*Math.PI*2,h=i.headwear==="cap"||i.headwear==="backward";
h&&Math.sin(g)<0||o("hair",c==="curly"?[.033,.037,.033]:[.033,.047,.032],[Math.cos(g)*.096,(h?.063:.094)+Math.sin(b*2.4)*.013,Math.sin(g)*.103+.014])}
if(c!=="curly")for(let b=0;
b<9;
b++){
let g=b/8*Math.PI;
o("hair",[.039,c==="long"?.116:.074,.037],[Math.cos(g)*.103,c==="long"?-.015:.012,Math.sin(g)*.104+.02],[0,0,Math.cos(g)*.13])}
}
}
if(i.beard!=="none"){
let u=i.beard==="goatee",m=i.beard==="beard";
for(let f=0;
f<(u?5:13);
f++){
let p=u?-.35+f*.175:-1.25+f*2.5/12;
o("hair",[m?.027:.019,m?.032:.018,.009],[Math.sin(p)*.078,-.096+Math.abs(Math.sin(p))*.039,-Math.cos(p)*.098-.004])}
o("hair",[u?.022:.031,.005,.005],[0,-.05,-.109])}
if(i.headwear==="band")r("band",new St(1,1,1,24,1,!0),[.115,.032,.128],[0,.062,0],[-.06,0,0]),o("band",[.021,.023,.019],[.066,.058,.115]),r("band",new Mt(.018,.085,.008),[1,1,1],[.065,.015,.128],[.18,0,.25]),r("band",new Mt(.016,.064,.008),[1,1,1],[.088,.025,.12],[.14,0,-.2]);
else if(i.headwear==="cap"||i.headwear==="backward"){
r("band",new gt(1,20,10,0,Math.PI*2,0,Math.PI/2),[.126,.13,.14],[0,.071,0]);
let u=i.headwear==="backward"?1:-1;
o("band",[.114,.009,.108],[0,.075,u*.129],[u*.1,0,0])}
for(let[u,m]of s){
let f=vt(m);
m.forEach(x=>x.dispose());
let p=new ot(f,n[u]);
p.castShadow=p.receiveShadow=!0,t.add(p)}
return t.scale.set(i.faceWidth,i.faceLength,1),{
root:t,dispose(){
t.removeFromParent(),t.traverse(u=>u.geometry?.dispose()),Object.values(n).forEach(u=>u.dispose())}
}
}
var bt=(i=0,e=0,t=0)=>new k(i,e,t),hc=bt(0,1,0),Vo=bt(.88,.94,.88),tn=(i,e=.83)=>new qe({
color:i,roughness:e}
);
function Xt(i,e,t,n=[0,0,0]){
let s=new ot(i,e);
return s.position.set(...n),s.castShadow=s.receiveShadow=!0,t.add(s),s}
function Xn(i,e,t){
let n=bt(...e),s=bt(...t),r=s.clone().sub(n);
i.position.copy(n.add(s).multiplyScalar(.5)),i.scale.y=Math.max(.001,r.length()),i.quaternion.setFromUnitVectors(hc,r.normalize())}
function Rr(i){
let e=new Map;
for(let t of i.children){
if(!t.isMesh)continue;
let n=e.get(t.material)||[];
n.push(t),e.set(t.material,n)}
for(let[t,n]of e){
if(n.length<2)continue;
let s=n.map(o=>(o.updateMatrix(),(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrix))),r=vt(s);
s.forEach(o=>o.dispose()),r&&(n.forEach(o=>i.remove(o)),Xt(r,t,i))}
}
function Ji(i,e=24){
let t=[],n=[],s=[],r=e+1;
i.forEach(([l,c,u],m)=>{
for(let f=0;
f<=e;
f++){
let p=f/e*Math.PI*2;
t.push(Math.cos(p)*c,l,Math.sin(p)*u),n.push(1-f/e,(l-i[0][0])/(i.at(-1)[0]-i[0][0]))}
}
);
for(let l=0;
l<i.length-1;
l++)for(let c=0;
c<e;
c++){
let u=l*r+c,m=u+1,f=u+r,p=f+1;
s.push(u,f,m,m,f,p)}
for(let[l,c]of[[0,!0],[i.length-1,!1]]){
let u=t.length/3;
t.push(0,i[l][0],0),n.push(.5,c?0:1);
for(let m=0;
m<e;
m++){
let f=l*r+m,p=f+1;
s.push(u,c?f:p,c?p:f)}
}
let o=new st;
o.setAttribute("position",new De(t,3)),o.setAttribute("uv",new De(n,2)),o.setIndex(s),o.computeVertexNormals();
let a=o.attributes.normal;
for(let l=0;
l<i.length;
l++){
let c=l*r,u=c+e,m=bt(a.getX(c)+a.getX(u),a.getY(c)+a.getY(u),a.getZ(c)+a.getZ(u)).normalize();
a.setXYZ(c,m.x,m.y,m.z),a.setXYZ(u,m.x,m.y,m.z)}
return o}
function Wo(i){
let e=new We(i);
return e.r*.2126+e.g*.7152+e.b*.0722>.32?"#214b3e":"#f3efdf"}
function Mf(i,e,t){
let n=document.createElement("canvas");
n.width=1024,n.height=512;
let s=n.getContext("2d");
s.fillStyle=e,s.fillRect(0,0,1024,512),s.globalAlpha=.065,s.fillStyle=t;
for(let o=0;
o<512;
o+=4)for(let a=o%8?2:0;
a<1024;
a+=4)s.fillRect(a,o,1,2);
s.globalAlpha=1;
for(let o of[0,512,1024])s.fillStyle=t,s.beginPath(),s.moveTo(o-24,512),s.lineTo(o-10,90),s.lineTo(o+10,90),s.lineTo(o+24,512),s.fill(),s.globalAlpha=.3,s.fillRect(o-29,140,2,350),s.fillRect(o+27,140,2,350),s.globalAlpha=1;
s.fillStyle=t,s.fillRect(89,145,333,25),s.globalAlpha=.55,s.fillRect(89,179,333,5),s.globalAlpha=1,s.font="bold 29px Arial",s.textAlign="center",s.fillText("TOP TENNIS",256,134),s.font="bold 24px Arial",s.fillText("WORLD COURT",768,142),s.font="bold 115px Arial",s.fillText(i?"01":"02",768,285),s.fillRect(716,310,104,5);
let r=new Hn(n);
return r.colorSpace=Nt,r.anisotropy=4,r}
function Sf(i,e,t){
let o=new Float32Array(507),a=[];
for(let h=0;
h<12;
h++)for(let M=0;
M<12;
M++){
let T=h*13+M,d=T+13;
a.push(T,T+1,d,T+1,d+1,d)}
let l=new st;
l.setAttribute("position",new ft(o,3).setUsage(xs)),l.setAttribute("normal",new ft(new Float32Array(o.length),3).setUsage(xs)),l.setIndex(a);
let c=Xt(l,e,i);
c.frustumCulled=!1;
let u=new yn([bt(),bt(),bt()],!1,"centripetal"),m=bt(),f=bt(),p=bt(),x=bt(),b=bt(),g=Array.from({
length:13}
,(h,M)=>[Math.cos(M/12*Math.PI*2),Math.sin(M/12*Math.PI*2)*.94]);
return{
mesh:c,update(h,M,T){
u.points[0].fromArray(h),u.points[1].fromArray(M),u.points[2].fromArray(T);
for(let y=0;
y<=12;
y++){
let v=y/12;
u.getPoint(v,m),u.getTangent(v,f).normalize(),p.set(Math.abs(f.z)<.9?0:1,0,Math.abs(f.z)<.9?1:0).cross(f).normalize(),x.crossVectors(f,p).normalize();
let E=v*(t.length-1),_=Math.min(t.length-2,Math.floor(E)),w=Ln.lerp(t[_],t[_+1],E-_);
for(let R=0;
R<=12;
R++){
let[I,P]=g[R],N=(y*13+R)*3;
o[N]=m.x+w*(p.x*I+x.x*P),o[N+1]=m.y+w*(p.y*I+x.y*P),o[N+2]=m.z+w*(p.z*I+x.z*P)}
}
l.attributes.position.needsUpdate=!0,l.computeVertexNormals();
let d=l.attributes.normal;
for(let y=0;
y<=12;
y++){
let v=y*13,E=v+12;
b.set(d.getX(v)+d.getX(E),d.getY(v)+d.getY(E),d.getZ(v)+d.getZ(E)).normalize(),d.setXYZ(v,b.x,b.y,b.z),d.setXYZ(E,b.x,b.y,b.z)}
d.needsUpdate=!0}
}
}
function U_(i,e,t){
let n=tn("#eeeae0",.88),s=tn("#b6b8b2",.82),r=tn("#424b4f",.84),o=tn(t?"#b94032":"#3c6488",.78),a=tn("#ccd0cb",.38),l=new qe({
color:"#bc8835",metalness:.58,roughness:.25,emissive:"#453316",emissiveIntensity:.16}
),c=[],u=U=>{
let D=new je;
return U.add(D),c.push(D),D}
,m=new gt(1,16,12),f=(U,D,G,H=[0,0,0])=>{
let Y=Xt(m,D,U,H);
return Y.scale.set(...G),Y}
,p=(U,D,G,H,Y=.02)=>Xt(new _s(...D,2,Y),H,U,G),x=(U,D,G,H)=>Xt(Ji([[-.5,G*.78,G*.78],[-.4,G,G*.94],[-.16,G*1.04,G*.97],[.16,H*1.04,H*.97],[.4,H,H*.94],[.5,H*.8,H*.8]],16),D,U),b=(U,D,G)=>Xt(new St(G,G,1,16),D,U),g=(U,D,G,H,Y)=>{
let q=Xt(new Qt(D,G,6,20),H,U,Y);
return q.rotation.x=Math.PI/2,q}
,h=u(e);
h.name="apollo-pressure-suit",Xt(Ji([[-.28,.195,.144],[-.22,.229,.16],[-.07,.245,.164],[.12,.274,.166],[.2,.261,.151],[.26,.17,.117]],20),n,h,[0,1.18,0]),p(h,[.39,.24,.27],[0,.94,.006],n,.08),g(h,.127,.022,a,[0,1.447,0]),g(h,.123,.012,r,[0,1.464,0]),p(h,[.37,.47,.19],[0,1.205,.232],n,.045),p(h,[.3,.105,.17],[0,1.505,.228],n,.028),p(h,[.345,.035,.199],[0,1.335,.239],s,.008),p(h,[.345,.026,.199],[0,1.065,.239],s,.006);
for(let U of[-1,1]){
let D=p(h,[.034,.4,.024],[U*.176,1.207,-.151],s,.008);
D.rotation.z=U*.1,f(h,o,[.037,.037,.009],[U*.093,1.335,-.159]),f(h,a,[.031,.031,.014],[U*.116,1.074,-.167]),f(h,r,[.017,.017,.016],[U*.116,1.074,-.178])}
p(h,[.128,.09,.035],[0,1.255,-.172],n,.015),p(h,[.081,.022,.008],[0,1.26,-.194],o,.004);
let M=new yn([bt(.12,1.075,-.183),bt(.23,.998,-.153),bt(.285,1.02,.015),bt(.24,1.16,.224)]);
Xt(new Gn(M,16,.019,6,!1),a,h);
let T=document.createElement("canvas");
T.width=256,T.height=128;
let d=T.getContext("2d");
d.fillStyle="#eeeae0",d.fillRect(0,0,256,128);
for(let U=0;
U<13;
U++)d.fillStyle=U%2?"#f5eee1":"#ad382e",d.fillRect(8,8+U*6,114,6);
d.fillStyle="#284b74",d.fillRect(8,8,50,42),d.fillStyle="#fff";
for(let U=13;
U<48;
U+=7)for(let D=13;
D<55;
D+=8)d.fillRect(D,U,2,2);
d.fillStyle=t?"#a6342a":"#355c80",d.font="bold 72px Arial",d.textAlign="center",d.fillText(t?"01":"02",192,83);
let y=new Hn(T);
y.colorSpace=Nt;
let v=tn("#ffffff");
v.map=y;
let E=Xt(new Kt(.28,.14),v,h,[0,1.208,.337]),_=Xt(new Kt(.13,.065),v,h,[0,1.378,-.159]);
_.rotation.y=Math.PI,Rr(h);
let w=u(e);
w.name="apollo-helmet",f(w,n,[.191,.206,.182],[0,.01,.006]),f(w,r,[.166,.154,.086],[0,.014,-.116]),f(w,l,[.151,.139,.078],[0,.017,-.13]);
let R=Xt(new Qt(.157,.015,6,20,Math.PI),n,w,[0,.059,-.115]);
R.scale.y=.7;
for(let U of[-1,1])f(w,a,[.013,.034,.034],[U*.181,.035,-.02]);
Rr(w);
function I(){
let U=u(e),D=x(U,n,.095,.08),G=x(U,n,.08,.061),H=f(U,n,[.083,.082,.08]),Y=f(U,n,[.105,.102,.1]),q=b(U,o,.102),Se=x(U,a,.063,.063),ye=f(U,n,[.049,.061,.04]),Re=f(U,n,[.023,.034,.022]);
return{
upper:D,lower:G,elbow:H,shoulder:Y,band:q,cuff:Se,hand:ye,thumb:Re}
}
function P(){
let U=u(i),D=new je;
return U.add(D),p(D,[.165,.105,.31],[0,.005,-.025],n,.04),p(D,[.152,.19,.145],[0,.093,.036],n,.03),p(D,[.17,.035,.32],[0,-.046,-.026],r,.013),p(D,[.157,.035,.16],[0,.157,.034],s,.012),p(D,[.138,.035,.018],[0,.035,-.178],s,.004),Rr(D),{
upper:x(U,n,.121,.103),lower:x(U,n,.1,.077),knee:f(U,n,[.105,.106,.102]),band:b(U,o,.13),boot:D}
}
let N=[I(),I()],F=[P(),P()],B=(U,D,G)=>U.map((H,Y)=>H+(D[Y]-H)*G);
return{
setVisible(U){
c.forEach(D=>{
D.visible=U}
)}
,updateBody(U,D){
h.position.y=U.hipY-.91,w.position.copy(D.position),w.rotation.copy(D.rotation)}
,updateArm(U,D,G,H,Y){
let q=N[U];
Xn(q.upper,G,H),Xn(q.lower,H,Y),q.shoulder.position.set(...G),q.elbow.position.set(...H),Xn(q.band,B(G,H,.25),B(G,H,.39)),Xn(q.cuff,B(H,Y,.82),B(H,Y,.94)),q.hand.position.set(...Y),q.hand.quaternion.setFromUnitVectors(hc,bt(...Y).sub(bt(...H)).normalize()),q.thumb.position.copy(q.hand.position).add(bt(-D*.031,.018,-.01).applyQuaternion(q.hand.quaternion)),q.thumb.quaternion.copy(q.hand.quaternion)}
,updateLeg(U,D,G){
let H=F[U];
Xn(H.upper,D.hip,D.knee),Xn(H.lower,D.knee,D.foot),H.knee.position.set(...D.knee),Xn(H.band,B(D.hip,D.knee,.28),B(D.hip,D.knee,.4)),H.boot.position.copy(G.position),H.boot.rotation.copy(G.rotation)}
}
}
function Ef(i,e){
let t=new je;
t.name=e?"player-athlete":"rival-athlete",i.add(t),t.scale.copy(Vo);
let n=new je;
t.add(n);
let s=e?"player":"ai",r={
skin:e?"#c9926d":"#805039",shirt:e?"#f3f0dc":"#db582f",pants:e?"#214b3e":"#25364d",shoes:"#f3f0dc",racket:"#1d2927"}
,o=z=>({
...r,...window.TennisAppearance?.resolve(z,s)}
),a=o(),l=tn("#f3efdf"),c=tn("#214b3e"),u=tn(e?"#d0bc70":"#f1d8ac"),m=tn(a.shirt),f=tn(Wo(a.shirt)),p=tn(a.pants),x=tn(a.pants);
x.color.multiplyScalar(.75);
let b=tn(a.shoes),g=tn(Wo(a.shoes)),h=e?c:tn("#db582f"),M=tn("#ffffff");
M.map=Mf(e,a.shirt,Wo(a.shirt));
let T=tn(a.skin,.9),d=tn(e?"#30281f":"#211e1c",.96),y=tn("#352820"),v=tn(a.skin);
v.color.multiplyScalar(.5);
function E(z){
let A=o(z);
if(A.skin!==a.skin&&(T.color.set(A.skin),v.color.set(A.skin).multiplyScalar(.5)),A.shirt!==a.shirt){
let S=Wo(A.shirt),O=M.map;
m.color.set(A.shirt),f.color.set(S),M.map=Mf(e,A.shirt,S),M.needsUpdate=!0,O.dispose()}
A.pants!==a.pants&&(p.color.set(A.pants),x.color.set(A.pants).multiplyScalar(.75)),A.shoes!==a.shoes&&(b.color.set(A.shoes),g.color.set(Wo(A.shoes))),A.racket!==a.racket&&ge.color.set(A.racket),a=A}
let _=new gt(1,16,10),w=(z,A,S,O=[0,0,0])=>{
let W=Xt(_,A,z,O);
return W.scale.set(...S),W}
,R=(z,A,S,O,W=.015)=>Xt(new _s(...A,2,W),O,z,S),I=(z,A,S,O)=>Xt(Ji([[-.5,S*.9,S*.85],[-.41,S,S*.94],[-.1,S*1.01,S*.96],[.24,O*1.03,O*.95],[.46,O,O*.92],[.5,O*.93,O*.87]],16),A,z),P=Xt(Ji([[-.25,.164,.109],[-.23,.177,.118],[-.13,.179,.119],[-.02,.197,.131],[.09,.222,.139],[.16,.236,.132],[.205,.215,.116],[.24,.14,.09],[.26,.08,.07]]),M,n,[0,1.18,0]),N=Xt(Ji([[-.095,.154,.096],[-.065,.173,.116],[.07,.176,.118],[.105,.165,.108]]),p,n,[0,.91,0]),F=Xt(Ji([[-.012,.175,.114],[.012,.175,.114]]),p,n),B=Xt(new Qt(.077,.009,6,24),f,n);
B.rotation.x=Math.PI/2,B.scale.z=.85;
let U=w(n,T,[.057,.081,.061]),D=new je;
n.add(D);
let G=new gt(1,24,16),H=G.attributes.position;
for(let z=0;
z<H.count;
z++){
let A=H.getY(z),S=1-Math.max(0,-A)*.23,O=H.getZ(z),W=O<0?Math.max(O,-.88):O;
H.setXYZ(z,H.getX(z)*.106*S,A*.153,W*.117-(A<-.3?.006:0))}
G.computeVertexNormals(),Xt(G,T,D);
let Y=new gt(1,24,12,0,Math.PI*2,0,Math.PI*.6),q=Y.attributes.position;
for(let z=0;
z<q.count;
z++){
let A=q.getX(z),S=q.getY(z),O=q.getZ(z),X=Math.max(0,-O)*Math.max(0,.5-S)*.065;
q.setXYZ(z,A*.11,S*.134+.029+X+Math.max(0,S)*A*.012,O*.121+.007)}
Y.computeVertexNormals(),Xt(Y,d,D);
for(let z of[-1,1]){
w(D,T,[.015,.027,.018],[z*.101,-.013,.001]),w(D,v,[.005,.014,.009],[z*.112,-.013,-.005]),w(D,l,[.012,.005,.003],[z*.038,.011,-.104]),w(D,y,[.004,.0045,.003],[z*.038,.01,-.107]);
let A=w(D,d,[.017,.0035,.003],[z*.038,.027,-.103]);
A.rotation.z=z*.09}
if(w(D,T,[.012,.024,.017],[0,-.014,-.111]),w(D,v,[.02,.003,.003],[0,-.06,-.105]),e){
let z=Xt(Ji([[-.015,.112,.122],[.015,.112,.122]],24),c,D,[0,.061,0]);
z.rotation.x=-.07,R(D,[.035,.016,.006],[0,.06,-.121],u,.003);
let A=w(D,c,[.024,.023,.018],[.07,.053,.103]);
A.rotation.z=-.3}
Rr(D);
let Se=new je;
for(let z of[...D.children])Se.add(z);
D.add(Se);
let ye=null,Re=null,Ye="";
function Ne(z){
let A=window.TennisCharacters?.get(z)||null,S=A?A.id+":"+a.skin:"";
if(S!==Ye){
Ye=S,ye=A,Re?.dispose(),Re=null,Se.visible=!ye,ye&&(Re=bf(ye,a.skin),D.add(Re.root)),P.scale.x=ye?.build||1,N.scale.x=F.scale.x=1+((ye?.build||1)-1)*.5;
for(let O of j)O.sleeve.material=ye?.sleeveless?T:m,O.cuff.material=ye?.sleeveless?T:f}
}
function ie(){
let z=new je;
t.add(z);
let A=[[-.164,.015,.014],[-.144,.061,.032],[-.1,.075,.039],[-.035,.069,.061],[.035,.055,.074],[.102,.054,.052],[.12,.025,.029]],S=Ji(A,20);
S.rotateX(Math.PI/2);
let O=S.attributes.position;
for(let K=0;
K<A.length;
K++)for(let ee=0;
ee<=20;
ee++){
let ue=K*21+ee;
O.setY(ue,O.getY(ue)+A[K][2]-.058)}
O.setY(A.length*21,A[0][2]-.058),O.setY(A.length*21+1,A.at(-1)[2]-.058),S.computeVertexNormals(),Xt(S,b,z,[0,.018,0]);
let W=[[-.169,.014],[-.151,.058],[-.115,.077],[-.06,.078],[0,.067],[.07,.06],[.116,.055],[.128,.022]],X=(K,ee,ue)=>{
let Me=Ji(W.map(([Ae,Ee])=>[Ae,Ee,K]),20);
Me.rotateX(Math.PI/2),Xt(Me,ee,z,[0,ue,0])}
;
X(.012,l,-.045),X(.005,c,-.062);
let $=R(z,[.066,.012,.09],[0,.058,-.03],b,.008);
$.rotation.x=.28;
for(let K of[-1,1]){
let ee=R(z,[.008,.026,.089],[K*.067,.006,-.032],g,.004);
ee.rotation.x=-.16}
let oe=[];
for(let K=0;
K<4;
K++){
let ee=-.061+K*.016,ue=.054+K*.005;
oe.push(-.026,ue,ee,.026,ue,ee)}
return z.add(new On(new st().setAttribute("position",new De(oe,3)),new un({
color:"#c0bdaa"}
))),Rr(z),z.scale.set(.93,1,.92),z}
let ce=[-1,1].map(()=>({
shorts:I(t,p,.102,.095),hem:I(t,x,.094,.094),skin:Sf(t,T,[.083,.077,.061,.066,.047]),sock:I(t,l,.049,.051),sockStripe:I(t,h,.052,.052),foot:ie()}
)),j=[-1,1].map(()=>({
sleeve:I(n,m,.076,.065),cuff:I(n,f,.065,.065),skin:Sf(n,T,[.059,.055,.044,.048,.03]),wristband:I(n,l,.041,.041),hand:w(n,T,[.038,.049,.03]),thumb:w(n,T,[.019,.029,.019])}
)),de=new je;
n.add(de);
let ge=tn(a.racket,.5),Te=tn(e?"#ceba71":"#f07c47",.45);
R(de,[.037,.184,.034],[0,.068,0],l,.008);
let Oe=[];
for(let z=0;
z<7;
z++)Oe.push(-.02,-.012+z*.025,.02,.02,.003+z*.025,.02);
de.add(new On(new st().setAttribute("position",new De(Oe,3)),new un({
color:"#b8b8a8"}
)));
let le=(z,A,S)=>Xt(new Gn(new yn(z),16,S,8,!1),A,de);
le([bt(-.1,.34,0),bt(-.025,.19,0),bt(0,.14,0)],ge,.012),le([bt(.1,.34,0),bt(.025,.19,0),bt(0,.14,0)],ge,.012);
let he=Xt(new Qt(.168,.013,10,48),ge,de,[0,.46,0]);
he.scale.y=1.32;
let pe=Xt(new Qt(.169,.004,6,48),Te,de,[0,.46,-.011]);
pe.scale.y=1.32;
let me=[];
for(let z=-.14;
z<=.141;
z+=.025){
let A=Math.sqrt(1-(z/.168)**2)*.217;
me.push(z,.46-A,0,z,.46+A,0)}
for(let z=-.19;
z<=.191;
z+=.024){
let A=Math.sqrt(1-(z/.222)**2)*.165;
me.push(-A,.46+z,0,A,.46+z,0)}
de.add(new On(new st().setAttribute("position",new De(me,3)),new un({
color:"#e4e4cd",transparent:!0,opacity:.62}
))),Rr(de);
let be=[P,N,F,B,U,D,...ce.flatMap(z=>[z.shorts,z.hem,z.skin.mesh,z.sock,z.sockStripe,z.foot]),...j.flatMap(z=>[z.sleeve,z.cuff,z.skin.mesh,z.wristband,z.hand,z.thumb])],Ue="tennis",ke=null;
function te(z="tennis"){
z=z==="apollo"?"apollo":"tennis",z!==Ue&&(Ue=z,Ue==="apollo"&&!ke&&(ke=U_(t,n,e)),be.forEach(A=>{
A.visible=Ue==="tennis"}
),ke?.setVisible(Ue==="apollo"))}
function V(z,A,S,O,W){
let X=[A*.225,O,0],$=bt(...S).sub(bt(...X)),oe=Math.max(.001,$.length()),K=$.normalize(),ee=bt(A*.8,-.45,.9);
ee.addScaledVector(K,-ee.dot(K)).normalize();
let ue=(.3**2-.285**2+oe**2)/(2*oe),Me=bt(...X).addScaledVector(K,ue).addScaledVector(ee,Math.sqrt(Math.max(0,.3**2-ue**2))).toArray(),Ae=X.map((_e,He)=>_e+(Me[He]-_e)*.43),Ee=[X[0]-A*.028,X[1]-.009,X[2]];
Xn(z.sleeve,Ee,Ae),Xn(z.cuff,Ae.map((_e,He)=>_e+(X[He]-_e)*.09),Ae),Ue==="tennis"&&z.skin.update(Ae,Me,S),Xn(z.wristband,S.map((_e,He)=>_e+(Me[He]-_e)*.22),S.map((_e,He)=>_e+(Me[He]-_e)*.07)),z.hand.position.set(...S),z.hand.quaternion.setFromUnitVectors(hc,bt(...S).sub(bt(...Me)).normalize()),z.thumb.position.copy(z.hand.position).add(bt(-A*.025,.015,-.009).applyQuaternion(z.hand.quaternion)),z.thumb.quaternion.copy(z.hand.quaternion),Ue==="apollo"&&ke.updateArm(W,A,X,Me,S)}
function C(z,A){
E(z.appearance),Ne(z.characterId);
let S={
...z,serveContactPoint:[.035*5.5/Vo.x,(A.phase==="serveToss"?A.ball.z:z.strokeContactZ??.32+2.6**2/(2*(9.81/2.177)))*2.177/Vo.y,-.04*8/Vo.z],...z.strokeContactZ==null?{
}
:{
strokeContactZ:z.strokeContactZ/Vo.y}
}
,O=window.TennisPose.pose(S,A);
t.position.set(z.x*5.5,0,z.y*8),t.rotation.y=e?0:Math.PI,n.rotation.set(O.leanX,O.torsoYaw,O.leanZ),n.position.copy(bt(0,O.hipY,0).sub(bt(0,O.hipY,0).applyQuaternion(n.quaternion)));
let W=O.hipY-.91;
return P.position.y=1.18+W,N.position.y=O.hipY,F.position.y=.982+W,B.position.y=1.439+W,U.position.y=1.48+W,D.position.set(0,O.headY,0),D.rotation.y=Ln.clamp((A.ball.x-z.x)*(e?1:-1)*.2,-.22,.22)-O.torsoYaw*.45,D.rotation.x=O.mode==="smash"?.22:O.mode==="toss"?.15:-.025,Ue==="apollo"&&ke.updateBody(O,D),O.legs.forEach((X,$)=>{
let oe=ce[$],K=X.hip.map((ue,Me)=>ue+(X.knee[Me]-ue)*.48);
Xn(oe.shorts,X.hip,K),Xn(oe.hem,K.map((ue,Me)=>ue+(X.hip[Me]-ue)*.065),K);
let ee=X.foot.map((ue,Me)=>ue+(X.knee[Me]-ue)*.33);
Ue==="tennis"&&oe.skin.update(K,X.knee,ee),Xn(oe.sock,ee,X.foot),Xn(oe.sockStripe,ee.map((ue,Me)=>ue+(X.foot[Me]-ue)*.11),ee.map((ue,Me)=>ue+(X.foot[Me]-ue)*.23)),oe.foot.position.set(X.foot[0],X.foot[1]-.02,X.foot[2]-.042),oe.foot.rotation.set(X.planted?0:-.2,($?1:-1)*.07,0),Ue==="apollo"&&ke.updateLeg($,X,oe.foot)}
),V(j[0],-1,O.left,O.shoulderY,0),V(j[1],1,O.right,O.shoulderY,1),de.position.set(...O.right),de.quaternion.setFromUnitVectors(hc,bt(...O.racketDirection).normalize()),O}
return{
root:t,update:C,getPoseDebug:z=>(t.updateMatrixWorld(!0),{
scale:t.scale.toArray(),feet:ce.map(A=>A.foot.getWorldPosition(bt()).toArray()),footBounds:ce.map(A=>{
let S=new qt().setFromObject(A.foot);
return{
min:S.min.toArray(),max:S.max.toArray()}
}
),racketStrings:Array.from({
length:16}
,(A,S)=>{
let O=S*Math.PI/8;
return de.localToWorld(bt(Math.cos(O)*.168,.46+Math.sin(O)*.168*1.32,0)).toArray()}
),racketCenter:de.localToWorld(bt(0,.46,0)).toArray(),racketTop:de.localToWorld(bt(0,.67,0)).toArray(),ballInRacket:z?de.worldToLocal(z.clone()).toArray():null}
),setOutfit:te,getOutfit:()=>Ue,getCharacter:()=>ye?.id||null,setAppearance:E,getAppearance:()=>({
skin:`#${T.color.getHexString()}`,shirt:`#${m.color.getHexString()}`,pants:`#${p.color.getHexString()}`,shoes:`#${b.color.getHexString()}`,racket:`#${ge.color.getHexString()}`}
)}
}
var F_="v2";
function B_(i=globalThis.location?.search||""){
let e=new URLSearchParams(i).get("playerAsset");
return e==="legacy"||e==="v2"?e:F_}
function Yh(i,e){
let t=B_(),n=(t==="legacy"?vf:Ef)(i,e);
n.root.userData.playerAsset=t;
let s=gf(i,e),r=n.update,o="3d";
return n.setStyle=a=>{
o=a==="2d"?"2d":"3d"}
,n.getSpriteDebug=s.debug,n.setSkin=s.setSkin,n.heldBallPosition=s.heldBallPosition,n.update=(a,l,c=null)=>{
let u=r(a,l);
return n.root.visible=!s.update(a,l,o==="2d",c),u}
,n}
var Pt=i=>{
let e=Math.sin(i*91.731+17.38)*43758.5453;
return e-Math.floor(e)}
,Mi=(i,e,t)=>new k(i,e,t),sn=(i,e={
}
)=>new qe({
color:i,roughness:.87,...e}
);
function uc(i,e){
let t=document.createElement("canvas");
t.width=t.height=i,e(t.getContext("2d"),i);
let n=new Hn(t);
return n.colorSpace=Nt,n.anisotropy=4,n}
function O_(i){
let e=new Map,t=(o,a)=>{
let l=o.index?o.toNonIndexed():o;
l!==o&&o.dispose();
let c=e.get(a)||[];
c.push(l),e.set(a,c)}
;
return{
add:t,box:(o,a,l,c=0)=>{
let u=new Mt(...o);
u.rotateY(c),u.translate(...a),t(u,l)}
,ellipsoid:(o,a,l,c=0)=>{
let u=new gt(1,12,8);
u.scale(...o),u.rotateY(c),u.translate(...a),t(u,l)}
,beam:(o,a,l,c,u=l)=>{
o=Mi(...o),a=Mi(...a);
let m=a.clone().sub(o),f=new St(u,l,m.length(),10);
f.applyQuaternion(new _t().setFromUnitVectors(Mi(0,1,0),m.normalize())),f.translate(...o.add(a).multiplyScalar(.5).toArray()),t(f,c)}
,finish(){
for(let[o,a]of e){
let l=new ot(vt(a),o);
l.castShadow=!o.transparent,l.receiveShadow=!0,i.add(l),a.forEach(c=>c.dispose())}
}
}
}
function H_(i=!1){
let e=uc(1024,(t,n)=>{
t.fillStyle=i?"#dfcda4":"#d8a877",t.fillRect(0,0,n,n);
for(let s=-12;
s<100;
s++){
let r=s*13;
t.beginPath();
for(let o=0;
o<=n;
o+=8){
let a=r+Math.sin(o*.008+s*.1)*9+Math.sin(o*.023+s*.3)*1.7;
o?t.lineTo(o,a):t.moveTo(o,a)}
t.strokeStyle=i?"rgba(166,145,107,.095)":"rgba(145,94,51,.17)",t.lineWidth=1.5,t.stroke(),t.translate(0,2),t.strokeStyle=i?"rgba(255,247,218,.12)":"rgba(255,222,174,.15)",t.lineWidth=2.1,t.stroke(),t.translate(0,-2)}
for(let s=0;
s<85e3;
s++){
t.fillStyle=s%3?"rgba(111,85,52,.05)":"rgba(255,245,211,.20)";
let r=s%9===0?1.5:.7;
t.fillRect(Pt(s)*n,Pt(s+32001)*n,r,r)}
for(let s=0;
s<90;
s++){
let r=Pt(s+381)*n,o=Pt(s+780)*n,a=8+Pt(s+812)*40,l=t.createRadialGradient(r,o,0,r,o,a);
l.addColorStop(0,i?"rgba(255,252,232,.05)":"rgba(188,130,74,.07)"),l.addColorStop(1,"rgba(220,174,117,0)"),t.fillStyle=l,t.fillRect(r-a,o-a,a*2,a*2)}
}
);
return e.wrapS=e.wrapT=Kn,e.repeat.set(9,9),e}
function z_(){
let i=uc(256,(e,t)=>{
e.fillStyle="#c2a57a",e.fillRect(0,0,t,t);
for(let n=0;
n<145;
n++){
e.strokeStyle=`rgba(${n%2?"87,66,42":"250,224,179"},${.05+Pt(n)*.1})`,e.lineWidth=.35+Pt(n+43)*1.3,e.beginPath();
let s=Pt(n+318)*t;
e.moveTo(s,0),e.bezierCurveTo(s+3,70,s-4,180,s+Pt(n)*3,t),e.stroke()}
}
);
return i.wrapS=i.wrapT=Kn,i}
function Af(i,e,t){
let n=new ot(e,t);
return n.receiveShadow=!0,i.add(n),n}
function Tf(i,e=!1){
let t=new Kt(76,76,240,190);
t.rotateX(-Math.PI/2);
let n=t.attributes.position,s=t.attributes.uv,r=[],o=new We,a=(u,m)=>{
let f=Math.abs(u)/38;
return Math.sign(u)*(f<.72?f/.72*m:m+(f-.72)/.28*(38-m))}
;
for(let u=0;
u<n.count;
u++){
let m=a(n.getX(u),12),f=a(n.getZ(u),16),p=Math.max(Math.abs(m)-8,Math.abs(f)-11,0);
n.setX(u,m),n.setZ(u,f),s.setXY(u,(m+38)/76,(38-f)/76);
let x=1-Math.exp(-p*.14),b=.5+.5*Math.sin(m*.3+f*.15+1.3*Math.sin(f*.085)),g=Math.max(0,Math.abs(m)-8.1),h=1-Math.exp(-g*g*7),M=f+(m<0?1.8:0),T=.63+.19*Math.sin(M*.47)+.07*Math.sin(M*.94),y=(.06+1.05*Math.exp(-Math.pow((M+5)/2.1,2))+.93*Math.exp(-Math.pow((M-1.1)/2,2))+1.1*Math.exp(-Math.pow((M-8)/2.5,2)))*Math.exp(-Math.pow((g-T)/.8,2))*h*1.25,v=e?.045*Math.sin(m*.42+f*.13):Math.pow(b,2)*2+.22*Math.sin(m*.43-f*.25),E=e?Math.max(0,Math.min(1,(Xo(f)-m)/1.2)):1,_=(1-Ln.smoothstep(Math.abs(f+6.65),1.6,2.3))*(1-Ln.smoothstep(Math.abs(m+9.6),1,1.8)),w=Math.exp(-Math.pow((m-8.25)/.38,4)-Math.pow((f-5.4)/1.02,4));
n.setY(u,-.065+(x*v*E+(e?0:y))*(e?1:(1-_)*(1-w))),o.set("#ffffff"),o.multiplyScalar(1-.07*x+.035*Math.sin(m*.21+f*.16)*x-(e?0:Math.min(.15,y*.11))),r.push(o.r,o.g,o.b)}
t.setAttribute("color",new De(r,3)),t.computeVertexNormals();
let l=H_(e),c=uc(512,(u,m)=>{
let f=u.createImageData(m,m);
for(let p=0;
p<m;
p++)for(let x=0;
x<m;
x++){
let b=p*.36+1.4*Math.sin(x*.015)+.23*Math.sin(x*.068),g=128+85*Math.sin(b)+12*Math.sin(b*2),h=(p*m+x)*4;
f.data[h]=f.data[h+1]=f.data[h+2]=g,f.data[h+3]=255}
u.putImageData(f,0,0)}
);
return c.colorSpace=bi,c.wrapS=c.wrapT=Kn,c.repeat.set(9,9),Af(i,t,sn("#ffffff",{
map:l,bumpMap:c,bumpScale:e?.009:.034,vertexColors:!0}
))}
function qh(i,e,t,n,{
cushion:s=!1,back:r=!0}
={
}
){
let{
wood:o,metal:a,linen:l}
=n;
for(let c of[-.17,.17])for(let u of[-.65,.65])i.box([.055,.39,.055],[e+c,.16,t+u],a);
for(let c=0;
c<5;
c++)i.box([.085,.055,1.65],[e-.2+c*.1,.39,t],o);
if(r){
for(let c of[-.67,.67])i.box([.055,.39,.055],[e-.235,.55,t+c],a);
for(let c=0;
c<3;
c++)i.box([.055,.085,1.65],[e-.235,.52+c*.11,t],o)}
s&&i.box([.41,.065,1.53],[e,.46,t],l)}
function Rf(i,e,t,n,s=9){
let r=new yn(e.map(u=>Mi(...u))),o=[],a=[],l=[];
for(let u=0;
u<=s;
u++){
let m=u/s,f=r.getPoint(m),p=r.getTangent(m),x=Mi(-p.z,0,p.x).normalize(),b=t*Math.pow(Math.sin(Math.PI*m),.7);
for(let g of[-1,1]){
let h=f.clone().addScaledVector(x,g*b);
o.push(h.x,h.y+(g===1?.014:0)*Math.sin(m*Math.PI),h.z),a.push((g+1)/2,m)}
if(u<s){
let g=u*2;
l.push(g,g+1,g+2,g+1,g+3,g+2)}
}
let c=new st;
c.setAttribute("position",new De(o,3)),c.setAttribute("uv",new De(a,2)),c.setIndex(l),c.computeVertexNormals(),i.add(c,n)}
function k_(i,e,t,n,s,r=1,o=1){
let a=e<0?-1:1,l=a*.25,c=new yn([Mi(e,-.045,t),Mi(e+l*.2,n*.33,t+.05),Mi(e+l*.62,n*.69,t),Mi(e+l,n,t-.1)]);
i.add(new Gn(c,24,.095,10,!1),s.trunk);
for(let m=2;
m<34;
m++){
let f=m/35,p=c.getPoint(f),x=new Qt(.095,.008,4,10);
x.rotateX(Math.PI/2),x.applyQuaternion(new _t().setFromUnitVectors(Mi(0,1,0),c.getTangent(f))),x.translate(p.x,p.y,p.z),i.add(x,s.trunkRing)}
let u=c.getPoint(1);
for(let m=0;
m<10;
m++){
let f=m*Math.PI*2/10+r*.31,p=Math.cos(f),x=Math.sin(f),b=(1.45+Pt(r+m)*.65)*o,g=M=>Mi(u.x+p*b*M,u.y+Math.sin(M*Math.PI)*.37-M*M*.66,u.z+x*b*M),h=new yn([g(0),g(.3),g(.65),g(1)]);
i.add(new Gn(h,12,.014,5,!1),s.stem);
for(let M=0;
M<13;
M++){
let T=.16+M*.058,d=g(T),y=(.22+.43*Math.sin(Math.PI*T))*Math.pow(1-T,.24)*o;
for(let v of[-1,1]){
let E=-x*v,_=p*v,w=(M+m)%3?s.leaf:s.leafLight;
Rf(i,[d.toArray(),[d.x+E*y*.47+p*.11*o,d.y-.025,d.z+_*y*.47+x*.11*o],[d.x+E*y*.85+p*.25*o,d.y-.14,d.z+_*y*.85+x*.25*o],[d.x+E*y+p*.32*o,d.y-.32*(1-T*.6),d.z+_*y+x*.32*o]],.039*(1-T*.5),w,6)}
}
}
for(let m=0;
m<4;
m++)i.ellipsoid([.1,.13,.1],[u.x+Math.cos(m*2)*.14,u.y-.12,u.z+Math.sin(m*2)*.14],s.coconut)}
function wf(i,e,t,n,s=0){
for(let r=0;
r<20;
r++){
let o=Pt(s+r)*Math.PI*2,a=.12*Pt(s+r+43),l=.18+Pt(s+r+91)*.35,c=Math.cos(o),u=Math.sin(o);
Rf(i,[[e+c*a,-.04,t+u*a],[e+c*(a+.06),l*.65,t+u*(a+.06)],[e+c*(a+.18),l,t+u*(a+.18)],[e+c*(a+.27),l*.77,t+u*(a+.27)]],.014,r%3?n.grass:n.grassLight,6)}
}
var Xo=i=>8.38+.38*Math.sin(i*.28)+.2*Math.sin(i*.69+1.2)+Math.max(0,-i-9)*.085;
function G_(i,e){
let t=[],n=[],s=[],r=[],o=new We,a=240,l=80,c=new We("#9cddd1"),u=new We("#269eab"),m=new We("#0c688f");
for(let h=0;
h<=a;
h++){
let M=-38+h/a*76,T=Xo(M);
for(let d=0;
d<=l;
d++){
let y=d/l*(40-T),v=T+y;
if(t.push(v,-.056+Math.min(.008,y*.002)*Math.sin(M*1.8+v*2),M),o.copy(c).lerp(u,Math.min(1,y/1.3)),o.lerp(m,Math.min(.88,Math.max(0,y-1.3)/8)),o.multiplyScalar(1+.016*Math.sin(M*4+v*8)),n.push(o.r,o.g,o.b),s.push(v/5,M/5),h<a&&d<l){
let E=h*(l+1)+d;
r.push(E,E+l+1,E+1,E+1,E+l+1,E+l+2)}
}
}
let f=new st;
f.setAttribute("position",new De(t,3)),f.setAttribute("color",new De(n,3)),f.setAttribute("uv",new De(s,2)),f.setIndex(r),f.computeVertexNormals();
let p=uc(512,(h,M)=>{
h.fillStyle="#ffffff",h.fillRect(0,0,M,M);
for(let T=0;
T<240;
T++){
let d=Pt(T+90)*M,y=Pt(T+615)*M;
h.strokeStyle=`rgba(126,189,187,${.03+Pt(T)*.055})`,h.lineWidth=.6,h.beginPath(),h.ellipse(d,y,5+Pt(T+71)*20,2+Pt(T+62)*7,Pt(T+37)*Math.PI,0,Math.PI*1.7),h.stroke()}
}
);
p.wrapS=p.wrapT=Kn,Af(i,f,sn("#ffffff",{
map:p,vertexColors:!0,roughness:.42,metalness:.025}
));
let x=sn("#f4faf0",{
transparent:!0,opacity:.78,roughness:.9,depthWrite:!1}
),b=sn("#d2eee4",{
transparent:!0,opacity:.5,roughness:.85,depthWrite:!1}
);
for(let h=0;
h<4;
h++){
let M=[],T=[];
for(let y=0;
y<=720;
y++){
let v=-33+y/720*66,E=h===0?.025:.33+h*.59,_=Xo(v)+E+.055*Math.sin(v*3.1+h)+.025*Math.sin(v*9.3+h),w=(h===0?.06:.021)*(1+.26*Math.sin(v*6+h))*(.25+.75*Math.pow(.5+.5*Math.sin(v*1.4+h*2),.25));
if(M.push(_-w,-.037,v,_+w,-.037,v),y<720){
let R=y*2;
T.push(R,R+2,R+1,R+1,R+2,R+3)}
}
let d=new st;
d.setAttribute("position",new De(M,3)),d.setIndex(T),d.computeVertexNormals(),e.add(d,h?b:x)}
let g=sn("#edf8ef",{
transparent:!0,opacity:.46,depthWrite:!1}
);
for(let h=0;
h<115;
h++){
let M=-15+Pt(h+753)*32,T=Xo(M)+.17+Pt(h+18)*1.15;
e.ellipsoid([.012+Pt(h)*.018,.002,.025+Pt(h+32)*.06],[T,-.029,M],g,Pt(h+318))}
}
function V_(i,e){
for(let c of[-1,1])for(let u of[-1,1])i.box([.09,2.28,.09],[-9.63+c*2.7*.46,2.28/2-.035,-6.65+u*3.6*.45],e.wood);
for(let c of[-1,1])i.box([.11,.14,3.6],[-9.63+c*2.7*.47,2.28,-6.65],e.wood);
for(let c of[-1,1])i.box([2.7,.14,.11],[-9.63,2.28,-6.65+c*3.6*.47],e.wood);
let a=new Kt(2.7,3.6,20,24);
a.rotateX(-Math.PI/2);
let l=a.attributes.position;
for(let c=0;
c<l.count;
c++)l.setY(c,2.28+.075-.2*Math.cos(l.getX(c)/2.7*Math.PI)*Math.cos(l.getZ(c)/3.6*Math.PI));
a.computeVertexNormals(),a.translate(-9.63,0,-6.65),i.add(a,e.linen);
for(let c=0;
c<10;
c++)i.box([2.7+.16,.045,.045],[-9.63,2.28+.04,-6.65-3.6*.5+c*3.6/9],e.wood);
qh(i,-8.7,-6.65,e,{
cushion:!0}
)}
function W_(){
return{
wood:sn("#b89568",{
map:z_()}
),metal:sn("#586264",{
roughness:.68}
),linen:sn("#ece2c9",{
side:Tt}
),trunk:sn("#a28b67"),trunkRing:sn("#806e51"),leaf:sn("#4b7950",{
side:Tt,roughness:.83}
),leafLight:sn("#6d9255",{
side:Tt,roughness:.87}
),stem:sn("#78934f"),coconut:sn("#796343"),grass:sn("#a99566",{
side:Tt}
),grassLight:sn("#c6b37e",{
side:Tt}
)}
}
function Cf(i){
let e=new je;
e.name=`earth-arena-${i}`;
let t=O_(e),n=W_();
if(i==="beach"){
Tf(e,!0),G_(e,t);
for(let a=-13;
a<14;
a+=.23)t.box([.93,.06,.211],[-8.31,-.006,a],n.wood);
for(let a of[-3.7,6.2])qh(t,-8.3,a,n,{
cushion:!0}
);
for(let[a,l,c,u,m]of[[-9.35,-8,2.55,3,.72],[-9.25,3.4,2.7,9,.72],[-9.45,11.8,2.75,17,.78],[-10.8,-15,3.8,21,1]])k_(t,a,l,c,n,u,m);
let s=sn("#d78974"),r=sn("#f0e5d3");
t.box([.43,.075,.57],[-8.28,.51,6.5],s);
for(let a=0;
a<3;
a++)t.box([.437,.004,.018],[-8.28,.55,6.26+a*.055],r);
for(let[a,l,c]of[[-8.9,-10,6],[-9.1,-.3,91],[-8.98,9.6,44],[-10.4,5.5,27]])wf(t,a,l,n,c);
let o=sn("#efe2c9");
for(let a=0;
a<22;
a++){
let l=a%2?-1:1,c=-12+Pt(a+390)*25,u=l<0?-8.94-Pt(a+9)*1.2:Xo(c)-.13-Pt(a+7)*.18;
t.ellipsoid([.022+Pt(a)*.035,.009,.017+Pt(a+80)*.02],[u,-.035,c],o,Pt(a+515)*Math.PI)}
}
else if(i==="desert"){
Tf(e,!1),V_(t,n);
let s=sn("#b99063"),r=sn("#967454");
for(let a=0;
a<48;
a++){
let l=a%2?1:-1,c=-12+Pt(a+341)*27,u=l*(8.14+Pt(a+194)*3.5),m=.025+Pt(a+177)*.09;
t.ellipsoid([m*1.5,m*.47,m],[u,-.035,c],a%3?s:r,Pt(a+182)*Math.PI)}
for(let[a,l,c]of[[8.4,-8,5],[8.7,4.8,25],[-8.3,8.7,85],[9.7,10,181],[-10,1.4,15]])wf(t,a,l,n,c);
qh(t,8.25,5.4,n,{
cushion:!0}
);
let o=sn("#a26748");
t.ellipsoid([.16,.21,.16],[8.27,.17,4.28],o),t.beam([8.26,.35,4.28],[8.26,.52,4.28],.055,n.linen);
for(let a of[-1,1])for(let l=-10;
l<11;
l+=.54)t.box([.3,.035,.49],[a*7.97,-.027,l],n.linen)}
return t.finish(),e}
var Ns={
desert:{
court:"#427f82",alley:"#397476",apron:"#ac8b6b",ground:"#c49e78",stone:"#d9c5a3",name:"DUBAI DESERT",background:"#cfb393",hemisphereSky:"#fff2e0",hemisphereGround:"#8c6d51",sun:"#ffebcd",sunIntensity:2.05,exposure:.96}
,beach:{
court:"#367e98",alley:"#306f88",apron:"#c4b89c",ground:"#d4c5a7",stone:"#e0d6bd",name:"TROPICAL BEACH",background:"#85c8ce",hemisphereSky:"#edfaff",hemisphereGround:"#9a947c",sun:"#fff4db",sunIntensity:2.1,exposure:.97}
,moon:{
court:"#394e60",alley:"#324555",apron:"#747a7e",ground:"#62676b",stone:"#94999d",name:"LUNAR COURT",background:"#050911",hemisphereSky:"#d8e4f3",hemisphereGround:"#3d4148",sun:"#f1f4ff",sunIntensity:2.15,exposure:.91}
}
,Zh=i=>{
let e=Math.sin(i*137.27+81.3)*29713.17;
return e-Math.floor(e)}
,Jh=(i,e,t)=>new k(i,e,t),Ds=(i,e={
}
)=>new qe({
color:i,roughness:.94,...e}
);
function X_(){
let i=new je;
i.name="lunar-plateau",i.userData.textureReady=!1;
let e=new Di().load("/assets/lunar-regolith.png",()=>{
i.userData.textureReady=!0}
,void 0,()=>{
i.userData.textureReady=!0,i.userData.textureError=!0}
);
e.colorSpace=Nt,e.wrapS=e.wrapT=Kn,e.repeat.set(5.5,7.5),e.anisotropy=8;
let t=Ds("#b0b2b4",{
map:e,bumpMap:e,bumpScale:.035,vertexColors:!0}
),n=[[-9.1,-5.4,1.05],[-8.9,4.5,.76],[9.1,5.4,1.16],[8.55,-6.7,.66],[-12,1.2,1.6],[12.4,-2,1.85],[10.2,10.2,.84],[-9.4,11.6,.9]],s=new Kt(34.6,54,160,216);
s.rotateX(-Math.PI/2);
let r=s.attributes.position,o=s.attributes.uv,a=[],l=new We;
for(let y=0;
y<r.count;
y++){
let v=r.getX(y),E=r.getZ(y),_=Math.sign(v)*(Math.min(Math.abs(v),13)+Math.max(0,Math.abs(v)-13)*25/4.3),w=Math.sign(E)*(Math.min(Math.abs(E),16)+Math.max(0,Math.abs(E)-16)*22/11);
r.setX(y,_),r.setZ(y,w),o.setXY(y,(_+17.3)/34.6,(42.7-w)/54);
let R=-.068,I=1;
for(let[P,N,F]of n){
let B=Math.hypot(_-P,w-N)/F;
B<1.65&&(R+=-.3*F*Math.exp(-B*B*2.8)+.1*F*Math.exp(-(((B-1.02)/.2)**2)),I-=.14*Math.exp(-B*B*3))}
r.setY(y,R),l.setRGB(I,I,I),a.push(l.r,l.g,l.b)}
s.setAttribute("color",new De(a,3)),s.computeVertexNormals();
let c=new ot(s,t);
c.receiveShadow=!0,i.add(c);
let u=new Map,m=(y,v)=>{
let E=y.index?y.toNonIndexed():y;
E!==y&&y.dispose();
let _=u.get(v)||[];
_.push(E),u.set(v,_)}
,f=(y,v,E)=>{
let _=new Mt(...y);
_.translate(...v),m(_,E)}
,p=(y,v,E,_)=>{
let w=Jh(...y),R=Jh(...v),I=R.clone().sub(w),P=new St(E,E,I.length(),8);
P.applyQuaternion(new _t().setFromUnitVectors(Jh(0,1,0),I.normalize())),P.translate(...w.add(R).multiplyScalar(.5).toArray()),m(P,_)}
,x=Ds("#a2a4a5",{
map:e,roughness:1}
),b=Ds("#aeb5bc",{
metalness:.55,roughness:.42}
),g=Ds("#41494f"),h=Ds("#b7955f",{
metalness:.6,roughness:.45}
),M=Ds("#d3d7d8");
for(let y=0;
y<72;
y++){
let v=y%2?1:-1,E=v*(8.05+Zh(y+73)*(v>0?1.65:3.8)),_=-10.5+Zh(y+730)*23,w=.045+Zh(y+51)**2*.25,R=new En(w,2),I=R.attributes.position;
for(let P=0;
P<I.count;
P++){
let N=.87+.2*Math.sin(I.getX(P)*47+I.getY(P)*61+I.getZ(P)*17+y);
I.setXYZ(P,I.getX(P)*N,I.getY(P)*.66*N,I.getZ(P)*N)}
R.computeVertexNormals(),R.translate(E,w*.23-.055,_),m(R,x)}
f([.48,.34,.56],[-8.23,.14,3.9],h),f([.51,.055,.58],[-8.23,.335,3.9],b);
for(let y of[3.7,4.1])f([.54,.04,.045],[-8.23,.345,y],g);
let T=[-8.25,.7,-4.4];
p([-8.25,0,-4.4],T,.035,b);
for(let y of[0,2.1,4.2])p(T,[-8.25+Math.cos(y)*.35,.02,-4.4+Math.sin(y)*.35],.018,b);
let d=new ot(new gt(.27,24,12,0,Math.PI*2,0,.9),M);
d.position.set(-8.25,.77,-4.4),d.rotation.z=-.5,i.add(d);
for(let y of[-1,1])for(let v of[-8.7,5.6])f([.09,.04,.65],[y*7.86,.017,v],M),f([.035,.02,.28],[y*7.86,.043,v],Ds("#aabec8",{
emissive:"#9ab5c8",emissiveIntensity:.35}
));
for(let[y,v]of u){
let E=new ot(vt(v),y);
E.castShadow=E.receiveShadow=!0,i.add(E),v.forEach(_=>_.dispose())}
return i}
function If(i){
let e=new Map,t="",n=null;
return{
setVenue(s){
t=s;
for(let o of e.values())o.visible=!1;
if(!Ns[s])return null;
if(!e.has(s)){
let o=s==="moon"?X_():Cf(s);
i.add(o),e.set(s,o)}
let r=e.get(s);
return r.visible=!0,n&&r.userData.layout?.(n),{
background:new We(Ns[s].background),hideGround:!0}
}
,layout(s){
n=s,e.get(t)?.userData.layout?.(s)}
,update(s){
e.get(t)?.userData.update?.(s)}
,debug(){
let s=e.get(t),r=0;
return s?.traverse(o=>{
o.isMesh&&r++}
),{
arena:Ns[t]?t:null,sceneryMeshes:r,texturesReady:t!=="moon"||s?.userData.textureReady===!0,textureError:s?.userData.textureError===!0}
}
}
}
var vn=(i=0,e=0,t=0)=>new k(i,e,t),Y_=vn(0,1,0),ti=i=>{
let e=Math.sin(i*91.73+14.51)*31719.17;
return e-Math.floor(e)}
;
function Pf(i){
let e=new je;
e.name="dubai-sail-garden",e.visible=!1,i.add(e);
let t=new Map,n={
limestone:new qe({
vertexColors:!0,roughness:.94}
),gravel:new qe({
vertexColors:!0,roughness:1}
),bronze:new qe({
vertexColors:!0,roughness:.56,metalness:.48}
),turquoise:new qe({
vertexColors:!0,roughness:.7}
),fabric:new qe({
vertexColors:!0,roughness:.92,side:Tt}
),foliage:new qe({
vertexColors:!0,roughness:.91,side:Tt}
),bark:new qe({
vertexColors:!0,roughness:1}
),lantern:new qe({
color:"#f1ddb0",roughness:.68,emissive:"#f9d994",emissiveIntensity:.18}
)}
,s={
stone:"#ddcdb1",stoneLight:"#eee1c9",stoneEdge:"#c5b090",sand:"#bfa886",gravel:"#d3bf9e",bronze:"#94703e",bronzeDark:"#695538",turquoise:"#388b94",fabric:"#f3e9d0",leaf:"#526644",leafLight:"#788252",leafDark:"#3a5941",bark:"#927247"}
;
function r(d,y,v){
let E=y.index?y.toNonIndexed():y;
E!==y&&y.dispose(),E.attributes.normal||E.computeVertexNormals(),E.attributes.uv||E.setAttribute("uv",new ft(new Float32Array(E.attributes.position.count*2),2));
let _=new We(v||"#ffffff"),w=new Float32Array(E.attributes.position.count*3);
for(let I=0;
I<w.length;
I+=3)w[I]=_.r,w[I+1]=_.g,w[I+2]=_.b;
E.setAttribute("color",new ft(w,3));
let R=t.get(d)||[];
R.push(E),t.set(d,R)}
function o(d,y,v,E,_=0){
let w=new Mt(...y);
_&&w.rotateY(_),w.translate(...v),r(d,w,E)}
function a(d,y,v,E,_,w=E,R=6){
let I=vn(...y),P=vn(...v),N=P.clone().sub(I),F=new St(w,E,N.length(),R);
F.applyQuaternion(new _t().setFromUnitVectors(Y_,N.normalize())),F.translate(...I.add(P).multiplyScalar(.5).toArray()),r(d,F,_)}
function l(d,y,v,E,_){
let w=new st;
w.setAttribute("position",new De([...y,...v,...E],3)),w.computeVertexNormals(),r(d,w,_)}
let c=(d,y,v)=>[d,y,v];
for(let d of[-1,1]){
o("gravel",[5.45,.045,25.9],[d*10.64,-.015,-.55],s.sand),o("limestone",[2.45,.05,24.2],[d*9.12,.012,-.55],s.stone),o("limestone",[.2,.11,22.7],[d*8.015,.04,-.25],s.stoneLight),o("limestone",[.3,.06,25.3],[d*12.85,.016,-.55],s.stoneEdge);
for(let y=-12.25;
y<11;
y+=1.08)o("limestone",[2.39,.012,.026],[d*9.12,.043,y],s.stoneEdge),o("limestone",[.025,.012,1.03],[d*(8.73+(Math.round(y*100)%2?0:.71)),.043,y+.53],s.stoneEdge)}
o("limestone",[17.3,.055,4.6],[0,.009,-13.4],s.stone);
for(let d=-7.8;
d<=7.8;
d+=1.3)o("limestone",[.028,.012,4.55],[d,.043,-13.4],s.stoneEdge);
for(let d of[-11.72,-12.78,-13.84,-14.9])o("limestone",[17.2,.012,.028],[0,.043,d],s.stoneEdge);
function u(d,y,v,E){
o("limestone",[v,.38,E],[d,.19,y],s.stone),o("limestone",[v+.055,.065,E+.055],[d,.4,y],s.stoneLight),o("gravel",[v-.14,.018,E-.14],[d,.439,y],s.gravel)}
function m(d,y){
o("bronze",[.17,.06,.17],[d,.07,y],s.bronzeDark),o("lantern",[.075,.49,.075],[d,.35,y],"#ffffff");
for(let v of[-.064,.064])for(let E of[-.064,.064])o("bronze",[.018,.61,.018],[d+v,.35,y+E],s.bronze);
o("bronze",[.17,.045,.17],[d,.665,y],s.bronze)}
function f(d,y,v,E,_){
let w=new gt(1,7,4);
w.scale(E*.26,E*.22,E*.26),w.translate(d,y+E*.12,v),r("foliage",w,s.leafDark);
for(let R=0;
R<19;
R++){
let I=R*2.399+_,P=E*(.38+ti(_+R)*.5),N=E*(.7+ti(_+R+4)*.6),F=vn(d,y,v),B=vn(d+Math.cos(I)*P*.4,y+N,v+Math.sin(I)*P*.4),U=vn(d+Math.cos(I)*P,y+N*.47,v+Math.sin(I)*P),D=vn(-Math.sin(I)*E*.14,0,Math.cos(I)*E*.14);
l("foliage",F.toArray(),B.clone().add(D).toArray(),B.clone().sub(D).toArray(),R%3?s.leaf:s.leafLight),l("foliage",B.clone().add(D).toArray(),U.toArray(),B.clone().sub(D).toArray(),R%3?s.leaf:s.leafLight)}
}
function p(d,y,v,E=1.26,_=1.35){
let R=(P,N)=>c(d*y,.43+N,v+P);
for(let P of[-E/2,E/2])a("bronze",R(P,0),R(P,_),.029,s.bronzeDark);
for(let P of[0,_])a("bronze",R(-E/2,P),R(E/2,P),.025,s.bronzeDark);
let I=.315;
for(let P=0;
P<4;
P++)for(let N=0;
N<4;
N++){
let F=-E/2+(N+.5)*I,B=.05+(P+.5)*I,U=[R(F,B-I*.48),R(F+I*.48,B),R(F,B+I*.48),R(F-I*.48,B)];
for(let D=0;
D<4;
D++)a("bronze",U[D],U[(D+1)%4],.011,s.bronze)}
for(let P=0;
P<8;
P++){
let N=P*Math.PI/4,F=(P+1)*Math.PI/4;
a("bronze",R(Math.cos(N)*.23,_*.5+Math.sin(N)*.23),R(Math.cos(F)*.23,_*.5+Math.sin(F)*.23),.014,s.bronzeDark)}
}
let x=[];
function b(d,y,v){
let E=v%2?-1:1,_=[vn(d*8.32,2.74,y-1.53*E),vn(d*11.2,3.66,y-.93*E),vn(d*10.94,2.53,y+1.7*E)],w=(I,P)=>{
let N=1-I-P,F=_[0].clone().multiplyScalar(N).addScaledVector(_[1],I).addScaledVector(_[2],P);
return F.y-=.68*(I*P+P*N+N*I),F}
,R=9;
for(let I=0;
I<R;
I++)for(let P=0;
P<R-I;
P++){
let N=w(I/R,P/R),F=w((I+1)/R,P/R),B=w(I/R,(P+1)/R);
if(l("fabric",N.toArray(),F.toArray(),B.toArray(),s.fabric),I+P<R-1){
let U=w((I+1)/R,(P+1)/R);
l("fabric",F.toArray(),U.toArray(),B.toArray(),s.fabric)}
}
for(let I=0;
I<3;
I++){
let P=_[I],N=_[(I+1)%3];
for(let F=0;
F<8;
F++){
let B=P.clone().lerp(N,F/8),U=P.clone().lerp(N,(F+1)/8);
B.y-=.68*(F/8)*(1-F/8),U.y-=.68*((F+1)/8)*(1-(F+1)/8),a("fabric",B.toArray(),U.toArray(),.017,"#e5d5b3")}
}
for(let[I,P]of _.entries()){
let N=P.clone();
N.y=.045,a("bronze",N.toArray(),P.clone().add(vn(0,.18,0)).toArray(),I===1?.054:.041,s.bronze,.034,8),o("limestone",[.28,.12,.28],[N.x,.085,N.z],s.stoneLight),a("bronze",P.toArray(),P.clone().add(vn(0,.13,0)).toArray(),.028,s.bronzeDark)}
x.push(_.map(I=>I.toArray()))}
for(let d of[-1,1]){
for(let[y,v]of[-5.15,.05,5.25].entries()){
b(d,v,y);
for(let E of[-1,1])o("limestone",[1.72,.38,.14],[d*9.1,.2,v+E*1.75],s.stone),o("limestone",[1.76,.055,.17],[d*9.1,.42,v+E*1.75],s.stoneLight),o("turquoise",[.033,.1,.12],[d*8.21,.26,v+E*1.75],s.turquoise);
o("limestone",[.14,.75,3.43],[d*10.02,.4,v],s.stone),o("limestone",[.22,.07,3.52],[d*10.02,.81,v],s.stoneLight),o("turquoise",[.018,.055,3.37],[d*9.935,.72,v],s.turquoise)}
for(let[y,v]of[-9.1,-2.55,2.65,9].entries())u(d*9.12,v,1.59,y===0||y===3?1.65:1.1),f(d*8.78,.45,v-.22,.46,y+d*20),f(d*9.38,.45,v+.22,.58,y+d*24),p(d,10.05,v),m(d*8.2,v+.22)}
let g=0;
function h(d,y,v,E,_=1){
let R=(ti(E+61)-.5)*.24,I=(ti(E+67)-.5)*.34,P=B=>vn(d+R*B*B,.45+v*B,y+I*B*B);
for(let B=0;
B<9;
B++){
let U=P(B/9),D=P((B+1)/9),G=.135-B/9*.04;
a("bark",U.toArray(),D.toArray(),G,B%2?"#a18559":s.bark,G-.005,9);
let H=D.clone();
H.y-=.035,a("bark",H.toArray(),D.toArray(),G+.014,"#806442",G+.005,9)}
let N=P(1),F=10;
for(let B=0;
B<F;
B++){
let U=B*Math.PI*2/F+E*.41,D=(1.34+ti(E*7+B)*.56)*_,G=(.55+ti(E*5+B)*.24)*_,H=(.44+ti(E*3+B)*.25)*_,Y=vn(Math.cos(U),0,Math.sin(U)),q=vn(-Y.z,0,Y.x),Se=Re=>N.clone().addScaledVector(Y,D*Re).add(vn(0,Math.sin(Math.PI*Re)*G-H*Re*Re,0)),ye=B%3===0?s.leafLight:B%3===1?s.leaf:s.leafDark;
for(let Re=0;
Re<7;
Re++)a("foliage",Se(Re/7).toArray(),Se((Re+1)/7).toArray(),.016*(1-Re/8),"#859161",.01*(1-Re/8),4);
for(let Re=1;
Re<=8;
Re++){
let Ye=Re/10,Ne=Se(Ye),ie=.53*Math.sin(Math.PI*Ye)*(.9+ti(Re+E)*.2)*_;
for(let ce of[-1,1]){
let j=Ne.clone().addScaledVector(q,ce*ie).addScaledVector(Y,D*.16).add(vn(0,-.095*_,0)),de=Ne.clone().lerp(j,.44).add(vn(0,.04,0)),ge=Y.clone().multiplyScalar(.066*Math.sin(Math.PI*Ye)*_);
l("foliage",Ne.toArray(),de.clone().add(ge).toArray(),j.toArray(),ye),l("foliage",Ne.toArray(),j.toArray(),de.clone().sub(ge).toArray(),ye)}
}
l("foliage",Se(.77).clone().addScaledVector(q,.047).toArray(),Se(1).toArray(),Se(.77).clone().addScaledVector(q,-.047).toArray(),ye)}
f(N.x,N.y-.11,N.z,.39*_,E+4),g++}
for(let d of[-1,1]){
let y=d*11.14;
u(y,-10.3,1.37,1.46),h(y,-10.3,2.72+ti(d*14)*.77,12+(d+1)*6);
for(let[v,E]of[-2.55,2.65,9].entries()){
let _=d*(v===2?8.96:9.12),w=14+v+(d+1)*6;
h(_,E,v===2?1.65:1.85,w,v===2?.44:.53);
for(let R=0;
R<3;
R++)f(d*9.12+Math.cos(R*2.1)*.4,.45,E+Math.sin(R*2.1)*.4,.32,R+v*3)}
for(let v=0;
v<18;
v++){
let E=d*(10.72+ti(v+81)*1.49),_=-11+ti(v+230)*22;
f(E,.03,_,.26+ti(v+90)*.25,v+d*30);
let w=new En(.1+ti(v+190)*.12,0);
w.scale(1,.52,.8),w.translate(E,.06,_+.32),r("gravel",w,v%2?"#d9c6a7":"#baa382")}
}
o("limestone",[16,.21,1.7],[0,.115,-14.45],s.stone);
for(let d of[-7.6,-5.1,-2.55,0,2.55,5.1,7.6])o("limestone",[.22,2.35,.23],[d,1.375,-14.75],s.stoneLight),o("bronze",[.1,2.09,.1],[d,1.46,-14.58],s.bronze);
o("limestone",[16.35,.2,1.95],[0,2.6,-14.55],s.stoneLight),o("bronze",[16.08,.07,.07],[0,2.465,-13.61],s.bronze),o("turquoise",[15.95,.035,.085],[0,2.38,-13.66],s.turquoise),o("limestone",[16.15,.63,.18],[0,.53,-15.21],s.stone);
for(let d=0;
d<24;
d++){
let y=-7.7+d*.67;
a("bronze",[y,.88,-15.18],[y+.335,1.19,-15.18],.017,s.bronze),a("bronze",[y+.335,1.19,-15.18],[y+.67,.88,-15.18],.017,s.bronze)}
for(let d of[-1,1])u(d*7.78,-12.9,.84,1.24),f(d*7.78,.45,-12.9,.57,41+d),u(d*8.05,-14.5,.9,.94),h(d*8.05,-14.5,2.28,60+d);
let M=0;
for(let[d,y]of t){
let v=vt(y);
y.forEach(_=>_.dispose()),v.computeBoundingBox(),v.computeBoundingSphere(),M+=v.attributes.position.count/3;
let E=new ot(v,n[d]);
E.name=`dubai-${d}`,E.castShadow=!1,E.receiveShadow=!0,e.add(E)}
let T=new qt().setFromObject(e);
return{
root:e,setVisible(d){
e.visible=!!d}
,debug(){
return{
name:"dubai-sail-garden",title:"Dubai Sail Garden",version:1,visible:e.visible,sceneryMeshes:e.children.length,sailCount:x.length,palmCount:g,triangles:M,bounds:{
min:T.min.toArray(),max:T.max.toArray()}
,courtClearance:{
side:7.85,far:-10.95}
,castsCourtShadows:!1}
}
}
}
var $i=(i=0,e=0,t=0)=>new k(i,e,t),q_=$i(0,1,0),Gt={
stone:"#dfd0b6",light:"#eee3cf",joint:"#c6b599",bronze:"#937044",darkBronze:"#6f593c",leaf:"#536a47",leafLight:"#73865b",bark:"#997c53"}
;
function Lf(i){
let e=new je;
e.name="dubai-championship-stadium",e.visible=!1,i.add(e);
let t=new Map,n={
limestone:new qe({
vertexColors:!0,roughness:.94}
),bronze:new qe({
vertexColors:!0,roughness:.58,metalness:.42}
),foliage:new qe({
vertexColors:!0,roughness:.94,side:Tt}
),bark:new qe({
vertexColors:!0,roughness:1}
),lantern:new qe({
vertexColors:!0,roughness:.68,emissive:"#f2d5a6",emissiveIntensity:.1}
)}
;
function s(g,h,M){
let T=h.index?h.toNonIndexed():h;
T!==h&&h.dispose(),T.attributes.normal||T.computeVertexNormals(),T.attributes.uv||T.setAttribute("uv",new ft(new Float32Array(T.attributes.position.count*2),2));
let d=new We(M),y=new Float32Array(T.attributes.position.count*3);
for(let E=0;
E<y.length;
E+=3)y[E]=d.r,y[E+1]=d.g,y[E+2]=d.b;
T.setAttribute("color",new ft(y,3));
let v=t.get(g)||[];
v.push(T),t.set(g,v)}
function r(g,h,M,T){
let d=new Mt(...h);
d.translate(...M),s(g,d,T)}
function o(g,h,M,T,d,y=T){
let v=$i(...h),E=$i(...M),_=E.clone().sub(v),w=new St(y,T,_.length(),6);
w.applyQuaternion(new _t().setFromUnitVectors(q_,_.normalize())),w.translate(...v.add(E).multiplyScalar(.5).toArray()),s(g,w,d)}
function a(g,h,M,T){
let d=new st;
d.setAttribute("position",new De([...g,...h,...M],3)),d.computeVertexNormals(),s("foliage",d,T)}
for(let g of[-1,1]){
r("limestone",[5.25,.06,26],[g*10.54,.014,-.6],Gt.stone),r("limestone",[.18,.15,24.7],[g*8.015,.095,-.55],Gt.light),r("limestone",[.21,.12,25.9],[g*13.02,.07,-.6],Gt.joint);
for(let h=-12.6;
h<11.6;
h+=1.03)r("limestone",[5.18,.012,.022],[g*10.54,.05,h],Gt.joint);
for(let h of[-5.15,.05,5.25]){
for(let M of[-1,1])for(let T=0;
T<4;
T++){
let d=.18+T*.36,y=g*(8.64+T*.75),v=h+M*2.265;
r("limestone",[.75,d+.045,.15],[y,(d+.045)/2,v],Gt.stone),r("limestone",[.76,.055,.2],[y,d+.068,v],Gt.light)}
r("limestone",[.16,1.32,4.6],[g*11.47,.66,h],Gt.stone),r("limestone",[.23,.075,4.68],[g*11.47,1.36,h],Gt.light),r("bronze",[.018,.055,4.52],[g*11.38,1.245,h],Gt.bronze)}
}
r("limestone",[17.8,.065,5.55],[0,.016,-13.865],Gt.stone);
for(let g=-8.2;
g<=8.2;
g+=1.04)r("limestone",[.022,.012,5.48],[g,.055,-13.865],Gt.joint);
for(let g of[-11.65,-12.7,-13.75,-14.8,-15.85])r("limestone",[17.72,.012,.022],[0,.055,g],Gt.joint);
r("limestone",[13.72,1.82,.18],[0,.91,-15.77],Gt.stone),r("limestone",[13.84,.075,.24],[0,1.86,-15.77],Gt.light);
for(let g of[-1,1])for(let h=0;
h<5;
h++){
let M=-11.98-h*.79,T=.22+h*.39;
r("limestone",[.15,T+.045,.79],[g*6.83,(T+.045)/2,M],Gt.stone),r("limestone",[.2,.055,.79],[g*6.83,T+.068,M],Gt.light)}
let l=0,c=0;
function u(g,h){
let M=g*8.16,T=.49,d=.3,y=.7;
r("limestone",[.56,.26,.27],[M,.15,h],Gt.light);
let v=(_,w)=>[M+_,d+w,h];
for(let _ of[-T/2,T/2])o("bronze",v(_,0),v(_,y),.02,Gt.darkBronze);
for(let _ of[0,y])o("bronze",v(-T/2,_),v(T/2,_),.02,Gt.darkBronze);
let E=.232;
for(let _=0;
_<3;
_++)for(let w=0;
w<2;
w++){
let R=-T/2+(w+.55)*E,I=(_+.5)*E,P=[v(R,I-E*.47),v(R+E*.47,I),v(R,I+E*.47),v(R-E*.47,I)];
for(let N=0;
N<4;
N++)o("bronze",P[N],P[(N+1)%4],.008,Gt.bronze)}
l++}
function m(g,h){
let M=g*8.14;
r("bronze",[.135,.035,.16],[M,.105,h],Gt.darkBronze),r("lantern",[.055,.4,.07],[M,.32,h],"#f4e4c4");
for(let T of[-.05,.05])for(let d of[-.062,.062])r("bronze",[.014,.47,.014],[M+T,.34,h+d],Gt.bronze);
r("bronze",[.14,.03,.165],[M,.59,h],Gt.bronze),c++}
for(let g of[-1,1]){
for(let h of[-8.04,-2.55,2.65,8.04])u(g,h);
for(let h of[-10.04,-6.88,-1.42,3.93,9.3])m(g,h)}
let f=0;
function p(g){
let h=g*7.82,M=-12.65,T=.37,d=1.3;
r("limestone",[.86,.34,1.03],[h,.18,M],Gt.stone),r("limestone",[.92,.055,1.09],[h,.377,M],Gt.light),r("limestone",[.72,.018,.88],[h,.414,M],"#bdad8e");
let y=$i(h-g*.055,T+d,M+.035);
for(let v=0;
v<7;
v++){
let E=v/7,_=(v+1)/7;
o("bark",[h-g*.055*E,T+d*E,M+.035*E],[h-g*.055*_,T+d*_,M+.035*_],.085-E*.027,v%2?Gt.bark:"#aa8c63",.085-_*.027)}
for(let v=0;
v<10;
v++){
let E=v*Math.PI/5+.24,_=.67+v%3*.055,w=$i(Math.cos(E),0,Math.sin(E)),R=$i(-w.z,0,w.x),I=N=>y.clone().addScaledVector(w,_*N).add($i(0,Math.sin(Math.PI*N)*.3-N*N*.2,0)),P=v%3?Gt.leaf:Gt.leafLight;
for(let N=0;
N<5;
N++)o("foliage",I(N/5).toArray(),I((N+1)/5).toArray(),.011,P,.007);
for(let N=1;
N<7;
N++)for(let F of[-1,1]){
let B=N/8,U=I(B),D=U.clone().addScaledVector(R,F*.23*Math.sin(Math.PI*B)).addScaledVector(w,.12).add($i(0,-.038,0)),G=U.clone().lerp(D,.45).add($i(0,.025,0)),H=w.clone().multiplyScalar(.032);
a(U.toArray(),G.clone().add(H).toArray(),D.toArray(),P),a(U.toArray(),D.toArray(),G.clone().sub(H).toArray(),P)}
a(I(.72).clone().addScaledVector(R,.025).toArray(),I(1).toArray(),I(.72).clone().addScaledVector(R,-.025).toArray(),P)}
f++}
for(let g of[-1,1])p(g);
let x=0;
for(let[g,h]of t){
let M=vt(h);
h.forEach(d=>d.dispose()),M.computeBoundingBox(),M.computeBoundingSphere(),x+=M.attributes.position.count/3;
let T=new ot(M,n[g]);
T.name=`dubai-championship-${g}`,T.castShadow=!1,T.receiveShadow=!0,e.add(T)}
let b=new qt().setFromObject(e);
return{
root:e,setVisible(g){
e.visible=!!g}
,debug(){
return{
name:"dubai-championship-stadium",title:"Dubai Centre Court",version:1,visible:e.visible,sceneryMeshes:e.children.length,triangles:x,palmCount:f,screenCount:l,lanternCount:c,sailCount:0,bounds:{
min:b.min.toArray(),max:b.max.toArray()}
,courtClearance:{
side:7.85,far:-10.95}
,castsCourtShadows:!1}
}
}
}
var Kh=(i=0,e=0,t=0)=>new k(i,e,t),Z_=Kh(0,1,0),$h=i=>{
let e=Math.sin(i*71.719+13.47)*31917.131;
return e-Math.floor(e)}
,Je={
stone:"#decdb1",light:"#f0e4ce",edge:"#c7b696",joint:"#bead94",iron:"#263b38",clay:"#b77750",clayLight:"#ce9267",leaf:"#355536",leafLight:"#658044",leafDark:"#28462e",red:"#d52b3a",pink:"#e85a69",ivory:"#f6ecd7",glass:"#294a45"}
;
function Df(i){
let e=new je;
e.name="monaco-belle-epoque",e.visible=!1,i.add(e);
let t=new Map,n={
balustradeSections:0,flowerPots:0,cypresses:0,flags:0,clubhouseArches:0,balconies:0,awnings:0}
,s={
limestone:new qe({
vertexColors:!0,roughness:.96}
),terracotta:new qe({
vertexColors:!0,roughness:1}
),iron:new qe({
vertexColors:!0,roughness:.57,metalness:.42}
),foliage:new qe({
vertexColors:!0,roughness:.95,side:Tt}
),flowers:new qe({
vertexColors:!0,roughness:.93,side:Tt}
),fabric:new qe({
vertexColors:!0,roughness:.91,side:Tt}
),glazing:new qe({
vertexColors:!0,roughness:.62,metalness:.12,side:Tt}
)}
;
function r(d,y,v){
let E=y.index?y.toNonIndexed():y;
E!==y&&y.dispose(),E.attributes.normal||E.computeVertexNormals(),E.attributes.uv||E.setAttribute("uv",new ft(new Float32Array(E.attributes.position.count*2),2));
let _=new We(v),w=new Float32Array(E.attributes.position.count*3);
for(let I=0;
I<w.length;
I+=3)w[I]=_.r,w[I+1]=_.g,w[I+2]=_.b;
E.setAttribute("color",new ft(w,3));
let R=t.get(d)||[];
R.push(E),t.set(d,R)}
function o(d,y,v,E,_=0){
let w=new Mt(...y);
_&&w.rotateY(_),w.translate(...v),r(d,w,E)}
function a(d,y,v,E,_,w=E,R=6){
let I=Kh(...y),P=Kh(...v),N=P.clone().sub(I),F=new St(w,E,N.length(),R);
F.applyQuaternion(new _t().setFromUnitVectors(Z_,N.normalize())),F.translate(...I.add(P).multiplyScalar(.5).toArray()),r(d,F,_)}
function l(d,y,v,E,_=0){
let w=d==="flowers"?new Pn(1,0):new En(1,_);
w.scale(...v),w.translate(...y),r(d,w,E)}
function c(d,y,v,E,_){
let w=new st;
w.setAttribute("position",new De([...y,...v,...E],3)),w.computeVertexNormals(),r(d,w,_)}
for(let d of[-1,1]){
o("limestone",[4.5,.045,25.7],[d*10.1,-.01,-.55],Je.stone),o("limestone",[.16,.095,24.6],[d*7.96,.048,-.5],Je.light);
for(let y=-12.6;
y<11.8;
y+=1.04)o("limestone",[4.4,.009,.018],[d*10.1,.02,y],Je.joint),o("limestone",[.018,.009,1.025],[d*(9.15+(Math.round(y*100)%2?.55:0)),.02,y+.52],Je.joint);
for(let y of[-5.15,.05,5.25])for(let v of[-1,1])for(let E=0;
E<2;
E++){
let _=.18+E*.36;
o("limestone",[.74,_+.035,.12],[d*(8.64+E*.75),(_+.035)/2,y+v*2.28],Je.stone),o("limestone",[.77,.052,.18],[d*(8.64+E*.75),_+.058,y+v*2.28],Je.light)}
}
o("limestone",[17.8,.055,3.3],[0,-.005,-12.72],Je.stone);
for(let d=-8.25;
d<8.3;
d+=1.05)o("limestone",[.018,.009,3.25],[d,.028,-12.72],Je.joint);
function u(d,y,v,E="z"){
let _=(I,P)=>E==="z"?[d,P,y+I]:[d+I,P,y],w=(I,P,N)=>E==="z"?[N,P,I]:[I,P,N];
o("limestone",w(v,.21,.25),_(0,.125),Je.stone),o("limestone",w(v+.08,.075,.31),_(0,.273),Je.light),o("limestone",w(v+.1,.105,.34),_(0,.96),Je.light),o("limestone",w(v,.036,.27),_(0,.89),Je.edge);
let R=Math.max(1,Math.floor(v/.285));
for(let I=0;
I<=R;
I++){
let P=_(-v/2+I*v/R,.34);
a("limestone",P,[P[0],.84,P[2]],.035,Je.light,.045,6),l("limestone",[P[0],.56,P[2]],[.066,.12,.066],Je.light),o("limestone",[.115,.055,.115],[P[0],.337,P[2]],Je.light),o("limestone",[.112,.065,.112],[P[0],.84,P[2]],Je.light)}
for(let I of[-v/2,v/2])o("limestone",[.33,.94,.33],_(I,.48),Je.stone),o("limestone",[.4,.08,.4],_(I,1),Je.light),o("limestone",w(.18,.56,.013),E==="z"?[d-Math.sign(d)*.172,.49,y+I]:[d+I,.49,y+.172],Je.edge);
n.balustradeSections++}
for(let d of[-1,1])for(let y of[-5.15,.05,5.25])u(d*10.18,y,4.63);
for(let d of[-4,4])u(d,-13.49,5.95,"x");
function m(d,y,v,E,_,w=!0){
let R=.4*E,I=.25*E;
a("terracotta",[d,y,v],[d,y+R,v],I*.7,Je.clay,I,12),a("terracotta",[d,y+R-.048*E,v],[d,y+R+.035*E,v],I*1.1,Je.clayLight,I*1.1,12),a("terracotta",[d,y+.018*E,v],[d,y+.07*E,v],I*.8,Je.clayLight,I*.8,12),a("foliage",[d,y+R+.035*E,v],[d,y+R+.047*E,v],I*.92,Je.leafDark,I*.92,10);
let P=y+R,N=.31*E;
for(let F=0;
F<11;
F++){
let B=F*2.39996+_,U=N*(.35+$h(_+F)*.72),D=P+E*(.2+$h(_+32+F)*.24),G=d+Math.cos(B)*U,H=v+Math.sin(B)*U;
if(l("foliage",[G,D,H],[.14*E,.18*E,.13*E],F%3?Je.leaf:Je.leafLight),w)for(let Y=0;
Y<3;
Y++){
let q=B+Y*2.12,Se=G+Math.cos(q)*.1*E,ye=H+Math.sin(q)*.1*E,Re=D+(.08+$h(_+F*7+Y)*.09)*E;
l("flowers",[Se,Re,ye],[.088*E,.062*E,.076*E],Y%2?Je.red:Je.pink)}
else for(let Y=0;
Y<2;
Y++)l("foliage",[G,D+.15*E+Y*.07*E,H],[.065*E,.14*E,.065*E],Je.leafLight)}
if(w)for(let F=0;
F<3;
F++){
let B=_+F*2.1,U=d+Math.cos(B)*.32*E,D=v+Math.sin(B)*.32*E;
l("foliage",[U,P+.04*E,D],[.11*E,.2*E,.1*E],Je.leaf),l("flowers",[U,P+.1*E,D],[.08*E,.07*E,.08*E],Je.red)}
n.flowerPots++}
for(let d of[-1,1]){
for(let[y,v]of[-7.46,-5.14,-2.26,.06,2.94,5.26,7.56].entries())m(d*10.18,1.045,v,.82,17+y+d*11);
for(let[y,v]of[-9.26,9.23].entries())o("limestone",[.79,.42,1.03],[d*8.35,.22,v],Je.stone),o("limestone",[.86,.06,1.09],[d*8.35,.46,v],Je.light),m(d*8.35,.495,v,1.05,50+y+d*5);
for(let[y,v]of[-2.55,2.65].entries())m(d*8.62,.03,v,.68,71+y+d*13,!1)}
for(let[d,y]of[-7.3,7.3].entries())m(y,.15,-11.5,.95,91+d);
function f(d,y,v,E){
o("limestone",[.57,.24,.69],[d,.12,y],Je.stone),o("limestone",[.63,.065,.75],[d,.265,y],Je.light),a("terracotta",[d,.08+.2,y],[d,.08+v*.72,y],.048,Je.clay,.026);
for(let w=0;
w<7;
w++){
let R=w/7,I=.2*(1-R*.6),P=.46+v*(.15+R*.69);
l("foliage",[d+Math.sin(w+E)*.028,P,y+Math.cos(w*1.8)*.028],[I,v*.2,I*.89],w%3===0?Je.leafLight:Je.leaf,1)}
l("foliage",[d,.46+v*.94,y],[.075,v*.17,.071],Je.leaf),n.cypresses++}
for(let d of[-1,1])for(let[y,v]of[-9.9,-6.35,-2.75,1.25,5.18,9.6].entries())f(d*(d<0?10.78:10.93),v,1.7+y%3*.18,y+d*7);
function p(d,y,v){
o("limestone",[.29,.16,.29],[d,.11,y],Je.light),a("iron",[d,.1,y],[d,2.92+.14,y],.027,Je.light,.022,8),l("limestone",[d,2.92+.17,y],[.045,.045,.045],Je.ivory,1);
let I=d>0?-1:1,P=(N,F)=>[d+I*N*.69,2.92-F*.55,y+.045*Math.sin(N*8+v)*N];
for(let N=0;
N<2;
N++)for(let F=0;
F<7;
F++){
let B=F/7,U=(F+1)/7,D=N/2,G=(N+1)/2,H=N===0?"#d32b37":"#fff5e4";
c("fabric",P(B,D),P(U,D),P(B,G),H),c("fabric",P(U,D),P(U,G),P(B,G),H)}
n.flags++}
for(let[d,y]of[-8.6,-.85,4.3].entries())p(10.38,y,d);
p(-10.9,-10.4,5);
let x=-11.22;
o("limestone",[1.06,3.29,23.15],[-11.77,1.63,-.35],Je.stone);
for(let d of[.14,2.1,2.23,3.16,3.35])o("limestone",[1.2,d===2.1?.15:.1,23.35],[-11.73,d,-.35],Je.light);
o("terracotta",[1.17,.095,23.33],[-11.75,3.43,-.35],Je.clay);
for(let d=-11.9;
d<11.2;
d+=.22)o("terracotta",[1.2,.045,.048],[-11.73,3.49,d],Je.clayLight);
function b(d){
let _=new qi;
_.moveTo(-.64,.22),_.lineTo(.64,.22),_.lineTo(.64,1.27),_.absarc(0,1.27,.64,0,Math.PI,!1),_.lineTo(-.64,.22);
let w=new yo(_,12);
w.rotateY(Math.PI/2),w.translate(x+.015,0,d),r("glazing",w,Je.glass);
for(let I of[-.64-.065,.64+.065])o("limestone",[.125,1.1,.13],[x+.07,.76,d+I],Je.light),o("limestone",[.19,.12,.21],[x+.105,1.27,d+I],Je.light),o("limestone",[.22,.13,.22],[x+.09,.245,d+I],Je.edge);
let R=new Li(.64,.64+.13,16,1,0,Math.PI);
R.rotateY(Math.PI/2),R.translate(x+.142,1.27,d),r("limestone",R,Je.light),o("limestone",[.18,.17,.2],[x+.12,1.93,d],Je.light),o("iron",[.024,1.5,.045],[x+.045,.97,d],Je.iron),o("iron",[.026,.04,1.2],[x+.045,1.19,d],Je.iron),n.clubhouseArches++}
function g(d){
o("glazing",[.024,.77,1.08],[x+.027,2.65,d],Je.glass);
for(let v of[-.62,.62])o("limestone",[.14,.94,.15],[x+.09,2.64,d+v],Je.light);
o("limestone",[.18,.1,1.4],[x+.09,3.1,d],Je.light),o("limestone",[.44,.1,1.61],[x+.19,2.26,d],Je.light);
let y=x+.38;
for(let v of[2.36,2.73])a("iron",[y,v,d-.73],[y,v,d+.73],.021,Je.iron);
for(let v=0;
v<10;
v++){
let E=d-.69+v*.153;
if(a("iron",[y,2.35,E],[y,2.73,E],.011,Je.iron),v<9){
let _=new Qt(.055,.009,4,8);
_.scale(1,1.9,1),_.rotateY(Math.PI/2),_.translate(y,2.53,E+.076),r("iron",_,Je.iron)}
}
for(let v of[-.73,.73])a("iron",[x+.07,2.73,d+v],[y,2.73,d+v],.02,Je.iron);
n.balconies++}
function h(d){
let y=x+.16,v=x+.77,E=2.04,_=1.82,w=1.61,R=[y,E,d-w/2],I=[y,E,d+w/2],P=[v,_,d-w/2],N=[v,_,d+w/2];
c("fabric",R,I,P,Je.ivory),c("fabric",I,N,P,Je.ivory),o("fabric",[.025,.12,w],[v,_-.047,d],Je.ivory);
for(let F of[-w/2,w/2])a("iron",[y,E-.55,d+F],[v,_-.03,d+F],.012,Je.iron);
n.awnings++}
for(let[d,y]of[-9.95,-6.6,-3.25,.1,3.45,6.8,10.15].entries())b(y),g(y),d%2===1&&h(y),d<6&&(o("limestone",[.19,3.14,.22],[x+.06,1.6,y+1.68],Je.light),o("limestone",[.27,.14,.33],[x+.1,3.06,y+1.68],Je.light));
let M=0;
for(let[d,y]of t){
let v=vt(y);
y.forEach(_=>_.dispose()),v.computeBoundingBox(),v.computeBoundingSphere(),M+=v.attributes.position.count/3;
let E=new ot(v,s[d]);
E.name=`monaco-${d}`,E.castShadow=!1,E.receiveShadow=!0,e.add(E)}
let T=new qt().setFromObject(e);
return{
root:e,setVisible(d){
e.visible=!!d}
,debug(){
return{
name:"monaco-belle-epoque",title:"Monaco Garden Club",version:1,visible:e.visible,sceneryMeshes:e.children.length,triangles:M,...n,bounds:{
min:T.min.toArray(),max:T.max.toArray()}
,courtClearance:{
side:7.85,far:-10.95}
,seatingClearance:{
sideRailInner:10.18-.2,sideSeatOuter:9.84}
,castsCourtShadows:!1}
}
}
}
var jh=(i=0,e=0,t=0)=>new k(i,e,t),J_=jh(0,1,0),Ct={
stone:"#d9cfb8",light:"#f1e8d5",joint:"#bfb49d",navy:"#233c50",navyLight:"#314e61",red:"#ae3742",leaf:"#375433",leafLight:"#527044",soil:"#827159"}
,$_=[-5.15,.05,5.25];
function Nf(i){
let e=new je;
e.name="monaco-championship",e.visible=!1,i.add(e);
let t=new Map,n={
flags:0,planters:0,sideTerraceCheeks:0,rearTerraceCheeks:0,fasciaPanels:0}
,s={
limestone:new qe({
vertexColors:!0,roughness:.95}
),navy:new qe({
vertexColors:!0,roughness:.7,metalness:.12}
),trim:new qe({
vertexColors:!0,roughness:.87}
),foliage:new qe({
vertexColors:!0,roughness:1}
),fabric:new qe({
vertexColors:!0,roughness:.92,side:Tt}
)}
;
function r(x,b,g){
let h=b.index?b.toNonIndexed():b;
h!==b&&b.dispose(),h.attributes.normal||h.computeVertexNormals(),h.attributes.uv||h.setAttribute("uv",new ft(new Float32Array(h.attributes.position.count*2),2));
let M=new We(g),T=new Float32Array(h.attributes.position.count*3);
for(let y=0;
y<T.length;
y+=3)T[y]=M.r,T[y+1]=M.g,T[y+2]=M.b;
h.setAttribute("color",new ft(T,3));
let d=t.get(x)||[];
d.push(h),t.set(x,d)}
function o(x,b,g,h){
let M=new Mt(...b);
M.translate(...g),r(x,M,h)}
function a(x,b,g,h,M,T=h,d=6){
let y=jh(...b),v=jh(...g),E=v.clone().sub(y),_=new St(T,h,E.length(),d);
_.applyQuaternion(new _t().setFromUnitVectors(J_,E.normalize())),_.translate(...y.add(v).multiplyScalar(.5).toArray()),r(x,_,M)}
function l(x,b,g){
let h=new En(1,1);
h.scale(...b),h.translate(...x),r("foliage",h,g)}
function c(x,b,g,h){
let M=new st;
M.setAttribute("position",new De([...x,...b,...g],3)),M.computeVertexNormals(),r("fabric",M,h)}
for(let x of[-1,1]){
o("limestone",[5.2,.05,26],[x*10.5,-.005,-.55],Ct.stone);
for(let b=-12.7;
b<12;
b+=1.2)o("limestone",[5.17,.008,.016],[x*10.5,.024,b],Ct.joint);
for(let b of $_){
o("limestone",[.27,.6,4.4],[x*8.025,.3,b],Ct.stone),o("navy",[.018,.45,4.32],[x*7.883,.315,b],Ct.navy),o("trim",[.025,.035,4.34],[x*7.883,.56,b],Ct.red),o("limestone",[.31,.065,4.43],[x*8.025,.618,b],Ct.light),n.fasciaPanels++;
for(let g of[-1,1])for(let h=0;
h<4;
h++){
let M=.18+h*.36,T=x*(8.64+h*.75),d=b+g*2.2;
o("limestone",[.745,M+.035,.035],[T,(M+.035)/2,d],Ct.stone),o("limestone",[.75,.045,.055],[T,M+.0575,d],Ct.light),n.sideTerraceCheeks++}
o("limestone",[.15,1.33,4.43],[x*11.54,.665,b],Ct.stone),o("navy",[.017,.2,4.37],[x*11.4565,1.17,b],Ct.navy),o("limestone",[.2,.06,4.46],[x*11.54,1.365,b],Ct.light);
for(let g of[-1,0,1])a("navy",[x*11.54,1.39,b+g*2.16],[x*11.54,2.15,b+g*2.16],.022,Ct.navy);
for(let g of[1.78,2.15])a("navy",[x*11.54,g,b-2.16],[x*11.54,g,b+2.16],.022,Ct.navy)}
}
o("limestone",[17.8,.05,5.7],[0,-.005,-13.85],Ct.stone);
for(let x=-8.3;
x<8.4;
x+=1.2)o("limestone",[.016,.008,5.66],[x,.024,-13.85],Ct.joint);
for(let x of[-1,1]){
o("limestone",[6.4,.32,.22],[x*3.9,.16,-11.22],Ct.stone),o("navy",[6.31,.21,.018],[x*3.9,.185,-11.102],Ct.navy),o("trim",[6.32,.025,.022],[x*3.9,.304,-11.1],Ct.red),o("limestone",[6.44,.065,.27],[x*3.9,.3525,-11.22],Ct.light),n.fasciaPanels++;
for(let b=0;
b<5;
b++){
let g=-11.98-b*.79,h=.22+b*.39;
o("limestone",[.13,h+.035,.79],[x*6.83,(h+.035)/2,g],Ct.stone),o("limestone",[.18,.045,.79],[x*6.83,h+.0575,g],Ct.light),n.rearTerraceCheeks++}
}
o("limestone",[13.9,1.85,.18],[0,.925,-15.9],Ct.stone),o("navy",[13.78,.2,.018],[0,1.66,-15.801],Ct.navy),o("limestone",[14.02,.065,.24],[0,1.9,-15.9],Ct.light);
for(let x=-6.72;
x<=6.8;
x+=1.68)a("navy",[x,1.93,-15.9],[x,2.68,-15.9],.022,Ct.navy);
for(let x of[2.3,2.68])a("navy",[-6.72,x,-15.9],[6.72,x,-15.9],.022,Ct.navy);
function u(x,b){
let g=x*8.3;
o("limestone",[.66,.46,.76],[g,.23,b],Ct.stone),o("trim",[.685,.035,.785],[g,.445,b],Ct.red),o("limestone",[.73,.055,.83],[g,.493,b],Ct.light),o("limestone",[.57,.015,.66],[g,.528,b],Ct.soil),l([g,.83,b],[.31,.36,.32],Ct.leaf);
for(let h=0;
h<5;
h++){
let M=h*Math.PI*2/5;
l([g+Math.cos(M)*.15,.81+h%2*.11,b+Math.sin(M)*.15],[.16,.22,.16],h%3?Ct.leaf:Ct.leafLight)}
n.planters++}
for(let x of[-1,1])for(let b of[-9.1,8.85])u(x,b);
function m(x){
let b=x*8.045,g=-2.55,h=2.2,M=.58,T=.464;
o("limestone",[.29,.61,.29],[b,.305,g],Ct.stone),o("limestone",[.34,.055,.34],[b,.64,g],Ct.light),a("navy",[b,.668,g],[b,h+.07,g],.019,Ct.navyLight,.016,8);
let d=(y,v)=>[b+x*y*M,h-v*T,g+Math.sin(y*7)*y*.035];
for(let y=0;
y<2;
y++)for(let v=0;
v<7;
v++){
let E=v/7,_=(v+1)/7,w=y/2,R=(y+1)/2,I=y===0?"#bd2639":"#fff6e5";
c(d(E,w),d(_,w),d(E,R),I),c(d(_,w),d(_,R),d(E,R),I)}
n.flags++}
for(let x of[-1,1])m(x);
let f=0;
for(let[x,b]of t){
let g=vt(b);
b.forEach(M=>M.dispose()),g.computeBoundingBox(),g.computeBoundingSphere(),f+=g.attributes.position.count/3;
let h=new ot(g,s[x]);
h.name=`monaco-championship-${x}`,h.castShadow=!1,h.receiveShadow=!0,e.add(h)}
let p=new qt().setFromObject(e);
return{
root:e,setVisible(x){
e.visible=!!x}
,debug(){
return{
name:"monaco-championship",title:"Monaco Championship Court",version:1,visible:e.visible,sceneryMeshes:e.children.length,triangles:f,...n,bounds:{
min:p.min.toArray(),max:p.max.toArray()}
,courtClearance:{
side:7.85,far:-10.95}
,seatingClearance:{
sideSeatOuter:11.34,sideWallInner:11.44,rearSeatBack:-15.65,rearWallFront:-15.78,sideAisleWidth:.745}
,castsCourtShadows:!1}
}
}
}
var eu=(i=0,e=0,t=0)=>new k(i,e,t),K_=eu(0,1,0),Qh=i=>{
let e=Math.sin(i*71.719+13.47)*31917.131;
return e-Math.floor(e)}
,ht={
stone:"#d9c4a0",light:"#edddbe",shade:"#c7b18d",joint:"#baa17d",clay:"#b86e48",clayLight:"#ce895e",bark:"#796044",leaf:"#3b5130",leafLight:"#657345",leafDark:"#2d432c",olive:"#818564",flower:"#e9ddb0"}
;
function Uf(i){
let e=new je;
e.name="rome-garden-club",e.visible=!1,i.add(e);
let t=new Map,n={
gardenWallSections:0,pedestrianArches:0,cypresses:0,flowerPots:0,olivePots:0}
,s={
travertine:new qe({
vertexColors:!0,roughness:.97}
),terracotta:new qe({
vertexColors:!0,roughness:.96}
),foliage:new qe({
vertexColors:!0,roughness:1}
),flowers:new qe({
vertexColors:!0,roughness:.97}
)}
;
function r(h,M,T){
let d=M.index?M.toNonIndexed():M;
d!==M&&M.dispose(),d.attributes.normal||d.computeVertexNormals(),d.attributes.uv||d.setAttribute("uv",new ft(new Float32Array(d.attributes.position.count*2),2));
let y=new We(T),v=new Float32Array(d.attributes.position.count*3);
for(let _=0;
_<v.length;
_+=3)v[_]=y.r,v[_+1]=y.g,v[_+2]=y.b;
d.setAttribute("color",new ft(v,3));
let E=t.get(h)||[];
E.push(d),t.set(h,E)}
function o(h,M,T,d){
let y=new Mt(...M);
y.translate(...T),r(h,y,d)}
function a(h,M,T,d,y,v=d,E=8){
let _=eu(...M),w=eu(...T),R=w.clone().sub(_),I=new St(v,d,R.length(),E);
I.applyQuaternion(new _t().setFromUnitVectors(K_,R.normalize())),I.translate(..._.add(w).multiplyScalar(.5).toArray()),r(h,I,y)}
function l(h,M,T,d=0){
let y=new En(1,d);
y.scale(...M),y.translate(...h),r("foliage",y,T)}
function c(h,M){
let T=new Pn(M);
T.scale(1,.65,1),T.translate(...h),r("flowers",T,ht.flower)}
for(let h of[-1,1]){
o("travertine",[3.92,.045,24.6],[h*9.92,-.009,-.65],ht.stone),o("travertine",[.16,.08,23.75],[h*7.94,.038,-.5],ht.light);
for(let M=0;
M<23;
M++){
let T=-12.4+M*1.025;
o("travertine",[3.85,.008,.018],[h*9.92,.018,T],ht.shade);
for(let d of[8.72,10.04,11.35])o("travertine",[.015,.008,1.007],[h*(d+M%2*.36),.018,T+.512],ht.shade)}
for(let M of[-5.15,.05,5.25])for(let T of[-1,1])for(let d=0;
d<2;
d++){
let y=.18+d*.36;
o("travertine",[.75,y+.03,.11],[h*(8.64+d*.75),(y+.03)/2,M+T*2.26],ht.stone),o("travertine",[.78,.045,.15],[h*(8.64+d*.75),y+.052,M+T*2.26],ht.light)}
}
o("travertine",[17.7,.045,3.3],[0,-.009,-12.67],ht.stone);
for(let h=-8.3;
h<=8.3;
h+=1.05)o("travertine",[.018,.008,3.24],[h,.018,-12.67],ht.shade);
for(let h of[-11.45,-12.5,-13.55])o("travertine",[17.64,.008,.018],[0,.018,h],ht.shade);
function u(h,M,T,d="z",y=.9){
let v=(_,w,R=0)=>d==="z"?[h+R,w,M+_]:[h+_,w,M+R],E=(_,w,R)=>d==="z"?[R,w,_]:[_,w,R];
o("travertine",E(T,y,.25),v(0,y/2+.03),ht.stone),o("travertine",E(T+.03,.12,.31),v(0,.1),ht.shade),o("terracotta",E(T+.06,.08,.35),v(0,y+.073),ht.clay),o("terracotta",E(T+.07,.025,.36),v(0,y+.123),ht.clayLight);
for(let _ of[-1,1])for(let w=1;
w<=3;
w++){
o("travertine",E(T,.012,.009),v(0,.05+w*.22,_*.128),ht.joint);
for(let R=-T/2+.23+w%2*.38;
R<T/2-.12;
R+=.76)o("travertine",E(.011,.2,.009),v(R,.16+(w-1)*.22,_*.128),ht.joint)}
for(let _=-T/2+.24;
_<T/2;
_+=.48)o("terracotta",E(.012,.01,.35),v(_,y+.141),ht.clay);
n.gardenWallSections++}
function m(h,M,T=1.05){
o("travertine",[.48,T,.48],[h,T/2+.02,M],ht.stone);
for(let d of[.23,.47,.71,.95])if(d<T)for(let y of[-1,1])o("travertine",[.013,.014,.48],[h+y*.241,d,M],ht.joint),o("travertine",[.48,.014,.013],[h,d,M+y*.241],ht.joint);
o("travertine",[.55,.1,.55],[h,T+.04,M],ht.light),o("terracotta",[.58,.075,.58],[h,T+.128,M],ht.clay)}
for(let h of[-1,1]){
for(let M of[-5.15,.05,5.25])u(h*10.18,M,4.63);
for(let M of[-7.57,-2.55,2.65,7.67])m(h*10.18,M);
u(h*10.18,-9.61,1.42),u(h*10.18,9.17,2.5),u(h*10.57,10.52,1.06,"x",.72)}
for(let h of[-3.75,3.75])u(h,-13.44,6.13,"x",.86);
for(let h of[-6.9,-.56,.56,6.9])m(h,-13.44,.98);
function f(h,M,T,d,y,v=!1){
let E=.32*d,_=.23*d;
if(a("terracotta",[h,M,T],[h,M+E,T],_*.68,ht.clay,_,12),a("terracotta",[h,M+E-.035*d,T],[h,M+E+.035*d,T],_*1.09,ht.clayLight,_*1.09,12),a("foliage",[h,M+E+.027*d,T],[h,M+E+.033*d,T],_*.91,ht.leafDark,_*.91,10),v){
a("terracotta",[h,M+E,T],[h,M+E+d*.72,T],d*.038,ht.bark,d*.021,6);
for(let w=0;
w<9;
w++){
let R=w*2.39996,I=.24*d,P=h+Math.cos(R)*I,N=T+Math.sin(R)*I,F=M+E+d*(.65+Qh(y+w)*.3);
l([P,F,N],[.25*d,.23*d,.22*d],w%3?ht.olive:ht.leafLight,1)}
n.olivePots++}
else{
for(let w=0;
w<9;
w++){
let R=w*2.39996+y,I=(.12+Qh(y+w)*.12)*d,P=h+Math.cos(R)*I,N=T+Math.sin(R)*I,F=M+E+d*(.13+Qh(y+w+13)*.14);
l([P,F,N],[.145*d,.155*d,.135*d],w%3?ht.leaf:ht.leafLight);
for(let B=0;
B<2;
B++)c([P+Math.cos(R+B*2)*.085*d,F+.11*d,N+Math.sin(R+B*2)*.085*d],.037*d)}
n.flowerPots++}
}
for(let h of[-1,1]){
for(let[d,y]of[-7.57,-2.55,2.65,7.67].entries())f(h*10.18,1.218,y,.9,32+d+h*5);
let M=h*8.46,T=-9.35;
o("travertine",[.8,.53,.94],[M,.275,T],ht.stone),o("travertine",[.87,.07,1.01],[M,.573,T],ht.light),f(M,.615,T,.98,70+h*3);
for(let[d,y]of[-8.02,8.12].entries())f(h*11.05,.03,y,.9,81+d+h*3,!0)}
function p(h,M,T,d){
o("travertine",[.73,.43,.85],[h,.225,M],ht.stone),o("travertine",[.81,.065,.93],[h,.47,M],ht.light),a("foliage",[h,.5,M],[h,.51,M],.28,ht.leafDark,.28,8),a("terracotta",[h,.5,M],[h,T*.79,M],.043,ht.bark,.019,6);
for(let y=0;
y<9;
y++){
let v=y/8,E=.29*(1-.7*v),_=.74+v*T*.78;
l([h+Math.sin(y+d)*.026,_,M+Math.cos(y*1.7)*.025],[E,T*.18,E*.86],y%3?ht.leaf:ht.leafLight,1);
for(let w=0;
w<3;
w++){
let R=w*2.094+y*.9;
l([h+Math.cos(R)*E*.62,_-T*.04,M+Math.sin(R)*E*.62],[E*.59,T*.105,E*.52],w%2?ht.leaf:ht.leafDark)}
}
l([h,.78+T*.88,M],[.058,T*.12,.06],ht.leaf),n.cypresses++}
for(let h of[-1,1])p(h*10.3,-8.3,2.25,9+h*4),p(h*8.46,9.45,2.35,10+h*4);
function x(h,M){
for(let _ of[-1,1]){
let w=h+_*.695;
o("travertine",[.23,1.33,.36],[w,1.33/2+.03,M],ht.stone),o("travertine",[.32,.12,.46],[w,.1,M],ht.light),o("travertine",[.3,.08,.44],[w,1.33+.016,M],ht.light);
for(let R of[.35,.68,1.01])o("travertine",[.23,.014,.008],[w,R,M+.36/2+.005],ht.joint)}
function E(_,w,R,I,P,N="travertine"){
let F=new qi,B=3;
F.moveTo(Math.cos(R)*w,Math.sin(R)*w);
for(let D=1;
D<=B;
D++){
let G=R+(I-R)*D/B;
F.lineTo(Math.cos(G)*w,Math.sin(G)*w)}
for(let D=B;
D>=0;
D--){
let G=R+(I-R)*D/B;
F.lineTo(Math.cos(G)*_,Math.sin(G)*_)}
F.closePath();
let U=new _o(F,{
steps:1,depth:.36,bevelEnabled:!1}
);
U.translate(h,1.33,M-.36/2),r(N,U,P)}
for(let _=0;
_<11;
_++){
let w=_*Math.PI/11+.006,R=(_+1)*Math.PI/11-.006;
E(.58,.58+.23,w,R,_%3?ht.stone:ht.light),E(.58+.23+.014,.58+.23+.083,w,R,_%2?ht.clay:ht.clayLight,"terracotta")}
n.pedestrianArches++}
for(let h of[-1,1])x(h*9.25,-8.5);
let b=0;
for(let[h,M]of t){
let T=vt(M);
M.forEach(y=>y.dispose()),T.computeBoundingBox(),T.computeBoundingSphere(),b+=T.attributes.position.count/3;
let d=new ot(T,s[h]);
d.name=`rome-${h}`,d.castShadow=!1,d.receiveShadow=!0,e.add(d)}
let g=new qt().setFromObject(e);
return{
root:e,setVisible(h){
e.visible=!!h}
,debug(){
return{
name:"rome-garden-club",title:"Rome Garden Club",version:1,visible:e.visible,sceneryMeshes:e.children.length,triangles:b,...n,bounds:{
min:g.min.toArray(),max:g.max.toArray()}
,courtClearance:{
side:7.75,baseline:10.85}
,seatingClearance:{
sideWallInner:10.18-.175,sideSeatOuter:9.84}
,textures:0,transparentMaterials:0,castsCourtShadows:!1}
}
}
}
var tu=(i=0,e=0,t=0)=>new k(i,e,t),j_=tu(0,1,0),It={
stone:"#e0d1b3",light:"#f0e4ca",joint:"#c4b496",olive:"#4e5742",terracotta:"#b87752",rim:"#c98a63",leaf:"#3c512e",leafLight:"#647343",soil:"#75634a"}
,Q_=[-5.15,.05,5.25];
function Ff(i){
let e=new je;
e.name="rome-championship",e.visible=!1,i.add(e);
let t=new Map,n={
planters:0,sideTerraceCheeks:0,rearTerraceCheeks:0,fasciaPanels:0}
,s={
travertine:new qe({
vertexColors:!0,roughness:.96}
),olive:new qe({
vertexColors:!0,roughness:.77,metalness:.1}
),terracotta:new qe({
vertexColors:!0,roughness:.96}
),foliage:new qe({
vertexColors:!0,roughness:1}
)}
;
function r(p,x,b){
let g=x.index?x.toNonIndexed():x;
g!==x&&x.dispose(),g.attributes.normal||g.computeVertexNormals(),g.attributes.uv||g.setAttribute("uv",new ft(new Float32Array(g.attributes.position.count*2),2));
let h=new We(b),M=new Float32Array(g.attributes.position.count*3);
for(let d=0;
d<M.length;
d+=3)M[d]=h.r,M[d+1]=h.g,M[d+2]=h.b;
g.setAttribute("color",new ft(M,3));
let T=t.get(p)||[];
T.push(g),t.set(p,T)}
function o(p,x,b,g){
let h=new Mt(...x);
h.translate(...b),r(p,h,g)}
function a(p,x,b,g,h,M=g,T=6){
let d=tu(...x),y=tu(...b),v=y.clone().sub(d),E=new St(M,g,v.length(),T);
E.applyQuaternion(new _t().setFromUnitVectors(j_,v.normalize())),E.translate(...d.add(y).multiplyScalar(.5).toArray()),r(p,E,h)}
function l(p,x,b){
let g=new En(1,1);
g.scale(...x),g.translate(...p),r("foliage",g,b)}
for(let p of[-1,1]){
o("travertine",[5.2,.05,26],[p*10.5,-.005,-.55],It.stone);
for(let x=-12.7;
x<12;
x+=1.2)o("travertine",[5.17,.008,.016],[p*10.5,.024,x],It.joint);
for(let x of Q_){
o("travertine",[.27,.6,4.4],[p*8.025,.3,x],It.stone),o("olive",[.018,.45,4.32],[p*7.883,.315,x],It.olive),o("terracotta",[.025,.025,4.34],[p*7.883,.565,x],It.terracotta),o("travertine",[.31,.065,4.43],[p*8.025,.618,x],It.light),n.fasciaPanels++;
for(let b of[-1,1])for(let g=0;
g<4;
g++){
let h=.18+g*.36,M=p*(8.64+g*.75),T=x+b*2.2;
o("travertine",[.745,h+.035,.035],[M,(h+.035)/2,T],It.stone),o("travertine",[.75,.045,.055],[M,h+.0575,T],It.light),n.sideTerraceCheeks++}
o("travertine",[.15,1.33,4.43],[p*11.56,.665,x],It.stone),o("olive",[.017,.2,4.37],[p*11.4765,1.17,x],It.olive),o("travertine",[.2,.06,4.46],[p*11.56,1.365,x],It.light),o("terracotta",[.18,.018,4.43],[p*11.56,1.404,x],It.terracotta);
for(let b of[-1,0,1])a("olive",[p*11.56,1.42,x+b*2.16],[p*11.56,2.15,x+b*2.16],.022,It.olive);
for(let b of[1.78,2.15])a("olive",[p*11.56,b,x-2.16],[p*11.56,b,x+2.16],.022,It.olive)}
}
o("travertine",[17.8,.05,5.7],[0,-.005,-13.85],It.stone);
for(let p=-8.3;
p<8.4;
p+=1.2)o("travertine",[.016,.008,5.66],[p,.024,-13.85],It.joint);
for(let p of[-1,1]){
o("travertine",[6.4,.32,.22],[p*3.9,.16,-11.22],It.stone),o("olive",[6.31,.21,.018],[p*3.9,.185,-11.102],It.olive),o("terracotta",[6.32,.018,.022],[p*3.9,.3075,-11.1],It.terracotta),o("travertine",[6.44,.065,.27],[p*3.9,.3525,-11.22],It.light),n.fasciaPanels++;
for(let x=0;
x<5;
x++){
let b=-11.98-x*.79,g=.22+x*.39;
o("travertine",[.13,g+.035,.79],[p*6.83,(g+.035)/2,b],It.stone),o("travertine",[.18,.045,.79],[p*6.83,g+.0575,b],It.light),n.rearTerraceCheeks++}
}
o("travertine",[13.9,1.85,.18],[0,.925,-15.94],It.stone),o("olive",[13.78,.2,.018],[0,1.66,-15.841],It.olive),o("travertine",[14.02,.065,.24],[0,1.9,-15.94],It.light),o("terracotta",[13.98,.018,.22],[0,1.9415,-15.94],It.terracotta);
for(let p=-6.72;
p<=6.8;
p+=1.68)a("olive",[p,1.956,-15.94],[p,2.68,-15.94],.022,It.olive);
for(let p of[2.3,2.68])a("olive",[-6.72,p,-15.94],[6.72,p,-15.94],.022,It.olive);
function c(p,x){
let b=p*8.3;
o("travertine",[.66,.25,.76],[b,.125,x],It.stone),o("travertine",[.73,.055,.83],[b,.278,x],It.light),a("terracotta",[b,.308,x],[b,.64,x],.205,It.terracotta,.27,12),a("terracotta",[b,.615,x],[b,.67,x],.285,It.rim,.285,12),a("foliage",[b,.653,x],[b,.662,x],.244,It.soil,.244,12),l([b,.91,x],[.29,.31,.29],It.leaf);
for(let g=0;
g<5;
g++){
let h=g*Math.PI*2/5;
l([b+Math.cos(h)*.13,.89+g%2*.07,x+Math.sin(h)*.13],[.17,.21,.17],g%3?It.leaf:It.leafLight)}
n.planters++}
for(let p of[-1,1])for(let x of[-9.1,8.85])c(p,x);
let u=0,m=0;
for(let[p,x]of t){
let b=vt(x);
x.forEach(h=>h.dispose()),b.computeBoundingBox(),b.computeBoundingSphere(),u+=b.attributes.position.count/3,m+=Object.values(b.attributes).reduce((h,M)=>h+M.array.byteLength,0);
let g=new ot(b,s[p]);
g.name=`rome-championship-${p}`,g.castShadow=!1,g.receiveShadow=!0,e.add(g)}
let f=new qt().setFromObject(e);
return{
root:e,setVisible(p){
e.visible=!!p}
,debug(){
return{
name:"rome-championship",title:"Rome Championship Terraces",version:1,visible:e.visible,sceneryMeshes:e.children.length,triangles:u,attributeBytes:m,...n,bounds:{
min:f.min.toArray(),max:f.max.toArray()}
,courtClearance:{
side:7.85,far:-10.95}
,seatingClearance:{
sideSeatOuter:11.34,sideWallInner:11.46,rearSeatBack:-15.65,rearWallFront:-15.82,sideAisleWidth:.745,baselineAisleWidth:1.36,farFasciaTop:.385}
,textures:0,transparentMaterials:0,castsCourtShadows:!1}
}
}
}
var Si={
...Ns,hard:{
court:"#39749a",alley:"#326686",apron:"#304f61",ground:"#718175",seat:"#2c5054",stone:"#c3bdab",name:"NEW YORK"}
,grass:{
court:"#4b7b46",alley:"#487442",apron:"#355a3d",ground:"#7d8a67",seat:"#304d3b",stone:"#c9c4ac",name:"LONDON"}
,clay:{
court:"#be6545",alley:"#b55d3e",apron:"#985239",ground:"#7e826a",seat:"#38574c",stone:"#d0b69a",name:"PARIS"}
}
,Of=Object.freeze({
"dubai-open":Object.freeze({
venue:"hard",name:"DUBAI",court:"#337db0",alley:"#2b6d98",apron:"#315975",ground:"#ad9b7e",stone:"#dec9a3",seat:"#34878b",trim:"#f0d6a3",background:"#b8c5cb",hemisphereSky:"#f5ecd9",hemisphereGround:"#7b6d58",hemisphereIntensity:1.65,sun:"#ffedc8",sunIntensity:2.15,exposure:1}
),"los-angeles-open":Object.freeze({
venue:"hard",name:"LOS ANGELES",court:"#438db2",alley:"#37799d",apron:"#365b76",ground:"#8f9b8e",stone:"#ddb8a4",seat:"#b96958",trim:"#f1c4ad",background:"#bdcbd3",hemisphereSky:"#f3edeb",hemisphereGround:"#74645d",hemisphereIntensity:1.65,sun:"#ffe0c6",sunIntensity:2.1,exposure:1}
),"monaco-open":Object.freeze({
venue:"clay",name:"MONACO",court:"#c57452",alley:"#b96747",apron:"#a2573d",ground:"#7e8a85",stone:"#dbc7b0",seat:"#283e59",trim:"#f1d8b6",background:"#99b7c6",hemisphereSky:"#eaf5ff",hemisphereGround:"#6c6d58",hemisphereIntensity:1.65,sun:"#fff0d4",sunIntensity:2.2,exposure:1}
),"roma-open":Object.freeze({
venue:"clay",name:"ROMA",court:"#b86045",alley:"#a8553c",apron:"#8e4937",ground:"#868163",stone:"#d5bd98",seat:"#596245",trim:"#e8d5ad",background:"#a2ae94",hemisphereSky:"#f5e9d3",hemisphereGround:"#736947",hemisphereIntensity:1.6,sun:"#ffe0b7",sunIntensity:2.1,exposure:.99}
),"turin-finals":Object.freeze({
venue:"hard",name:"TURIN FINALS",court:"#3c739f",alley:"#336387",apron:"#3e3b58",ground:"#555264",stone:"#a9a1af",seat:"#554466",trim:"#dec285",background:"#45465e",hemisphereSky:"#e0e2ff",hemisphereGround:"#51445f",hemisphereIntensity:1.75,sun:"#fff0d3",sunIntensity:2.2,exposure:1.05}
),"new-york-open":Object.freeze({
venue:"hard",name:"NEW YORK OPEN",court:Si.hard.court,alley:Si.hard.alley,apron:Si.hard.apron,ground:"#233d50",stone:"#7c8b97",seat:"#294b67",trim:"#b8d8ee",background:"#10283f",hemisphereSky:"#c7e3ff",hemisphereGround:"#354960",hemisphereIntensity:1.65,sun:"#e8f2ff",sunIntensity:2,exposure:1.02}
),"paris-open":Object.freeze({
venue:"clay",name:"PARIS OPEN",court:"#c27050",alley:"#b56444",apron:"#965035",ground:"#777b63",stone:"#d5b899",seat:"#526647",trim:"#edd6ae",background:"#8b8770",hemisphereSky:"#f8e3c9",hemisphereGround:"#72654d",hemisphereIntensity:1.55,sun:"#ffe0ad",sunIntensity:2.15,exposure:.96}
),"london-open":Object.freeze({
venue:"grass",name:"LONDON OPEN",court:"#487848",stripe:"#537f4d",alley:"#416f43",apron:"#31583d",ground:"#748366",stone:"#c8c6af",seat:"#36533e",trim:"#e7dec0",background:"#819586",hemisphereSky:"#e5eff0",hemisphereGround:"#52644c",hemisphereIntensity:1.6,sun:"#fff8e3",sunIntensity:2.1,exposure:.96}
),"sydney-open":Object.freeze({
venue:"hard",name:"SYDNEY OPEN",court:"#287fa1",alley:"#25738f",apron:"#246878",ground:"#8eac9d",stone:"#dfd0ac",seat:"#397c80",trim:"#f2dfb7",background:"#a3c6cc",hemisphereSky:"#edfaff",hemisphereGround:"#597b70",hemisphereIntensity:1.65,sun:"#fff2d8",sunIntensity:2.3,exposure:.98}
)}
);
function ey(i,e){
let t=Of[e];
return{
...Si[i]||Si.hard,...t?.venue===i?t:{
}
}
}
var li=i=>{
let e=Math.sin(i*137.27+19.4)*28719.13;
return e-Math.floor(e)}
,nu=i=>{
let e=new Hn(i);
return e.colorSpace=Nt,e.anisotropy=4,e}
;
function Bf(i,e=Si[i]){
let t=document.createElement("canvas");
t.width=t.height=1024;
let n=t.getContext("2d");
if(n.fillStyle=e.court,n.fillRect(0,0,1024,1024),i==="grass"){
for(let s=0;
s<12;
s++)n.fillStyle=s%2?e.stripe?e.court:"#4b7c47":e.stripe||"#54834b",n.fillRect(0,s*1024/12,1024,1024/12);
for(let s of[12,1012]){
n.save(),n.translate(512,s),n.scale(1,.1);
let r=n.createRadialGradient(0,0,15,0,0,380);
r.addColorStop(0,"rgba(183,162,93,.25)"),r.addColorStop(1,"rgba(183,162,93,0)"),n.fillStyle=r,n.fillRect(-400,-400,800,800),n.restore()}
}
else n.fillStyle=e.alley,n.fillRect(0,0,92,1024),n.fillRect(932,0,92,1024),n.globalAlpha=i==="clay"?.035:.09,n.fillStyle="#ffffff",n.fillRect(92,245,840,534),n.globalAlpha=1;
for(let s=0;
s<48e3;
s++){
n.globalAlpha=.025+li(s+31)*.07,n.fillStyle=s%2?"#ffffff":"#263c31";
let r=li(s+190)*1024,o=li(s+811)*1024;
n.fillRect(r,o,i==="grass"?1:1.6,i==="grass"?3+li(s+25)*4:1.4)}
if(n.globalAlpha=1,i==="clay"){
n.strokeStyle="rgba(243,200,143,.035)",n.lineWidth=1;
for(let s=0;
s<90;
s++){
let r=li(s+800)*1024;
n.beginPath(),n.moveTo(r,0),n.lineTo(r+3,1024),n.stroke()}
n.strokeStyle="rgba(107,59,37,.09)",n.lineWidth=3;
for(let s=0;
s<75;
s++){
let r=120+li(s+91)*780,o=(s%2?980:25)+li(s+20)*20;
n.beginPath(),n.ellipse(r,o,5+li(s)*16,1,li(s+9)*Math.PI,0,Math.PI*1.7),n.stroke()}
}
return nu(t)}
function ty(){
let i=document.createElement("canvas");
i.width=i.height=256;
let e=i.getContext("2d");
e.fillStyle="#ffffff",e.fillRect(0,0,256,256);
for(let n=0;
n<9e3;
n++){
let s=225+li(n)*30;
e.fillStyle=`rgb(${s},${s},${s})`,e.fillRect(li(n+52)*256,li(n+98)*256,1,1)}
let t=nu(i);
return t.wrapS=t.wrapT=Kn,t.repeat.set(5,8),t}
function Hf(i){
let e=new Map,t=new je;
t.name="regular-court-surroundings",i.add(t);
let n=new je;
n.name="regular-court-landscaping",t.add(n);
let s=new je;
s.name="regular-court-outer-boundary",n.add(s);
let r=null,o=null,a=null,l=null,c=null,u=null,m=If(i),f=(j,de={
}
)=>new qe({
color:j,roughness:.96,...de}
),p=f(Si.hard.ground),x=f(Si.hard.apron,{
map:ty()}
),b=Object.fromEntries(Object.keys(Si).map(j=>[j,Bf(j)])),g=f("#ffffff",{
map:b.hard}
),h=f(Si.hard.stone),M=f("#293f3d"),T=f("#b09a70"),d=f("#47634a"),y=f("#607c50"),v=f("#1e3735"),E=(j,de,ge,Te)=>{
let Oe=new ot(new Kt(j,de),Te);
return Oe.rotation.x=-Math.PI/2,Oe.position.y=ge,Oe.receiveShadow=!0,i.add(Oe),Oe}
,_=E(80,80,-.065,p),w=E(21.8,29.8,-.04,h),R=E(15.4,21.6,-.017,x),I=E(11,16,0,g),P=(j,de,ge=t)=>{
let Te=e.get(ge)||new Map,Oe=Te.get(de)||[];
Oe.push(j),Te.set(de,Oe),e.set(ge,Te)}
,N=(j,de,ge,Te)=>{
let Oe=new Mt(...j);
Oe.translate(...de),P(Oe,ge,Te)}
,F=(j,de,ge,Te,Oe)=>{
let le=new St(j,j,de,8);
le.translate(...ge),P(le,Te,Oe)}
,B=(j,de,ge,Te)=>{
let Oe=new gt(1,10,7);
Oe.scale(...j),Oe.translate(...de),P(Oe,ge,Te)}
;
for(let j of[-1,1]){
N([.1,.055,21.65],[j*7.75,.005,0],h),N([15.55,.055,.1],[0,.005,j*10.85],h),N([.1,.015,19.8],[j*7.42,.006,0],v);
for(let de=-9.8;
de<9.9;
de+=.22)N([.12,.018,.025],[j*7.42,.009,de],h);
N([.13,.48,8.8],[j*7.86,.24,-.5],M),N([.2,.05,8.9],[j*7.86,.5,-.5],T);
for(let de of[6.3]){
N([.48,.11,1.8],[j*7,.48,de],T),N([.065,.42,1.8],[j*7.23,.76,de],T);
for(let ge of[-.66,.66])N([.39,.42,.08],[j*7,.22,de+ge],M);
N([.3,.46,.29],[j*7.02,.23,de-1.35],h),F(.14,.13,[j*7.02,.52,de-1.35],M)}
for(let de of[-8.6,8.6]){
N([.75,.42,1.32],[j*8.35,.21,de],h,n);
for(let ge=0;
ge<4;
ge++)B([.33,.35,.28],[j*8.35,.58,de-.43+ge*.29],ge%2?d:y,n)}
for(let de=-12;
de<11;
de+=1)B([.4,.4,.6],[j*11.2,.4,de],d,s)}
N([14.3,.54,.16],[0,.27,-10.9],M),N([14.4,.045,.22],[0,.56,-10.9],T);
let U=-6.85,D=-1.25;
for(let j of[-.23,.23])for(let de of[-.23,.23])N([.065,1.42,.065],[U+j,.71,D+de],M);
N([.64,.1,.64],[U,1.46,D],T),N([.07,.48,.64],[U-.29,1.71,D],M);
for(let j=0;
j<4;
j++)N([.08,.055,.46],[U+.38+j*.1,.28+j*.28,D],M);
let G=[];
for(let j of[-1,1]){
for(let de=-14.7;
de<=12;
de+=2.4)F(.034,1.25,[j*10.6,.61,de],M,s);
N([.04,.045,27],[j*10.6,1.25,-1.2],M,s);
for(let de=-14.7;
de<12;
de+=.24)G.push(j*10.6,.05,de,j*10.6,1.22,de+.55)}
for(let[j,de]of e)for(let[ge,Te]of de){
let Oe=new ot(vt(Te),ge);
Oe.castShadow=Oe.receiveShadow=!0,j.add(Oe),Te.forEach(le=>le.dispose())}
s.add(new On(new st().setAttribute("position",new De(G,3)),new un({
color:"#516d5d",transparent:!0,opacity:.28}
)));
let H=document.createElement("canvas");
H.width=1024,H.height=128;
let Y=nu(H),q=new ot(new Kt(3.8,.48),new cn({
map:Y,transparent:!0,depthWrite:!1}
));
q.rotation.x=-Math.PI/2,q.position.set(0,.007,9.65),i.add(q);
let Se=j=>({
dimensions:[j.geometry.parameters.width,j.geometry.parameters.height],position:j.position.toArray(),rotation:[j.rotation.x,j.rotation.y,j.rotation.z],scale:j.scale.toArray()}
),ye="",Re="",Ye="",Ne=null,ie=null,ce=Si.hard;
return{
setVenue(j,de,ge=null){
let Te=Of[de]?.venue===j?de:"";
Ne=Te&&Number.isInteger(ge)&&ge>=0&&ge<=4?ge:null;
let Oe=Te==="dubai-open",le=Te==="monaco-open",he=Oe&&(Ne===3||Ne===4),pe=le&&(Ne===3||Ne===4),me=Te==="roma-open"&&Ne!==null&&Ne<=2,be=Te==="roma-open"&&(Ne===3||Ne===4),Ue=["new-york-open","paris-open","london-open","sydney-open"].includes(Te),ke=Te||j,te=ke+(me?":early":he||pe||be?":finals":"");
if(Ye===te)return;
ye=j,Re=Te,Ye=te;
let V=ce=ey(j,Te);
Te&&!b[ke]&&(b[ke]=Bf(j,V)),g.map=b[ke]||b.hard,g.needsUpdate=!0,p.color.set(V.ground),x.color.set(V.apron),h.color.set(V.stone);
let C=!!Ns[j];
t.visible=w.visible=!C,s.scale.x=Ue?1.2:1,w.scale.set(Ue?1.22:1,Ue?1.16:1,1),ie=be?"rome-finals":me?"rome":pe?"monaco-finals":le?"monaco":he?"dubai-finals":Oe?"dubai":null,Oe&&!he&&!r&&(r=Pf(i)),he&&!o&&(o=Lf(i)),le&&!pe&&!a&&(a=Df(i)),pe&&!l&&(l=Nf(i)),me&&!c&&(c=Uf(i)),be&&!u&&(u=Ff(i)),r?.setVisible(Oe&&!he),o?.setVisible(he),a?.setVisible(le&&!pe),l?.setVisible(pe),c?.setVisible(me),u?.setVisible(be),n.visible=!Oe&&!le&&!me&&!be;
let Q=m.setVenue(j);
_.visible=!Q?.hideGround,i.background=Q?.background||new We(V.background||V.ground);
let z=H.getContext("2d");
z.clearRect(0,0,1024,128),z.textAlign="center",z.textBaseline="middle",z.fillStyle="#e7e4cf",z.font="600 66px Arial",z.fillText(V.name,512,64,960),Y.needsUpdate=!0}
,getPresentation(){
return{
hemisphereSky:"#e7eff0",hemisphereGround:"#52634b",hemisphereIntensity:1.55,sun:"#fff7e5",sunIntensity:2.25,exposure:.95,...ce,eventId:Re||null,tournamentRound:Ne,crowd:!Ns[ye]}
}
,layout:j=>m.layout(j),update:j=>m.update(j),debug(){
return{
venue:ye,eventId:Re||null,tournamentRound:Ne,stadiumVariant:ie,presentation:Ye,cachedCourtTextures:Object.keys(b).length,...m.debug(),stadium:(ie==="rome-finals"?u:ie==="rome"?c:ie==="monaco-finals"?l:ie==="monaco"?a:ie==="dubai-finals"?o:ie==="dubai"?r:null)?.debug()||null,stadiums:{
sailGarden:r?.debug()||null,championship:o?.debug()||null,monaco:a?.debug()||null,monacoChampionship:l?.debug()||null,rome:c?.debug()||null,romeChampionship:u?.debug()||null}
,courtSurfaces:{
court:Se(I),apron:Se(R)}
}
}
}
}
var ci=(i=0,e=0,t=0)=>new k(i,e,t),dc=ci(0,1,0),Bi=i=>{
let e=Math.sin(i*127.1+311.7)*43758.5453;
return e-Math.floor(e)}
,Yo=Ln.clamp,zf=["#e7e0cc","#849aab","#a46c56","#405e57","#b8b9a2","#566982","#ceb278","#b48586","#687b65","#ded4ba"],kf=["#e1b18c","#c38c64","#a76e4c","#775039","#eec8a3","#b77c59"],Gf=["#3b3028","#765642","#b19769","#242b29","#a9a397","#574538"],Vf=["#3d4b50","#5b625b","#847a65","#b6afa0","#354b5a"],iu={
hard:{
seat:"#526e67",trim:"#d9dfcb"}
,grass:{
seat:"#476548",trim:"#d9dbba"}
,clay:{
seat:"#675b4c",trim:"#e1d4b7"}
}
;
function Wf(i){
let e=new je;
e.name="club-spectator-stands",i.add(e);
let t={
structure:[],seats:[],trim:[],people:[]}
,n=[],s=[],r=new _t,o=new ct,a=ci(1,1,1),l=ci(),c=ci();
function u(V,C,Q,z){
let A=C.index?C.toNonIndexed():C.clone();
z&&A.applyMatrix4(z);
let S=new We(Q),O=new Float32Array(A.attributes.position.count*3);
for(let W=0;
W<O.length;
W+=3)O[W]=S.r,O[W+1]=S.g,O[W+2]=S.b;
A.setAttribute("color",new ft(O,3)),t[V].push(A),C.dispose()}
function m(V,C,Q,z,A){
let S=new Mt(...C);
S.translate(...Q),u(V,S,z,A)}
function f(V,C,Q,z,A){
let S=new gt(1,8,5);
S.scale(...C),S.translate(...Q),u(V,S,z,A)}
function p(V,C,Q,z,A,S){
let O=ci(...C),W=ci(...Q),X=W.clone().sub(O),$=new St(z,z,1,6,1),oe=new ct().compose(O.add(W).multiplyScalar(.5),new _t().setFromUnitVectors(dc,X.clone().normalize()),ci(1,X.length(),1));
$.applyMatrix4(oe),u(V,$,A,S)}
let x=(V,C,Q,z)=>new ct().compose(ci(V,C,Q),new _t().setFromAxisAngle(dc,z),ci(1,1,1));
function b(V){
m("seats",[.45,.065,.43],[0,.465,0],"#ffffff",V),m("seats",[.44,.29,.06],[0,.64,-.225],"#ffffff",V),m("trim",[.4,.018,.035],[0,.79,-.191],"#ffffff",V);
for(let C of[-.16,.16])p("structure",[C,.08,.13],[C,.45,.13],.022,"#354d48",V),p("structure",[C,.08,-.18],[C,.68,-.18],.022,"#354d48",V)}
function g(V,C,Q,z){
let A=n.length,S=x(V,C,Q,z),O=zf[Math.floor(Bi(A+8)*zf.length)],W=kf[Math.floor(Bi(A+26)*kf.length)],X=Gf[Math.floor(Bi(A+52)*Gf.length)],$=Vf[Math.floor(Bi(A+72)*Vf.length)],oe=.94+Bi(A+100)*.11,K=.91+Bi(A+143)*.14,ee=.56+.51*oe,ue=new St(.205*K,.172*K,.43*oe,10,1);
ue.scale(1,1,.66),ue.translate(0,.56+.215*oe,-.035),u("people",ue,O,S),f("people",[.175*K,.105,.13],[0,.545,-.012],$,S),p("people",[0,ee-.065,-.025],[0,ee+.03,-.025],.06,W,S),m("people",[.14,.018,.11],[0,ee-.017,-.025],A%3?"#dbd6c6":O,S);
for(let Ae of[-1,1]){
let Ee=Ae*(.098+(Bi(A+177)-.5)*.025);
p("people",[Ee,.535,.005],[Ee*1.22,.5,.29],.092,$,S),f("people",[.084,.075,.085],[Ee*1.22,.49,.3],$,S),p("people",[Ee*1.22,.46,.305],[Ee*1.28,.115,.36],.06,A%4===0?W:$,S),m("people",[.105,.055,.19],[Ee*1.28,.073,.402],A%3?"#d4d0bf":"#394748",S),m("people",[.11,.018,.2],[Ee*1.28,.04,.405],"#adb3aa",S)}
let Me={
id:A,x:V,floor:C,z:Q,yaw:z,frame:S,shirt:O,skin:W,hair:X,height:oe,width:K,headY:ee+.155,shoulderY:ee-.092,hat:A%9===2,longHair:A%5===1}
;
n.push(Me)}
function h(V,C,Q){
p("structure",V,C,.024,"#35504a",Q)}
let M=4,T=.79;
for(let V=0;
V<M;
V++){
let C=-11.98-V*T,Q=.22+V*.39;
for(let z of[-1,1]){
let A=x(z*3.62,0,C,0);
m("structure",[5.95,Q,.8],[0,Q/2,-.04],"#babbb0",A),m("structure",[5.94,.035,.78],[0,Q+.013,-.04],V%2?"#c8c7b8":"#d0cbbb",A),m("structure",[5.94,.045,.045],[0,Q+.006,.35],"#e1dfcd",A);
for(let S=0;
S<10;
S++){
let O=z*(.93+S*.582),W=x(O,Q,C-.14,0);
b(W),g(O,Q,C-.14,0)}
}
for(let z=0;
z<2;
z++){
let A=.025+V*.39+(z+1)*.195;
m("structure",[1.18,A,T/2],[0,A/2,C+.152-z*T/2],"#c3c1b1"),m("trim",[1.12,.015,.035],[0,A+.009,C+.338-z*T/2],"#ffffff")}
}
for(let V of[-1,1]){
for(let z=0;
z<M;
z++){
let A=.22+z*.39,S=-11.98-z*T;
h([V*6.61,A,S+.27],[V*6.61,A+.78,S+.27]),h([V*6.61,A+.78,S+.27],[V*6.61,A+.78,S-.45])}
let C=-14.8,Q=.22+(M-1)*.39;
for(let z=0;
z<5;
z++)h([V*(.67+z*1.48),Q,C],[V*(.67+z*1.48),Q+.93,C]);
h([V*.67,Q+.93,C],[V*6.6,Q+.93,C]),h([V*.67,Q+.58,C],[V*6.6,Q+.58,C])}
s.push({
name:"baseline",count:M*20,bounds:{
min:[-6.68,0,-14.86],max:[6.68,2.9,-11.43]}
}
);
let d=3,y=7,v=[-5.15,.05,5.25],E=4.38;
for(let V of[-1,1]){
let C=-V*Math.PI/2;
for(let Q of v){
for(let S=0;
S<d;
S++){
let O=V*(8.64+S*.75),W=.18+S*.36,X=x(O,0,Q,C);
m("structure",[E,W,.75],[0,W/2,-.05],"#b9bbae",X),m("structure",[E-.01,.03,.73],[0,W+.012,-.04],"#cbc7b5",X),m("structure",[E-.02,.04,.04],[0,W+.01,.3],"#e1dfcd",X);
for(let $=0;
$<y;
$++){
let oe=Q-1.8+$*.6,K=O+V*.19,ee=x(K,W,oe,C);
b(ee),g(K,W,oe,C)}
for(let $ of[-1,1])h([$*E/2,W,.2],[$*E/2,W+.77,.2],X),h([$*E/2,W+.77,.2],[$*E/2,W+.77,-.39],X)}
let z=.18+(d-1)*.36,A=x(V*(8.64+(d-1)*.75),0,Q,C);
for(let S of[-E/2,0,E/2])h([S,z,-.39],[S,z+.88,-.39],A);
h([-E/2,z+.88,-.39],[E/2,z+.88,-.39],A)}
for(let Q=1;
Q<v.length;
Q++){
let z=(v[Q-1]+v[Q])/2;
for(let A=0;
A<d*2;
A++){
let S=Math.min(.18+(d-1)*.36,(A+1)*.18);
m("structure",[.375,S,.72],[V*(8.48+A*.375),S/2,z],"#c3c1b1"),m("trim",[.035,.015,.66],[V*(8.308+A*.375),S+.009,z],"#ffffff")}
}
s.push({
name:V<0?"west":"east",count:d*y*v.length,bays:v.length,bounds:{
min:[V<0?-10.59:8.02,0,-7.37],max:[V<0?-8.02:10.59,2.4,7.47]}
}
)}
let _={
}
;
for(let[V,C]of Object.entries(t)){
let Q=vt(C);
C.forEach(S=>S.dispose());
let z=new qe({
color:"#ffffff",vertexColors:!0,roughness:V==="seats"?.77:.94}
),A=new ot(Q,z);
A.name=`audience-${V}`,A.castShadow=!0,A.receiveShadow=!0,e.add(A),_[V]=z}
function w(V,C,Q){
let z=new qe({
color:"#ffffff",roughness:.92}
),A=new As(C,z,Q);
return A.name=`audience-${V}`,A.instanceMatrix.setUsage(xs),A.castShadow=!0,A.receiveShadow=!0,A.frustumCulled=!1,e.add(A),A}
let R=n.length,I=new gt(1,10,8);
I.scale(.136,.167,.133);
let P=w("heads",I,R),N=new gt(1,10,5,0,Math.PI*2,0,Math.PI*.44);
N.scale(.153,.183,.151),N.translate(0,.004,-.002);
let F=w("hair",N,R),B=new gt(1,8,5);
B.scale(.145,.172,.075),B.translate(0,-.035,-.107);
let U=w("long-hair",B,n.filter(V=>V.longHair).length),D=[];
for(let V of[-1,1]){
let C=new Pn(.011);
C.scale(.8,1,1),C.translate(V*.046,.019,.124),D.push(C.index?C.toNonIndexed():C.clone()),C.dispose()}
let G=w("faces",vt(D),R);
D.forEach(V=>V.dispose());
let H=new Pn(1);
H.scale(.019,.023,.026),H.translate(0,-.015,.131);
let Y=w("noses",H,R),q=[],Se=new St(.124,.154,.08,12);
Se.translate(0,.163,-.004),q.push(Se.toNonIndexed()),Se.dispose();
let ye=new St(.185,.185,.018,12);
ye.scale(1,1,1.04),ye.translate(0,.122,.011),q.push(ye.toNonIndexed()),ye.dispose();
let Re=w("sun-hats",vt(q),n.filter(V=>V.hat).length);
q.forEach(V=>V.dispose());
let Ye=w("sleeves",new St(.07,.062,1,6),R*2),Ne=w("arms",new St(.047,.043,1,6),R*4),ie=w("hands",new gt(1,6,4),R*2),ce=[P,F,U,G,Y,Re,Ye,Ne,ie],j=new We,de=0,ge=0;
for(let V of n){
P.setColorAt(V.id,j.set(V.skin)),Y.setColorAt(V.id,j.set(V.skin)),F.setColorAt(V.id,j.set(V.hair)),G.setColorAt(V.id,j.set("#343733")),V.longHair&&(V.longIndex=de,U.setColorAt(de++,j.set(V.hair))),V.hat&&(V.hatIndex=ge,Re.setColorAt(ge++,j.set(V.id%2?"#e4ddc3":"#bdc8b4")));
for(let C=0;
C<2;
C++){
Ye.setColorAt(V.id*2+C,j.set(V.shirt)),ie.setColorAt(V.id*2+C,j.set(V.skin));
for(let Q=0;
Q<2;
Q++)Ne.setColorAt(V.id*4+C*2+Q,j.set(V.skin))}
}
function Te(V,C,Q,z,A=1){
l.copy(z).sub(Q),c.copy(Q).add(z).multiplyScalar(.5),a.set(A,l.length(),A),r.setFromUnitVectors(dc,l.normalize()),o.compose(c,r,a),V.setMatrixAt(C,o)}
let Oe=(V,C,Q,z)=>ci(C,Q,z).applyMatrix4(V.frame),le="hard",he=-1,pe=-1,me=null,be="",Ue={
reaction:"quiet",reactingCount:0,animationTime:0,gazeTarget:{
x:0,y:.6,z:0}
}
;
function ke(V,C={
}
){
le=iu[V]?V:"hard",_.seats.color.set(C.seat||iu[le].seat),_.trim.color.set(C.trim||iu[le].trim)}
function te(V){
let C=Number.isFinite(V.time)?V.time:0;
if(V.paused&&he>=0)return;
let Q=V.mode!=="menu"&&V.phase==="point"&&!!V.pointWinner,z=Q?`${V.stats?.pointsWon||0}:${V.stats?.pointsLost||0}:${V.pointWinner}`:null,A=[C,V.mode,V.phase,z,V.ball?.active,V.ball?.x,V.ball?.y,V.ball?.z].join(":");
if(A===be)return;
be=A,(C<he||V.mode==="menu")&&(pe=-1,me=null),z&&z!==me&&(pe=C),me=z,he=C;
let S=Q?Math.max(0,C-pe):-1,O=V.mode==="playing"&&V.phase==="rally"&&V.ball?.active,W=O?ci(Yo(V.ball.x*5.5,-6,6),Yo(V.ball.z*2.177,.2,3.3),Yo(V.ball.y*8,-9,9)):ci(0,.75,0),X=0;
for(let $ of n){
let oe=.12+Bi($.id+300)*.33,K=Q&&S>oe&&S<1.58&&Bi($.id+314)>.3;
K&&X++;
let ee=K?Math.min(1,(S-oe)*7,(1.58-S)*6):0,ue=C*(8.4+Bi($.id+340)*2)+$.id*1.31,Me=Math.atan2(W.x-$.x,W.z-$.z),Ae=Math.atan2(Math.sin(Me-$.yaw),Math.cos(Me-$.yaw)),Ee=$.yaw+Yo(Ae,-.53,.53)*.67,_e=Oe($,0,$.headY,-.022),He=O?Yo(($.floor+$.headY-W.y)/Math.max(5,Math.hypot(W.x-$.x,W.z-$.z)),-.1,.18):.035;
r.setFromEuler(new Sn(He,Ee,0,"YXZ")),a.set(1,$.height,1),o.compose(_e,r,a);
for(let Ke of[P,F,G,Y])Ke.setMatrixAt($.id,o);
$.longHair&&U.setMatrixAt($.longIndex,o),$.hat&&Re.setMatrixAt($.hatIndex,o);
for(let Ke=0;
Ke<2;
Ke++){
let Z=Ke?1:-1,Ie=Oe($,Z*.195*$.width,$.shoulderY,-.035),fe=Oe($,Z*(.237+ee*.018),.69+ee*.09,.115+ee*.055),Pe=Oe($,Z*(.145*(1-ee)+ee*(.041+.065*(.5+.5*Math.sin(ue)))),.575+ee*.365,.325+ee*.065),ze=Ie.clone().lerp(fe,.54);
Te(Ye,$.id*2+Ke,Ie,ze,$.width),Te(Ne,$.id*4+Ke*2,ze,fe),Te(Ne,$.id*4+Ke*2+1,fe,Pe),r.setFromAxisAngle(dc,$.yaw),a.set(.042,.052,.03),o.compose(Pe,r,a),ie.setMatrixAt($.id*2+Ke,o)}
}
for(let $ of ce)$.instanceMatrix.needsUpdate=!0;
Ue={
reaction:X?"applause":O?"watching":"quiet",reactingCount:X,animationTime:Math.round(C*1e4)/1e4,gazeTarget:{
x:+W.x.toFixed(3),y:+W.y.toFixed(3),z:+W.z.toFixed(3)}
}
}
return ke("hard"),te({
time:0,mode:"menu",phase:"menu"}
),{
update:te,setVenue:ke,debug:()=>({
count:R,seatedCount:R,standGroups:s.length,groups:s,venue:le,drawCalls:e.children.filter(V=>V.isMesh).length,...Ue}
)}
}
function hi(i,e=8){
let t=[],n=[],s=e+1;
for(let[l,c,u]of i)for(let m=0;
m<=e;
m++){
let f=m/e*Math.PI*2;
t.push(Math.cos(f)*c,l,Math.sin(f)*u)}
for(let l=0;
l<i.length-1;
l++)for(let c=0;
c<e;
c++){
let u=l*s+c,m=u+1,f=u+s;
n.push(u,f,m,m,f,f+1)}
for(let[l,c]of[[0,!0],[i.length-1,!1]]){
let u=t.length/3;
t.push(0,i[l][0],0);
for(let m=0;
m<e;
m++){
let f=l*s+m;
n.push(u,c?f:f+1,c?f+1:f)}
}
let r=new st;
r.setAttribute("position",new De(t,3)),r.setIndex(n),r.computeVertexNormals();
let o=r.attributes.normal,a=new k;
for(let l=0;
l<i.length;
l++){
let c=l*s,u=c+e;
a.set(o.getX(c)+o.getX(u),o.getY(c)+o.getY(u),o.getZ(c)+o.getZ(u)).normalize(),o.setXYZ(c,a.x,a.y,a.z),o.setXYZ(u,a.x,a.y,a.z)}
return r.setAttribute("uv",new De(new Float32Array(t.length/3*2),2)),r}
function fc(i=1,e=1){
return hi([[.555,.156,.105],[.66,.173,.119],[.86,.208,.13],[.945,.215,.119],[.988,.164,.092],[1.025,.068,.061]].map(([t,n,s])=>[.555+(t-.555)*i,n*e,s]),8)}
function pc(){
let i=new gt(1,10,7),e=i.attributes.position;
for(let s=0;
s<e.count;
s++){
let r=e.getY(s),o=1-Math.max(0,-r)*.24;
e.setXYZ(s,e.getX(s)*.121*o,r*.158,Math.min(e.getZ(s),.9)*.12)}
i.computeVertexNormals();
let t=[i.toNonIndexed()];
i.dispose();
for(let s of[-1,1]){
let r=new Pn(1);
r.scale(.012,.024,.017),r.translate(s*.118,-.008,0),t.push(r.index?r.toNonIndexed():r)}
let n=vt(t);
return t.forEach(s=>s.dispose()),n}
function mc(){
let i=new gt(1,10,6,0,Math.PI*2,0,Math.PI*.62),e=i.attributes.position;
for(let t=0;
t<e.count;
t++){
let n=e.getX(t),s=e.getY(t),r=e.getZ(t),o=Math.max(0,r)*Math.max(0,.55-s)*.205;
e.setXYZ(t,n*.137,s*.177+.011+o,r*.139-.005)}
return i.computeVertexNormals(),i}
function gc(){
let i=new Mt(1,1,1),e=i.attributes.position;
for(let t=0;
t<e.count;
t++){
let n=e.getX(t),s=e.getY(t),r=e.getZ(t),o=r>0;
e.setXYZ(t,n*(o?.108:.087),s>0?o?.055:.083:.015,r*.2)}
return i.computeVertexNormals(),i}
var Xf=Object.freeze([-5.15,.05,5.25]),Ki=(i,e,t,n,s,r={
}
)=>Object.freeze({
id:i,cacheKey:i,baselineRows:e,baselinePitch:.79,baselineFirstZ:-11.98,baselineSeatsPerHalf:10,sideRows:t,sideFirstX:8.64,sidePitch:.75,seatsPerBay:n,bayCenters:Xf,bayWidth:s,seatCapacity:e*20+t*n*Xf.length*2,...r}
),ys=Object.freeze({
regular:Ki("regular",4,3,7,4.38,{
cacheKey:"full"}
),major:Ki("major",6,5,7,4.38),tour:Ki("tour",3,2,7,4.38),roma:Ki("roma",2,2,7,4.38),"roma-finals":Ki("roma-finals",5,4,7,4.38),monaco:Ki("monaco",2,2,7,4.38),"monaco-finals":Ki("monaco-finals",5,4,7,4.38),dubai:Ki("dubai",2,2,5,3.25,{
emptySeatEvery:7,emptySeatOffset:3}
),"dubai-finals":Ki("dubai-finals",5,4,7,4.38,{
traditionalDress:!0}
)}
),Yf=Object.freeze({
"dubai-open":{
venue:"hard",layout:"dubai"}
,"los-angeles-open":{
venue:"hard",layout:"tour"}
,"monaco-open":{
venue:"clay",layout:"monaco"}
,"roma-open":{
venue:"clay",layout:"tour"}
,"turin-finals":{
venue:"hard",layout:"tour"}
,"new-york-open":{
venue:"hard",layout:"major"}
,"paris-open":{
venue:"clay",layout:"major"}
,"london-open":{
venue:"grass",layout:"major"}
,"sydney-open":{
venue:"hard",layout:"major"}
}
);
function xc(i,e,t){
let n=Object.hasOwn(Yf,i)?Yf[i]:null;
return!n||e&&n.venue!==e?ys.regular:i==="roma-open"&&Number.isInteger(t)&&t>=0&&t<=2?ys.roma:i==="roma-open"&&(t===3||t===4)?ys["roma-finals"]:i==="dubai-open"&&(t===3||t===4)?ys["dubai-finals"]:i==="monaco-open"&&(t===3||t===4)?ys["monaco-finals"]:ys[n.layout]}
var mn=(i=0,e=0,t=0)=>new k(i,e,t),qo=mn(0,1,0),Nn=i=>{
let e=Math.sin(i*127.1+311.7)*43758.5453;
return e-Math.floor(e)}
,Zo=Ln.clamp,qf=["#e7e0cc","#849aab","#a46c56","#405e57","#b8b9a2","#566982","#ceb278","#b48586","#687b65","#ded4ba"],Zf=["#e1b18c","#c38c64","#a76e4c","#775039","#eec8a3","#b77c59"],Jf=["#3b3028","#765642","#b19769","#242b29","#a9a397","#574538"],$f=["#3d4b50","#5b625b","#847a65","#b6afa0","#354b5a"],su={
hard:{
seat:"#526e67",trim:"#d9dfcb"}
,grass:{
seat:"#476548",trim:"#d9dbba"}
,clay:{
seat:"#675b4c",trim:"#e1d4b7"}
}
,ny={
"#354d48":"#a88b59","#35504a":"#b39968","#babbb0":"#dfcda9","#b9bbae":"#dfcda9","#c8c7b8":"#ede0c5","#d0cbbb":"#f2e7d0","#cbc7b5":"#f2e7d0","#e1dfcd":"#fff2d8","#c3c1b1":"#e5d3b2"}
,jf={
"#354d48":"#354744","#35504a":"#354744","#babbb0":"#ccbda3","#b9bbae":"#ccbda3","#c8c7b8":"#e4d8be","#d0cbbb":"#eaddc4","#cbc7b5":"#eaddc4","#e1dfcd":"#f4e8ce","#c3c1b1":"#deceb1"}
,iy={
...jf,"#354d48":"#263e50","#35504a":"#263e50"}
,sy={
"#354d48":"#4e5742","#35504a":"#4e5742","#babbb0":"#d5bd98","#b9bbae":"#d5bd98","#c8c7b8":"#e6d5b7","#d0cbbb":"#e6d5b7","#cbc7b5":"#e6d5b7","#e1dfcd":"#f0e2c7","#c3c1b1":"#ceb48e"}
,ry={
"#354d48":"#4e5742","#35504a":"#4e5742","#babbb0":"#e0d1b3","#b9bbae":"#e0d1b3","#c8c7b8":"#f0e4ca","#d0cbbb":"#f0e4ca","#cbc7b5":"#f0e4ca","#e1dfcd":"#f0e4ca","#c3c1b1":"#c4b496"}
;
function Kf(i,e){
let t=new je;
t.name="club-spectator-stands",t.userData.seatingLayout=e.cacheKey,i.add(t);
let n=e.id==="dubai"||e.id==="dubai-finals",s=e.id==="monaco"||e.id==="monaco-finals",r=e.id==="roma"||e.id==="roma-finals",o=e.id==="roma-finals"?ry:r?sy:n?ny:e.id==="monaco-finals"?iy:e.id==="monaco"?jf:null,a={
structure:[],seats:[],trim:[],people:[]}
,l=[],c=[],u=new _t,m=new ct,f=mn(1,1,1),p=mn(),x=mn();
function b(ne,xe,Fe,Be){
let Le=xe.index?xe.toNonIndexed():xe.clone();
Be&&Le.applyMatrix4(Be);
let rt=new We(o&&ne==="structure"&&o[Fe]||Fe),ut=new Float32Array(Le.attributes.position.count*3);
for(let dt=0;
dt<ut.length;
dt+=3)ut[dt]=rt.r,ut[dt+1]=rt.g,ut[dt+2]=rt.b;
Le.setAttribute("color",new ft(ut,3)),a[ne].push(Le),xe.dispose()}
function g(ne,xe,Fe,Be,Le){
let rt=new Mt(...xe);
rt.translate(...Fe),b(ne,rt,Be,Le)}
function h(ne,xe,Fe,Be,Le){
let rt=new gt(1,8,5);
rt.scale(...xe),rt.translate(...Fe),b(ne,rt,Be,Le)}
function M(ne,xe,Fe,Be,Le,rt){
let ut=mn(...xe),dt=mn(...Fe),Ce=dt.clone().sub(ut),Ht=new St(Be,Be,1,6,1),Ut=new ct().compose(ut.add(dt).multiplyScalar(.5),new _t().setFromUnitVectors(qo,Ce.clone().normalize()),mn(1,Ce.length(),1));
Ht.applyMatrix4(Ut),b(ne,Ht,Le,rt)}
let T=(ne,xe,Fe,Be)=>new ct().compose(mn(ne,xe,Fe),new _t().setFromAxisAngle(qo,Be),mn(1,1,1));
function d(ne){
g("seats",[.45,.065,.43],[0,.465,0],"#ffffff",ne),g("seats",[.44,.29,.06],[0,.64,-.225],"#ffffff",ne),g("trim",[.4,.018,.035],[0,.79,-.191],"#ffffff",ne);
for(let xe of[-.16,.16])M("structure",[xe,.08,.13],[xe,.45,.13],.022,"#354d48",ne),M("structure",[xe,.08,-.18],[xe,.68,-.18],.022,"#354d48",ne)}
function y(ne,xe,Fe,Be,Le,rt){
let ut=mn(...ne),dt=mn(...xe),Ce=dt.clone().sub(ut),Ht=hi([[-.5,Fe*.9,Fe*.86],[-.18,Fe,Fe*.94],[.5,Be*.95,Be*.9]],6);
Ht.applyMatrix4(new ct().compose(ut.add(dt).multiplyScalar(.5),new _t().setFromUnitVectors(qo,Ce.clone().normalize()),mn(1,Ce.length(),1))),b("people",Ht,Le,rt)}
function v(ne,xe,Fe){
let Be=[[.085,.184,.08,.35],[.2,.197,.087,.335],[.39,.211,.102,.304],[.485,.22,.15,.248],[.535,.203,.188,.144],[.578,.159,.129,.01]],Le=hi(Be.map(([ut,dt,Ce])=>[ut,dt*ne,Ce]),12),rt=Le.attributes.position;
for(let ut=0;
ut<Be.length;
ut++)for(let dt=0;
dt<=12;
dt++){
let Ce=ut*13+dt,Ht=dt/12*Math.PI*2,Ut=1+Math.cos(Ht*6)*.035;
rt.setXYZ(Ce,rt.getX(Ce)*Ut,rt.getY(Ce),rt.getZ(Ce)*Ut+Be[ut][3])}
rt.setZ(Be.length*13,Be[0][3]),rt.setZ(Be.length*13+1,Be.at(-1)[3]),Le.computeVertexNormals(),b("people",Le,xe,Fe)}
function E(ne,xe,Fe,Be){
let Le=l.length,rt=.9+Nn(Le+100)*.2,ut=.87+Nn(Le+143)*.24,dt=(Nn(Le+409)-.5)*.12,Ce=T(ne,xe,Fe,Be).multiply(new ct().makeTranslation(0,.54,0)).multiply(new ct().makeRotationX(dt)).multiply(new ct().makeTranslation(0,-.54,0)),Ht=Math.floor(Le/6),mt=e.traditionalDress&&Le%6===Math.floor(Nn(Ht+705)*6)?Nn(Ht+731)>.5?"kandura":"abaya":null,on=mt==="kandura"?"#f0ece1":mt==="abaya"?"#282b2e":qf[Math.floor(Nn(Le+8)*qf.length)],hn=Zf[Math.floor(Nn(Le+26)*Zf.length)],bn=Jf[Math.floor(Nn(Le+52)*Jf.length)],Zn=$f[Math.floor(Nn(Le+72)*$f.length)],Tn=.555+.47*rt,Mn=fc(rt,ut);
if(Mn.translate(0,0,-.035),b("people",Mn,on,Ce),mt)v(ut,on,Ce);
else{
let Un=hi([[.475,.125*ut,.095],[.53,.17*ut,.13],[.585,.157*ut,.112]],8);
Un.translate(0,0,-.012),b("people",Un,Zn,Ce)}
if(M("people",[0,Tn-.025,-.025],[0,Tn+.065,-.025],.048,hn,Ce),mt==="kandura"){
let Un=hi([[-.012,.055,.053],[.018,.055,.053]],8);
Un.translate(0,Tn-.001,-.03),b("people",Un,"#e4ded0",Ce),g("people",[.012,.132,.01],[0,Tn-.08,.086],"#e1dbcd",Ce)}
else if(!mt&&Le%3===0){
let Un=hi([[-.012,.057,.054],[.012,.057,.054]],8);
Un.translate(0,Tn-.005,-.03),b("people",Un,"#e8e1d0",Ce),g("people",[.017,.062,.01],[0,Tn-.047,.054],"#e8e1d0",Ce)}
let ji=.94+Nn(Le+177)*.17,Us=(Nn(Le+210)-.5)*.075;
for(let Un of[-1,1]){
let vs=Un*.095*ji,$o=[vs*1.24,.495,.29];
mt||(y([vs,.545,0],$o,.084,.074,Zn,Ce),y($o,[vs*1.32,.105,.365+Un*Us],.06,.041,Le%4===0?hn:Zn,Ce));
let Ir=gc();
Ir.translate(vs*1.32,.022,.407+Un*Us),b("people",Ir,Le%3?"#d4d0bf":"#394748",Ce),g("people",[.106,.013,.205],[vs*1.32,.043,.408+Un*Us],"#adb3aa",Ce)}
let yc={
id:Le,x:ne,floor:xe,z:Fe,yaw:Be,frame:Ce,shirt:on,skin:hn,hair:bn,height:rt,width:ut,attire:mt,headY:Tn+.184,shoulderY:Tn-.08,hat:!mt&&Le%9===2,longHair:!mt&&Le%5===1,rest:(Nn(Le+450)-.5)*.09,tilt:(Nn(Le+460)-.5)*.065}
;
l.push(yc)}
let _=0;
function w(ne,xe,Fe,Be){
d(T(ne,xe,Fe,Be)),(!e.emptySeatEvery||_%e.emptySeatEvery!==e.emptySeatOffset)&&E(ne,xe,Fe,Be),_++}
function R(ne,xe,Fe){
M("structure",ne,xe,.024,"#35504a",Fe)}
let{
baselineRows:I,baselinePitch:P}
=e;
for(let ne=0;
ne<I;
ne++){
let xe=e.baselineFirstZ-ne*P,Fe=.22+ne*.39;
for(let Be of[-1,1]){
let Le=T(Be*3.62,0,xe,0);
g("structure",[5.95,Fe,.8],[0,Fe/2,-.04],"#babbb0",Le),g("structure",[5.94,.035,.78],[0,Fe+.013,-.04],ne%2?"#c8c7b8":"#d0cbbb",Le),g("structure",[5.94,.045,.045],[0,Fe+.006,.35],"#e1dfcd",Le);
for(let rt=0;
rt<e.baselineSeatsPerHalf;
rt++){
let ut=Be*(.93+rt*.582);
w(ut,Fe,xe-.14,0)}
}
for(let Be=0;
Be<2;
Be++){
let Le=.025+ne*.39+(Be+1)*.195;
g("structure",[1.18,Le,P/2],[0,Le/2,xe+.152-Be*P/2],"#c3c1b1"),g("trim",[1.12,.015,.035],[0,Le+.009,xe+.338-Be*P/2],"#ffffff")}
}
for(let ne of[-1,1]){
for(let Be=0;
Be<I;
Be++){
let Le=.22+Be*.39,rt=e.baselineFirstZ-Be*P;
R([ne*6.61,Le,rt+.27],[ne*6.61,Le+.78,rt+.27]),R([ne*6.61,Le+.78,rt+.27],[ne*6.61,Le+.78,rt-.45])}
let xe=I===4?-14.8:e.baselineFirstZ-(I-1)*P-.45,Fe=.22+(I-1)*.39;
for(let Be=0;
Be<5;
Be++)R([ne*(.67+Be*1.48),Fe,xe],[ne*(.67+Be*1.48),Fe+.93,xe]);
R([ne*.67,Fe+.93,xe],[ne*6.6,Fe+.93,xe]),R([ne*.67,Fe+.58,xe],[ne*6.6,Fe+.58,xe])}
c.push({
name:"baseline",count:l.length,bounds:{
min:[-6.68,0,I===4?-14.86:e.baselineFirstZ-(I-1)*P-.51],max:[6.68,2.9-(4-I)*.39,-11.43]}
}
);
let{
sideRows:N,seatsPerBay:F,bayCenters:B,bayWidth:U}
=e;
for(let ne of[-1,1]){
let xe=l.length,Fe=-ne*Math.PI/2;
for(let Le of B){
for(let dt=0;
dt<N;
dt++){
let Ce=ne*(e.sideFirstX+dt*e.sidePitch),Ht=.18+dt*.36,Ut=T(Ce,0,Le,Fe);
g("structure",[U,Ht,.75],[0,Ht/2,-.05],"#b9bbae",Ut),g("structure",[U-.01,.03,.73],[0,Ht+.012,-.04],"#cbc7b5",Ut),g("structure",[U-.02,.04,.04],[0,Ht+.01,.3],"#e1dfcd",Ut);
for(let mt=0;
mt<F;
mt++){
let on=Le-(F===7?1.8:(F-1)*.3)+mt*.6,hn=Ce+ne*.19;
w(hn,Ht,on,Fe)}
for(let mt of[-1,1])R([mt*U/2,Ht,.2],[mt*U/2,Ht+.77,.2],Ut),R([mt*U/2,Ht+.77,.2],[mt*U/2,Ht+.77,-.39],Ut)}
let rt=.18+(N-1)*.36,ut=T(ne*(e.sideFirstX+(N-1)*e.sidePitch),0,Le,Fe);
for(let dt of[-U/2,0,U/2])R([dt,rt,-.39],[dt,rt+.88,-.39],ut);
R([-U/2,rt+.88,-.39],[U/2,rt+.88,-.39],ut)}
for(let Le=1;
Le<B.length;
Le++){
let rt=(B[Le-1]+B[Le])/2;
for(let ut=0;
ut<N*2;
ut++){
let dt=Math.min(.18+(N-1)*.36,(ut+1)*.18);
g("structure",[.375,dt,.72],[ne*(8.48+ut*.375),dt/2,rt],"#c3c1b1"),g("trim",[.035,.015,.66],[ne*(8.308+ut*.375),dt+.009,rt],"#ffffff")}
}
let Be=10.59-(3-N)*e.sidePitch;
c.push({
name:ne<0?"west":"east",count:l.length-xe,bays:B.length,bounds:{
min:[ne<0?-Be:8.02,0,U===4.38?-7.37:B[0]-U/2-.03],max:[ne<0?-8.02:Be,2.4-(3-N)*.36,U===4.38?7.47:B.at(-1)+U/2+.03]}
}
)}
let D={
}
;
for(let[ne,xe]of Object.entries(a)){
let Fe=vt(xe);
xe.forEach(rt=>rt.dispose());
let Be=new qe({
color:"#ffffff",vertexColors:!0,roughness:ne==="seats"?.77:.94}
),Le=new ot(Fe,Be);
Le.name=`audience-${ne}`,Le.castShadow=!0,Le.receiveShadow=!0,t.add(Le),D[ne]=Be}
function G(ne,xe,Fe){
let Be=new qe({
color:"#ffffff",roughness:.92}
),Le=new As(xe,Be,Fe);
return Le.name=`audience-${ne}`,Le.instanceMatrix.setUsage(xs),Le.castShadow=!0,Le.receiveShadow=!0,Le.frustumCulled=!1,t.add(Le),Le}
let H=l.length,Y=pc(),q=G("heads",Y,H),Se=mc(),ye=G("hair",Se,H),Re=new gt(1,8,5);
Re.scale(.131,.14,.065),Re.translate(0,-.05,-.104);
let Ye=G("long-hair",Re,l.filter(ne=>ne.longHair).length),Ne=[];
for(let ne of[-1,1]){
let xe=new Yi(.0055,6);
xe.scale(.9,1,1),xe.translate(ne*.039,.018,.109),Ne.push(xe.index?xe.toNonIndexed():xe.clone()),xe.dispose()}
let ie=G("faces",vt(Ne),H);
Ne.forEach(ne=>ne.dispose());
let ce=new Pn(1);
ce.scale(.013,.022,.018),ce.translate(0,-.012,.118);
let j=G("noses",ce,H),de=[],ge=new St(.124,.154,.08,12);
ge.translate(0,.174,-.004),de.push(ge.toNonIndexed()),ge.dispose();
let Te=new St(.185,.185,.018,12);
Te.scale(1,1,1.04),Te.translate(0,.139,.011),de.push(Te.toNonIndexed()),Te.dispose();
let Oe=G("sun-hats",vt(de),l.filter(ne=>ne.hat).length);
de.forEach(ne=>ne.dispose());
let le=G("sleeves",hi([[-.5,.071,.068],[0,.073,.069],[.5,.06,.058]],6),H*2),he=G("arms",new St(.047,.043,1,6),H*4),pe=G("hands",new gt(1,5,3),H*2),me=[q,ye,Ye,ie,j,Oe,le,he,pe],be=l.filter(ne=>ne.attire==="kandura"),Ue=l.filter(ne=>ne.attire==="abaya"),ke={
kandura:be.length,abaya:Ue.length,total:be.length+Ue.length}
;
function te(ne){
let xe=[],Fe=new gt(1,12,6,0,Math.PI*2,0,Math.PI*.55),Be=Fe.attributes.position;
for(let Ut=0;
Ut<Be.count;
Ut++){
let mt=Be.getX(Ut),on=Be.getY(Ut),hn=Be.getZ(Ut),bn=Math.max(0,hn)*Math.max(0,.58-on)*.125;
Be.setXYZ(Ut,mt*.142,on*.174+.016+bn,hn*.143-.014)}
Fe.computeVertexNormals(),xe.push(Fe.toNonIndexed()),Fe.dispose();
let Le=ne?[[.108,.139,.143,-.013],[-.025,.149,.135,-.025],[-.19,.169,.108,-.044],[-.305,.215,.085,-.052]]:[[.108,.138,.14,-.016],[-.032,.141,.128,-.029],[-.18,.124,.092,-.029],[-.29,.186,.082,-.033]],rt=[],ut=[],dt=12;
for(let[Ut,mt,on,hn]of Le)for(let bn=0;
bn<=dt;
bn++){
let Zn=Math.PI*(.35+bn/dt*1.3),Tn=1+(ne?Math.cos(bn*Math.PI)*.025:0);
rt.push(Math.sin(Zn)*mt*Tn,Ut,Math.cos(Zn)*on*Tn+hn)}
for(let Ut=0;
Ut<Le.length-1;
Ut++)for(let mt=0;
mt<dt;
mt++){
let on=Ut*(dt+1)+mt,hn=on+1,bn=on+dt+1;
ut.push(on,hn,bn,hn,bn+1,bn)}
let Ce=new st;
Ce.setAttribute("position",new De(rt,3)),Ce.setAttribute("uv",new De(new Float32Array(rt.length/3*2),2)),Ce.setIndex(ut),Ce.computeVertexNormals(),xe.push(Ce.toNonIndexed()),Ce.dispose();
let Ht=vt(xe);
return xe.forEach(Ut=>Ut.dispose()),Ht}
let V,C,Q;
if(ke.total){
V=G("ghutras",te(!0),be.length),V.material.side=Tt;
let ne=[];
for(let xe of[.115,.143]){
let Fe=new Qt(.142,.012,5,16);
Fe.rotateX(Math.PI/2),Fe.translate(0,xe,-.014),ne.push(Fe.toNonIndexed()),Fe.dispose()}
C=G("agals",vt(ne),be.length),ne.forEach(xe=>xe.dispose()),Q=G("headscarves",te(!1),Ue.length),Q.material.side=Tt,me.push(V,C,Q)}
let z=new We,A=0,S=0,O=0,W=0;
for(let ne of l){
q.setColorAt(ne.id,z.set(ne.skin)),j.setColorAt(ne.id,z.set(ne.skin)),ye.setColorAt(ne.id,z.set(ne.hair)),ie.setColorAt(ne.id,z.set("#343733")),ne.longHair&&(ne.longIndex=A,Ye.setColorAt(A++,z.set(ne.hair))),ne.hat&&(ne.hatIndex=S,Oe.setColorAt(S++,z.set(ne.id%2?"#e4ddc3":"#bdc8b4"))),ne.attire==="kandura"?(ne.clothIndex=O,V.setColorAt(O,z.set("#f5f0e5")),C.setColorAt(O++,z.set("#28292a"))):ne.attire==="abaya"&&(ne.clothIndex=W,Q.setColorAt(W++,z.set("#24272a")));
for(let xe=0;
xe<2;
xe++){
le.setColorAt(ne.id*2+xe,z.set(ne.shirt)),pe.setColorAt(ne.id*2+xe,z.set(ne.skin));
for(let Fe=0;
Fe<2;
Fe++)he.setColorAt(ne.id*4+xe*2+Fe,z.set(ne.attire?ne.shirt:ne.skin))}
}
function X(ne,xe,Fe,Be,Le=1){
p.copy(Be).sub(Fe),x.copy(Fe).add(Be).multiplyScalar(.5),f.set(Le,p.length(),Le),u.setFromUnitVectors(qo,p.normalize()),m.compose(x,u,f),ne.setMatrixAt(xe,m)}
let $=(ne,xe,Fe,Be,Le)=>Le.set(xe,Fe,Be).applyMatrix4(ne.frame),oe=mn(),K=mn(),ee=mn(),ue=mn(),Me=mn(),Ae=mn(),Ee=new Sn(0,0,0,"YXZ"),_e=[q,ye,ie,j],He=new ct,Ke=mn(0,0,0),Z="hard",Ie=-1,fe=-1,Pe=null,ze="",ve={
reaction:"quiet",reactingCount:0,animationTime:0,gazeTarget:{
x:0,y:.6,z:0}
}
;
function nt(ne,xe={
}
){
Z=su[ne]?ne:"hard",D.seats.color.set(xe.seat||(r?"#596245":n?"#29a6b4":s?"#283e59":su[Z].seat)),D.trim.color.set(xe.trim||(r?"#e8d5ad":n?"#fff2d8":s?"#f1d8b6":su[Z].trim))}
function Qe(ne){
let xe=Number.isFinite(ne.time)?ne.time:0;
if(ne.paused&&Ie>=0)return;
let Fe=ne.mode!=="menu"&&ne.phase==="point"&&!!ne.pointWinner,Be=Fe?`${ne.stats?.pointsWon||0}:${ne.stats?.pointsLost||0}:${ne.pointWinner}`:null,Le=[Math.floor(xe*30),ne.mode,ne.phase,Be,ne.ball?.active].join(":");
if(Le===ze)return;
ze=Le,(xe<Ie||ne.mode==="menu")&&(fe=-1,Pe=null),Be&&Be!==Pe&&(fe=xe),Pe=Be,Ie=xe;
let rt=Fe?Math.max(0,xe-fe):-1,ut=ne.mode==="playing"&&ne.phase==="rally"&&ne.ball?.active;
ut?oe.set(Zo(ne.ball.x*5.5,-6,6),Zo(ne.ball.z*2.177,.2,3.3),Zo(ne.ball.y*8,-9,9)):oe.set(0,.75,0);
let dt=0;
for(let Ce of l){
let Ht=.12+Nn(Ce.id+300)*.33,Ut=Fe&&rt>Ht&&rt<1.58&&Nn(Ce.id+314)>.3;
Ut&&dt++;
let mt=Ut?Math.min(1,(rt-Ht)*7,(1.58-rt)*6):0,on=xe*(8.4+Nn(Ce.id+340)*2)+Ce.id*1.31,hn=Math.atan2(oe.x-Ce.x,oe.z-Ce.z),bn=Math.atan2(Math.sin(hn-Ce.yaw),Math.cos(hn-Ce.yaw)),Zn=Ce.yaw+Zo(bn,-.53,.53)*.67;
$(Ce,0,Ce.headY,-.022,K);
let Tn=ut?Zo((Ce.floor+Ce.headY-oe.y)/Math.max(5,Math.hypot(oe.x-Ce.x,oe.z-Ce.z)),-.1,.18):.035;
u.setFromEuler(Ee.set(Tn,Zn,Ce.tilt)),f.set(Ce.width,.94+Ce.height*.06,.96+Ce.width*.04),m.compose(K,u,f);
for(let Mn of _e)Mn.setMatrixAt(Ce.id,m);
Ce.longHair&&Ye.setMatrixAt(Ce.longIndex,m),Ce.hat&&Oe.setMatrixAt(Ce.hatIndex,m),Ce.attire&&(ye.setMatrixAt(Ce.id,He.copy(m).scale(Ke)),Ce.attire==="kandura"?(V.setMatrixAt(Ce.clothIndex,m),C.setMatrixAt(Ce.clothIndex,m)):Q.setMatrixAt(Ce.clothIndex,m));
for(let Mn=0;
Mn<2;
Mn++){
let ji=Mn?1:-1;
$(Ce,ji*.198*Ce.width,Ce.shoulderY,-.035,ee),$(Ce,ji*(.224+mt*.018),.7+Ce.rest*(1-mt)+mt*.09,.115+mt*.055,ue),$(Ce,ji*(.132*(1-mt)+mt*(.041+.065*(.5+.5*Math.sin(on)))),.582+Ce.rest*(1-mt)+mt*.365,.325+mt*.065,Me),Ae.copy(ee).lerp(ue,.54),X(le,Ce.id*2+Mn,ee,Ae,Ce.width*(Ce.attire?1.12:1)),X(he,Ce.id*4+Mn*2,Ae,ue,Ce.attire?1.42:1),X(he,Ce.id*4+Mn*2+1,ue,Me,Ce.attire?1.3:1),u.setFromAxisAngle(qo,Ce.yaw),f.set(.036,.045,.027),m.compose(Me,u,f),pe.setMatrixAt(Ce.id*2+Mn,m)}
}
for(let Ce of me)Ce.instanceMatrix.needsUpdate=!0;
ve={
reaction:dt?"applause":ut?"watching":"quiet",reactingCount:dt,animationTime:Math.round(xe*1e4)/1e4,gazeTarget:{
x:+oe.x.toFixed(3),y:+oe.y.toFixed(3),z:+oe.z.toFixed(3)}
}
}
return nt("hard"),Qe({
time:0,mode:"menu",phase:"menu"}
),{
root:t,update:Qe,setVenue:nt,resetAnimation(){
Ie=-1,fe=-1,Pe=null,ze=""}
,debug:()=>({
assetVersion:"v2",updateHz:30,count:H,seatedCount:H,standGroups:c.length,groups:c,venue:Z,drawCalls:t.children.filter(ne=>ne.isMesh).length,traditionalAttire:{
...ke}
,...ve}
)}
}
function ru(i){
let e=ys.regular,t=null,n=new Map([[e.cacheKey,Kf(i,e)]]),s=n.get(e.cacheKey);
return{
setVenue(r,o={
}
){
let a=xc(o.eventId,r,o.tournamentRound);
t=a.id==="regular"?null:o.eventId,n.has(a.cacheKey)||n.set(a.cacheKey,Kf(i,a));
let l=s;
s=n.get(a.cacheKey),e=a;
for(let c of n.values())c.root.visible=c===s;
l!==s&&s.resetAnimation(),s.setVenue(r,o)}
,update(r){
s.update(r)}
,debug:()=>({
...s.debug(),eventId:t,seatingLayout:e.id,seatCapacity:e.seatCapacity,emptySeats:e.seatCapacity-s.debug().count,baselineRows:e.baselineRows,sideRows:e.sideRows,seatsPerBay:e.seatsPerBay,bayWidth:e.bayWidth,cachedLayouts:n.size}
)}
}
var oy="v2";
function ay(i=globalThis.location?.search||""){
let e=new URLSearchParams(i).get("crowdAsset");
return e==="legacy"||e==="v2"?e:oy}
function Qf(i){
if(ay()!=="legacy")return ru(i);
let e=new je;
i.add(e);
let t=Wf(e),n,s,r=t;
return{
setVenue(o,a={
}
){
let l=xc(a.eventId,o,a.tournamentRound).id!=="regular";
l&&!s&&(n=new je,i.add(n),s=ru(n)),e.visible=!l,n&&(n.visible=l),r=l?s:t,r.setVenue(o,a)}
,update(o){
r.update(o)}
,debug:()=>r.debug()}
}
function ep(i){
let e=new URLSearchParams(globalThis.location?.search||"").get("umpire")!=="off",t=new je;
t.name="chair-umpire",t.position.set(-6.85,1.0125,-1.25),t.rotation.y=Math.PI/2,i.add(t);
let n=new qe({
vertexColors:!0,roughness:.86}
),s="#263e54",r="#dedbca",o="#b98059",a="#4c4740",l="#f1eee2",c="#26332e",u=new Map,m=new k(0,1,0);
function f(I,P,N,F=[0,0,0],B=null){
let U=P.index?P.toNonIndexed():P.clone();
P.dispose(),B&&U.applyMatrix4(new ct().makeRotationFromEuler(new Sn(...B))),U.translate(...F);
let D=new We(N),G=new Float32Array(U.attributes.position.count*3);
for(let Y=0;
Y<G.length;
Y+=3)G[Y]=D.r,G[Y+1]=D.g,G[Y+2]=D.b;
U.setAttribute("color",new ft(G,3));
let H=u.get(I)||[];
H.push(U),u.set(I,H)}
let p=(I,P,N,F,B)=>f(I,new Mt(...P),F,N,B),x=(I,P,N,F)=>{
let B=new gt(1,8,5);
B.scale(...P),f(I,B,F,N)}
;
function b(I,P,N,F,B,U){
let D=new k(...P),G=new k(...N),H=G.clone().sub(D),Y=hi([[-.5,B*.85,B*.82],[-.3,B,B*.94],[.32,F,F*.94],[.5,F*.85,F*.82]],8);
Y.applyMatrix4(new ct().compose(D.add(G).multiplyScalar(.5),new _t().setFromUnitVectors(m,H.clone().normalize()),new k(1,H.length(),1))),f(I,Y,U)}
f(t,fc(1,1.04),s,[0,0,-.035]),f(t,hi([[.475,.135,.095],[.53,.17,.13],[.585,.158,.112]],8),r,[0,0,-.012]),b(t,[0,1.005,-.025],[0,1.1,-.025],.047,.048,o),f(t,hi([[-.012,.058,.054],[.012,.058,.054]],10),l,[0,1.019,-.03]),p(t,[.019,.068,.01],[0,.975,.056],l),p(t,[.035,.031,.008],[-.09,.927,.081],l);
for(let I of[-1,1]){
b(t,[I*.1,.548,0],[I*.13,.497,.3],.083,.074,r),b(t,[I*.13,.497,.3],[I*.145,.112,.37],.06,.042,r),f(t,gc(),c,[I*.145,.025,.417]),p(t,[.108,.015,.208],[I*.145,.044,.418],"#172821");
let P=[I*.203,.945,-.035],N=[I*.216,.833,.047],F=[I*.22,.75,.12];
b(t,P,N,.074,.062,s),b(t,N,F,.048,.043,o),I<0&&(b(t,F,[-.09,.691,.29],.043,.029,o),x(t,[.035,.03,.047],[-.09,.69,.29],o))}
p(t,[.264,.014,.195],[0,.663,.283],s,[.1,0,0]),p(t,[.226,.005,.156],[0,.674,.283],l,[.1,0,0]);
let g=new je;
g.name="scorekeeping-hand",g.position.set(.22,.75,.12),t.add(g),b(g,[0,0,0],[-.151,-.055,.163],.043,.029,o),x(g,[.035,.03,.045],[-.151,-.055,.163],o),b(g,[-.16,-.039,.128],[-.164,-.083,.221],.004,.004,"#cbb67c");
let h=new je;
h.name="umpire-head",h.position.set(0,1.215,-.022),t.add(h),f(h,pc(),o),f(h,mc(),a);
for(let I of[-1,1]){
let P=new Yi(.0055,6);
f(h,P,"#29322c",[I*.039,.018,.109])}
let M=new Pn(1);
M.scale(.013,.022,.018),f(h,M,o,[0,-.012,.118]);
for(let[I,P]of u){
let N=vt(P);
P.forEach(B=>B.dispose());
let F=new ot(N,n);
F.castShadow=F.receiveShadow=!0,I.add(F)}
let T=0;
t.traverse(I=>{
I.isMesh&&(T+=I.geometry.attributes.position.count/3)}
),u.clear();
let d=!0,y="hard",v=-1,E="watching",_=0;
function w(I){
y=I,d=e&&["hard","grass","clay"].includes(I),t.visible=d}
function R(I){
if(!d||I.paused&&v>=0)return;
let P=Number.isFinite(I.time)?I.time:0;
v=P;
let N=I.mode==="playing"&&["rally","serveToss"].includes(I.phase)&&I.ball,F=I.mode==="playing"&&I.phase==="point";
_=N?Ln.clamp(Math.atan2(I.ball.x*5.5-t.position.x,I.ball.y*8-t.position.z)-Math.PI/2,-.52,.52):0,h.rotation.set(F?.3:N?.1:.04,_,0,"YXZ"),g.rotation.set(0,F?Math.sin(P*7)*.025:0,F?Math.sin(P*9)*.035:0),E=F?"scorekeeping":N?"watching-ball":"ready"}
return w("hard"),R({
time:0,mode:"menu"}
),{
setVenue:w,update:R,debug:()=>({
visible:d,venue:y,motion:E,headYaw:_,position:t.position.toArray(),drawCalls:3,triangles:T}
)}
}
var _c=i=>{
let e=Math.max(0,Math.min(1,i));
return e*e*(3-2*e)}
;
function tp(i,e,{
enabled:t=!0}
={
}
){
let n=new je;
n.name="net-post-lights",n.visible=!1,i.add(n);
let s=globalThis.matchMedia?.("(prefers-reduced-motion: reduce)"),r=new Uint8Array(2048*4);
for(let b=0;
b<64;
b++)for(let g=0;
g<32;
g++){
let h=(b*32+g)*4;
r[h]=r[h+1]=r[h+2]=255,r[h+3]=Math.round(255*(1-Math.abs(g/31*2-1))**2*_c(b/8)*_c((63-b)/8))}
let o=new ws(r,32,64);
o.magFilter=o.minFilter=kt,o.needsUpdate=!0;
let a=new cn({
color:"#ff6358",transparent:!0,opacity:0,depthWrite:!1,toneMapped:!1}
),l=new cn({
color:"#ff4e3f",map:o,transparent:!0,opacity:0,depthWrite:!1,toneMapped:!1,blending:Ao}
);
function c(b,g,h){
let M=[];
for(let d of[-1,1])for(let y=0;
y<4;
y++){
let v=y*Math.PI/2,E=(y%2?.05:.065)+h,_=new Kt(b,g);
_.rotateY(v),_.translate(d*e+Math.sin(v)*E,.58,Math.cos(v)*E),M.push(_)}
let T=vt(M);
return M.forEach(d=>d.dispose()),T}
let u=new ot(c(.032,.92,.002),a);
u.name="net-post-led-strips";
let m=new ot(c(.18,1.02,.003),l);
m.name="net-post-led-halo",n.add(u,m);
let f=0,p=0,x=!1;
return{
update(b){
let g=b.outFeedback,h=Math.max(0,g?.remaining||0);
p=Math.round(h*1e3),x=!!s?.matches,n.visible=t&&b.mode==="playing"&&!b.paused&&h>0;
let M=Math.max(0,(g?.duration||1.3)-h);
f=n.visible?x?.65:(.35+.65*_c(M/.1))*_c(h/.42):0,a.opacity=.92*f,l.opacity=.3*f}
,debug:()=>({
visible:n.visible,intensity:+f.toFixed(3),remainingMs:p,reducedMotion:x,posts:2,drawCalls:n.visible?2:0,triangles:n.visible?32:0}
)}
}
function ou(i,e,t,n,s){
if(e<=0||s<=0)return e;
let r=1-36/s,o=n[5]-r*n[7];
if(Math.abs(o)<1e-9)return e;
let a=(r*(n[3]*i+n[11]*t+n[15])-(n[1]*i+n[9]*t+n[13]))/o;
if(a<=.072)return e;
let l=Math.max(.072,a-.75);
if(e<=l)return e;
let c=a-l;
return l+c*-Math.expm1(-(e-l)/c)}
var ni=window.TennisPhysics.COURT,Lt=ni.renderX,nn=ni.renderY,ui=2.177,Yn=(i=0,e=0,t=0)=>new k(i,e,t),Jo=(i,e={
}
)=>new qe({
color:i,roughness:.95,flatShading:!0,...e}
),qn=(i,e,t,n=[0,0,0])=>{
let s=new ot(i,e);
return s.position.set(...n),s.castShadow=!0,s.receiveShadow=!0,t.add(s),s}
,Cr=(i,e,t,n)=>qn(new Mt(...e),n,i,t);
function np(i,e,t,n=.012){
return qn(new Gn(new yn(e),Math.max(2,e.length*2),n,5,!1),t,i)}
function ly(){
let i=document.createElement("canvas");
i.width=1024,i.height=640;
let e=i.getContext("2d");
e.fillStyle="#173d33",e.fillRect(0,0,i.width,i.height),e.strokeStyle="#789486",e.lineWidth=8,e.strokeRect(20,20,984,600),e.fillStyle="#f5d49b",e.beginPath(),e.roundRect(420,88,184,128,24),e.fill(),e.fillStyle="#173d33",e.beginPath(),e.arc(512,152,39,0,Math.PI*2),e.fill(),e.fillStyle="#f5d49b",e.beginPath(),e.arc(512,152,23,0,Math.PI*2),e.fill(),e.textAlign="center",e.fillStyle="#f5f4ed",e.font="900 102px Arial, sans-serif",e.fillText("FAMILYSHOOT",512,370,900),e.fillStyle="#b7cec0",e.font="500 48px Arial, sans-serif",e.fillText("familyshoot.com \u2197",512,478);
let t=new Hn(i);
return t.colorSpace=Nt,t}
function cy(i,e){
let t=ly();
t.anisotropy=e.capabilities.getMaxAnisotropy();
let n=new cn({
map:t,toneMapped:!1}
),s=Jo("#243d33"),r=Jo("#172a23"),o=1.2,a=1.25*o,l=.8*o,c=.42*o,u=[];
for(let f of[-1,1])for(let p of[!1,!0]){
let x=new je;
x.name=`familyshoot-${p?"back":"net"}-${f<0?"left":"right"}`;
let b=document.createElement("a");
b.className="sponsor-board-link",b.href="https://familyshoot.com/",b.target="_blank",b.rel="noopener noreferrer sponsored",b.setAttribute("aria-label",`Visit FamilyShoot (${p?"back":"net"} ${f<0?"left":"right"} board, opens in a new tab)`),b.title="FamilyShoot \xB7 opens in a new tab",b.hidden=!0,document.querySelector(".game-shell").append(b),u.push({
board:x,link:b}
),x.position.set(f*(p?5.2:6.7),0,p?-9.55:.85),x.rotation.y=-f*.16,i.add(x);
for(let g of[!1,!0]){
let h=new je;
h.position.set(0,l/2,g?-c/4:c/4),h.rotation.x=(g?1:-1)*Math.atan(c/(2*l)),x.add(h),Cr(h,[a,l,.055],[0,0,0],s);
let M=qn(new Kt(a-.065,l-.065),n,h,[0,0,g?-.045:.045]);
g&&(M.rotation.y=Math.PI),M.castShadow=!1}
for(let g of[-a*.4,a*.4])Cr(x,[.07,.055,c+.08],[g,.03,0],r)}
let m="";
return{
layout(f,p,x,b,g){
let h=e.domElement.offsetTop,M=[p,x,b,h,g,...f.position.toArray()].join(":");
if(M!==m){
m=M;
for(let{
board:T,link:d}
of u){
let y=[[-a/2,0,c/2],[a/2,0,c/2],[-a/2,l,0],[a/2,l,0]].map(R=>T.localToWorld(Yn(...R)).project(f)),v=(Math.min(...y.map(R=>R.x))+1)*p/2,E=(Math.max(...y.map(R=>R.x))+1)*p/2,_=(1-Math.max(...y.map(R=>R.y)))*(x-b)/2,w=(1-Math.min(...y.map(R=>R.y)))*(x-b)/2;
d.hidden=!g||E<0||v>p||w<0||_>x-b,Object.assign(d.style,{
left:v+"px",top:_+h+"px",width:E-v+"px",height:w-_+"px"}
)}
}
}
}
}
function hy(i){
let e=new sc({
canvas:i,antialias:!0,alpha:!1,powerPreference:"high-performance",preserveDrawingBuffer:!0}
);
e.setPixelRatio(Math.min(window.devicePixelRatio||1,2)),e.shadowMap.enabled=!0,e.shadowMap.type=hl,e.outputColorSpace=Nt,e.toneMapping=Ro,e.toneMappingExposure=.95;
let t=new jr,n=new Cn(15,1,.1,180),s=new So("#e7eff0","#52634b",1.55);
t.add(s);
let r=new To("#fff7e5",2.25);
r.position.set(9,17,-8),r.castShadow=!0,r.shadow.mapSize.set(2048,2048),Object.assign(r.shadow.camera,{
left:-15,right:15,top:17,bottom:-17,near:.5,far:60}
),r.shadow.bias=-15e-5,r.shadow.normalBias=.035,r.shadow.radius=1.6,t.add(r);
let o=Hf(t),a=new je;
t.add(a);
let l=Qf(a),c=ep(t),u=Jo("#f2f0e2"),m=Jo("#163638"),f=new je;
t.add(f);
let p=(C,Q,z,A,S=ni.lineWidth)=>{
let O=Cr(f,[Math.abs(z-C)+S,.016,Math.abs(A-Q)+S],[(C+z)/2,.01,(Q+A)/2],u);
O.castShadow=!1}
,x=ni.singlesX*Lt,b=ni.baselineY*nn,g=ni.serviceY*nn;
p(-Lt,-b,Lt,-b,ni.baselineWidth),p(-Lt,b,Lt,b,ni.baselineWidth),p(-Lt,-b,-Lt,b),p(Lt,-b,Lt,b);
for(let C of[-1,1])p(C*x,-b,C*x,b),p(-x,C*g,x,C*g),p(0,C*b,0,C*(b-.18),.065);
p(0,-g,0,g);
let h=window.TennisPhysics.NET_X*Lt,M=[],T=[],d=[],y=[];
for(let C=0;
C<=48;
C++){
let Q=-h+h*2*C/48,z=window.TennisPhysics.netHeight(Q/Lt)*ui;
if(M.push(Q,.027,0,Q,z,0),T.push(C/48,0,C/48,1),y.push(Yn(Q,z,0)),C<48){
let A=C*2;
d.push(A,A+1,A+2,A+1,A+3,A+2)}
}
let v=new st;
v.setAttribute("position",new De(M,3)),v.setAttribute("uv",new De(T,2)),v.setIndex(d),v.computeVertexNormals();
let E=[];
for(let C=-h;
C<=h+.001;
C+=.05)E.push(C,.027,0,C,window.TennisPhysics.netHeight(C/Lt)*ui,0);
for(let C=1;
C<20;
C++)for(let Q=0;
Q<48;
Q++){
let z=y[Q],A=y[Q+1];
E.push(z.x,z.y*C/20,0,A.x,A.y*C/20,0)}
t.add(new On(new st().setAttribute("position",new De(E,3)),new un({
color:"#142c2b",transparent:!0,opacity:.85}
)));
let _=qn(v,new cn({
color:"#11272a",transparent:!0,opacity:.15,side:Tt,depthWrite:!1}
),t);
_.castShadow=!1,np(t,y,u,.034),np(t,[Yn(-h,.03,0),Yn(h,.03,0)],m,.033),Cr(t,[.047,window.TennisPhysics.NET_HEIGHT*ui,.026],[0,window.TennisPhysics.NET_HEIGHT*ui*.5,.012],u);
for(let C of[-1,1])Cr(t,[.1,1.13,.13],[C*h,.55,0],m),Cr(t,[.17,.055,.2],[C*h,.018,0],m);
let w=tp(t,h,{
enabled:new URLSearchParams(window.location.search).get("netPostLights")!=="off"}
),R=cy(t,e),I=Yh(t,!0),P=Yh(t,!1),N=qn(new En(ni.ballRadius,2),Jo("#e5ef35",{
roughness:1}
),t);
N.castShadow=!1;
let F=new so(new st().setFromPoints(Array.from({
length:64}
,(C,Q)=>{
let z=Q/64*Math.PI*2;
return Yn(Math.cos(z)*.071,Math.sin(z)*.071,Math.sin(z*2)*.027)}
)),new un({
color:"#fffcba"}
));
N.add(F);
let B=qn(new Yi(.095,20),new cn({
color:"#17282a",transparent:!0,opacity:.3,depthWrite:!1}
),t);
B.rotation.x=-Math.PI/2,B.castShadow=!1;
let U=qn(N.geometry,N.material.clone(),t);
U.castShadow=!1,U.material.transparent=!0,U.material.depthWrite=!1;
let D=qn(B.geometry,B.material.clone(),t);
D.rotation.x=-Math.PI/2,D.castShadow=!1;
let G=new st;
G.setAttribute("position",new De(new Float32Array(36),3));
let H=new as(G,new un({
color:"#e6eb8d",transparent:!0,opacity:.38}
));
t.add(H);
let Y=qn(new Li(.14,.158,36),new cn({
color:"#edf1d2",transparent:!0,opacity:.35,side:Tt}
),t);
Y.rotation.x=-Math.PI/2,Y.castShadow=!1;
let q=qn(new Qt(.13,.012,4,32),new cn({
color:"#f7e994"}
),t);
q.castShadow=!1;
let Se=qn(new Li(.19,.235,40),new cn({
color:"#f4f8df",side:Tt,depthWrite:!1}
),t);
Se.rotation.x=-Math.PI/2,Se.castShadow=!1;
let ye=qn(new Li(.09,.14,4),new cn({
color:"#ffd391",side:Tt,depthWrite:!1}
),t);
ye.rotation.x=-Math.PI/2,ye.castShadow=!1;
let Re=qn(new Kt(1,1),new cn({
color:"#d9f28c",transparent:!0,opacity:.1,side:Tt,depthWrite:!1}
),t);
Re.rotation.x=-Math.PI/2,Re.castShadow=!1;
let Ye=new as(new st().setFromPoints([Yn(),Yn()]),new vo({
color:"#ffd391",dashSize:.1,gapSize:.08,depthWrite:!1}
));
t.add(Ye);
let Ne={
}
,ie=Array.from({
length:8}
,()=>{
let C=qn(new Li(.045,.073,16),new cn({
color:"#d6bb95",transparent:!0,opacity:.3,side:Tt,depthWrite:!1}
),t);
return C.rotation.x=-Math.PI/2,C.castShadow=!1,C}
),ce=Yn(),j=Yn();
function de(C,Q,z=0){
return j.set(C*Lt,Math.max(.04,z*ui),Q*nn).project(n),{
x:(j.x+1)*he/2,y:(1-j.y)*(pe-me)/2,visible:j.z>=-1&&j.z<=1&&Math.abs(j.x)<=1&&Math.abs(j.y)<=1}
}
let ge=new ct,Te={
active:!1,physicalHeight:0,displayHeight:0}
,Oe="",le="#718175",he=1280,pe=800,me=0,be={
}
,Ue=null;
function ke(C,Q){
let z=window.matchMedia("(pointer: coarse), (max-width: 760px)").matches;
he=C,pe=Q,me=!z&&Q>C*1.15?Math.min(170,Q*.23):0,e.setSize(C,Q,!1),n.aspect=C/(Q-me);
let A=n.aspect<.8,S=Yn(0,0,A?z&&Q<600?-1:.2:.7),O=Yn(0,A?1.25:.7,1).normalize(),W=[[-5.8,0,9.4],[5.8,0,9.4],[-4.9,1.9,-8.3],[4.9,1.9,-8.3]];
z||W.push([-7.6,1,.85],[7.6,1,.85]);
let X=12,$=130;
for(let oe=0;
oe<24;
oe++){
let K=(X+$)/2;
n.position.copy(S).addScaledVector(O,K),n.lookAt(S),n.updateProjectionMatrix(),n.updateMatrixWorld();
let ee=0;
for(let ue of W){
let Me=Yn(...ue).project(n);
ee=Math.max(ee,Math.abs(Me.x)/.96,Math.abs(Me.y)/.95)}
ee>1?X=K:$=K}
n.position.copy(S).addScaledVector(O,$),n.lookAt(S),n.updateMatrixWorld(),ce.copy(S),o.layout?.({
width:he,height:pe,bottom:me,camera:n}
)}
function te(C,Q=null,z=null){
let A=z?.eventId===C.eventId?z?.tournamentRound:null,S=C.venue+":"+(C.eventId||"")+":"+(A??"");
if(Oe!==S){
Oe=S,o.setVenue(C.venue,C.eventId,A),c.setVenue(C.venue);
let _e=o.getPresentation();
l.setVenue(C.venue,_e.eventId?_e:void 0),s.color.set(_e.hemisphereSky),s.groundColor.set(_e.hemisphereGround),s.intensity=_e.hemisphereIntensity,r.color.set(_e.sun),r.intensity=_e.sunIntensity,e.toneMappingExposure=_e.exposure,le=_e.ground,e.setClearColor(le),a.visible=_e.crowd,I.setOutfit(C.venue==="moon"?"apollo":"tennis"),P.setOutfit(C.venue==="moon"?"apollo":"tennis"),ke(he,pe)}
a.visible&&l.update(C),c.update(C),w.update(C),o.update?.(C);
let O=C.mode==="playing"&&C.phase==="serve"&&!C.ball.active;
O?(Ue===null||C.time<Ue)&&(Ue=C.time):Ue=null;
let W=O?C.time-Ue:null;
be={
player:I.update(C.player,C,W),rival:P.update(C.ai,C)}
;
let X=C.ball;
N.visible=C.mode!=="menu",B.visible=N.visible,N.position.set(X.x*Lt,Math.max(ni.ballRadius,X.z*ui),X.y*nn);
let $=!!X.highDeepLob&&X.active;
if($&&(ge.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),N.position.y=ou(N.position.x,N.position.y,N.position.z,ge.elements,pe-me)),Te={
active:$,physicalHeight:X.z*ui,displayHeight:N.position.y}
,C.phase==="serve"&&!X.active){
let He=(C.server===C.player.side?I:P).heldBallPosition(n);
He&&N.position.copy(He)}
X.dead?X.settling&&N.rotation.set(X.y*nn/ni.ballRadius,0,-X.x*Lt/ni.ballRadius):N.rotation.set(C.time*4,C.time*6,0);
let oe=C.retiringBall;
if(U.visible=D.visible=!!oe&&C.mode!=="menu",oe){
let _e=Math.min(1,oe.fade/.7);
U.position.set(oe.x*Lt,Math.max(ni.ballRadius,oe.z*ui),oe.y*nn),U.material.opacity=_e,D.position.set(oe.x*Lt,.025,oe.y*nn),D.material.opacity=_e*.22}
B.position.set(X.x*Lt,.025,X.y*nn),B.scale.setScalar(1+Math.min(2,X.z)*.2),B.material.opacity=Math.max(.12,.32-X.z*.1);
let K=X.trail.slice(-12);
if(H.visible=(X.active||X.dead)&&K.length>1,K.forEach((_e,He)=>G.attributes.position.setXYZ(He,_e.x*Lt,$?ou(_e.x*Lt,_e.z*ui,_e.y*nn,ge.elements,pe-me):_e.z*ui,_e.y*nn)),G.setDrawRange(0,K.length),G.attributes.position.needsUpdate=!0,H.frustumCulled=!1,Y.visible=C.mode==="playing"&&C.difficulty==="beginner"&&X.active&&X.lastHit==="ai"&&X.bounceCount===0,Y.visible){
let _e=window.TennisPhysics.landing(X);
Y.position.set(_e.x*Lt,.025,_e.y*nn)}
q.visible=C.mode==="playing"&&C.phase==="serveToss"&&C.server==="player"&&(!Q||Q.showPressCue),q.visible&&(q.position.set(X.x*Lt,(Q?.pressZ??.32+2.6**2/(2*window.TennisPhysics.GRAVITY))*ui,X.y*nn),q.quaternion.copy(n.quaternion),q.material.color.set("#f4f8df"));
let ee=C.serveAttempt,ue=!!Q&&C.server==="player"&&["serve","serveToss"].includes(C.phase),Me=ue&&ee?.server==="player"&&C.mode==="playing"&&!Q.swipe;
if(Re.visible=Me,Se.visible=Me,ye.visible=Ye.visible=Me&&!!ee?.power,ue){
let _e=Math.sign(ee.aim.x)||-Math.sign(C.player.x);
Re.position.set(_e*.41*Lt,.023,-.26*nn),Re.scale.set(.82*Lt,.52*nn,1)}
if(Me){
let _e=ee.lockedAim||ee.aim;
if(Se.position.set(_e.x*Lt,.042,_e.y*nn),Se.material.color.set(Q.netRisk?"#ffb995":ee.lockedAim?"#d9f28c":"#f4f8df"),ee.power){
let He=ee.expected;
ye.position.set(He.x*Lt,.045,He.y*nn);
let Ke=Ye.geometry.attributes.position;
Ke.setXYZ(0,_e.x*Lt,.046,_e.y*nn),Ke.setXYZ(1,He.x*Lt,.046,He.y*nn),Ke.needsUpdate=!0,Ye.computeLineDistances()}
}
Ne={
aimVisible:Se.visible,expectedVisible:ye.visible,connectorVisible:Ye.visible,actualVisible:!1,tossVisible:q.visible,tossReady:q.visible&&Q?.swingCue==="ready",tossHeightMetres:q.visible?q.position.y:null,tossColor:q.visible?`#${q.material.color.getHexString()}`:null,leadVisible:!1,overheadCircleCount:Number(q.visible),boxVisible:Re.visible,aim:Me?{
...ee.lockedAim||ee.aim}
:null,actual:null}
;
let Ae=[ee?.actual,C.lastServe?.actual].filter(Boolean),Ee=_e=>_e&&Ae.some(He=>Math.abs(He.x-_e.x)<1e-8&&Math.abs(He.y-_e.y)<1e-8);
ie.forEach((_e,He)=>{
let Ke=C.marks[He];
_e.visible=!!Ke&&C.mode!=="menu"&&!Ee(Ke),Ke&&(_e.position.set(Ke.x*Lt,.021,Ke.y*nn),_e.material.opacity=Math.max(0,Ke.life/4)*.26)}
),Ne.landingMarkVisible=ie.some((_e,He)=>_e.visible&&Ee(C.marks[He])),e.setViewport(0,0,he,pe),e.clear(),e.setViewport(0,me,he,pe-me),e.render(t,n),R.layout(n,he,pe,me,C.mode==="playing"),me&&(e.setScissor(0,0,he,me),e.setScissorTest(!0),e.setClearColor(le),e.clear(),e.setScissorTest(!1))}
let V="3d";
return I.setStyle(V),P.setStyle(V),{
render:te,resize:ke,projectCourt:de,debug:()=>({
type:"webgl-smooth-players",playerStyle:V,serve:Ne,lob:Te,displayBall:N.position.toArray(),sprites:{
player:I.getSpriteDebug(),rival:P.getSpriteDebug()}
,playerAsset:I.root.userData.playerAsset,camera:{
position:n.position.toArray(),target:ce.toArray(),fov:n.fov,zoom:n.zoom,near:n.near,far:n.far,aspect:n.aspect,viewOffset:n.view?{
...n.view}
:null,projectionMatrix:n.projectionMatrix.elements.slice(),viewMatrix:n.matrixWorldInverse.elements.slice(),projectedNet:[-window.TennisPhysics.NET_X,0,window.TennisPhysics.NET_X].map(C=>Yn(C*Lt,window.TennisPhysics.netHeight(C)*ui,0).project(n).toArray()),projectedCourtCorners:[[-Lt,0,-nn],[Lt,0,-nn],[-Lt,0,nn],[Lt,0,nn]].map(C=>Yn(...C).project(n).toArray())}
,viewport:{
width:he,height:pe,bottom:me,pixelRatio:e.getPixelRatio()}
,drawCalls:e.info.render.calls,triangles:e.info.render.triangles,audience:{
...l.debug(),visible:a.visible}
,environment:o.debug(),umpire:c.debug(),netPostLights:w.debug(),outfits:{
player:I.getOutfit(),rival:P.getOutfit()}
,appearance:{
player:I.getAppearance(),rival:P.getAppearance()}
,characters:{
player:I.getCharacter?.()||null,rival:P.getCharacter?.()||null}
,worldPoses:{
player:I.getPoseDebug?.(N.position),rival:P.getPoseDebug?.(N.position)}
,playerPose:be.player?{
mode:be.player.mode,legs:be.player.legs,rightHand:be.player.right,leftHand:be.player.left}
:null}
)}
}
return up(uy);
}
)();

