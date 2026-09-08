import { WebGPUDevice } from '../../packages/rendering/src/WebGPUDevice';

/** Native float clear -> WGSL bloom -> native float readback -> tone -> native
 * byte readback. Constant radiance makes the expected convolution analytical;
 * no CPU pixel array is uploaded or substituted for shader output. */
export async function runBloomHdr301(){
 const device=await WebGPUDevice.create();
 const source=device.createRenderTarget({width:32,height:32,format:'rgba16f',label:'hdr301-source'});
 const output=device.createRenderTarget({width:32,height:32,format:'rgba8',label:'hdr301-toned'});
 const results=[];
 try{
  device.beginFrame(32,32);device.setRenderTarget(source);device.clear([4,2,.5,1]);device.endFrame();
  device.setRenderTarget(source);const sourcePixels=await device.readFloatPixelsAsync(16,16,1,1);
  for(const quality of ['performance','balanced','cinematic'] as const){
   const bloom=device.executeWebGPUBloom(source,{quality,threshold:.1,knee:.01,strength:.5});
   try{
    device.setRenderTarget(bloom);const hdr=Array.from(await device.readFloatPixelsAsync(16,16,1,1));
    const diagnostics=device.getWebGPUBloomDiagnostics();
    device.presentLdrPostprocess(bloom,{passes:[{name:'tone-mapping',options:{operator:'reinhard',exposure:1,outputColorSpace:'linear'}}],outputTarget:output});
    device.setRenderTarget(output);const toned=Array.from(await device.readPixelsAsync(16,16,1,1));
    results.push({quality,hdr,toned,format:bloom.colorTexture.format,diagnostics});
   }finally{bloom.dispose();}
  }
  return {schema:'muse301-webgpu-bloom-hdr/v1',adapter:device.info.renderer,source:Array.from(sourcePixels),expectedHdr:[6,3,.75],expectedToned:[6/7*255,3/4*255,.75/1.75*255],results,errors:await device.drainWebGPUPostErrors()};
 }finally{output.dispose();source.dispose();device.dispose();}
}
(window as unknown as {runBloomHdr301:typeof runBloomHdr301}).runBloomHdr301=runBloomHdr301;
