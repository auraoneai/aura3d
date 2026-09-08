import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { VISUAL_SETTINGS_301, type VisualCapture301 } from '../../browser/muse3jsparity-301-visual-cases';
import { projectVisualPoint, particleTrajectoryProjectionError } from '../../browser/muse3jsparity-301-visual-geometry-quality';
import { createGlyphReference301, measureGlyphEdgeQuality301 } from '../../browser/muse3jsparity-301-glyph-quality';
import { calculateWaterReflectionProjectionError301 } from '../../browser/muse3jsparity-301-water-quality';
function capture(family: VisualCapture301['family'], enabled=true, width=600,height=380):VisualCapture301 {
 return {family,engine:'aura',enabled,frame:0,width,height,pixels:new Array(width*height*4).fill(0),dataUrl:'',passes:[],errors:[],settings:VISUAL_SETTINGS_301,claimSurface:'test fixture'};
}
function paint(c:VisualCapture301,cx:number,cy:number,color:readonly number[],radius=3){
 for(let y=Math.floor(cy)-radius;y<=Math.floor(cy)+radius;y++)for(let x=Math.floor(cx)-radius;x<=Math.floor(cx)+radius;x++){
  if(x<0||y<0||x>=c.width||y>=c.height)continue;const i=(y*c.width+x)*4;for(let j=0;j<3;j++)c.pixels[i+j]=color[j]!;c.pixels[i+3]=255;
 }
}
describe('V01 independent pixel quality oracles',()=>{
 it('analytic projection matches independent Three perspective camera at noncentral points',()=>{
  const s=VISUAL_SETTINGS_301.camera,c=new PerspectiveCamera(s.fov,600/380,s.near,s.far);c.position.set(...s.position as [number,number,number]);c.lookAt(...s.target as [number,number,number]);c.updateMatrixWorld();
  for(const p of [[-.65,-.75,0],[.65,-.75,-.5],[1,1,2]]){
   const actual=projectVisualPoint(p,s.position,s.target,s.fov,600,380),v=new Vector3(...p as [number,number,number]).project(c);
   expect(actual[0]).toBeCloseTo((v.x+1)*300,8);expect(actual[1]).toBeCloseTo((1-v.y)*190,8);
  }
 });
 it('missing particles cannot receive zero trajectory error and a displaced grid is rejected',()=>{
  const empty=capture('particles',true,640,360);expect(particleTrajectoryProjectionError(empty)).toBe(1);
  const centered=capture('particles',true,640,360);paint(centered,319.5,179.5,[255,180,80],20);expect(particleTrajectoryProjectionError(centered)).toBeLessThan(.002);
  const shifted=capture('particles',true,640,360);paint(shifted,410,180,[255,180,80],20);expect(particleTrajectoryProjectionError(shifted)).toBeGreaterThan(.1);
 });
 it('reflected sources at independently projected positions beat missing or displaced reflection',()=>{
  const on=capture('water-reflections'),off=capture('water-reflections',false),bad=capture('water-reflections');
  const s=VISUAL_SETTINGS_301.camera,c=new PerspectiveCamera(s.fov,600/380,s.near,s.far);c.position.set(...s.position as [number,number,number]);c.lookAt(...s.target as [number,number,number]);c.updateMatrixWorld();
  [[-.65,-.75,0],[.65,-.75,-.5]].forEach((p,i)=>{const v=new Vector3(...p as [number,number,number]).project(c),color=i?[0,60,255]:[255,0,0];paint(on,(v.x+1)*300,(1-v.y)*190,color);paint(bad,(v.x+1)*300+60,(1-v.y)*190,color);});
  expect(calculateWaterReflectionProjectionError301(on,off)).toBeLessThan(.002);expect(calculateWaterReflectionProjectionError301(bad,off)).toBeGreaterThan(.06);expect(calculateWaterReflectionProjectionError301(capture('water-reflections'),off)).toBe(1);
 });
 it('glyph oracle rejects absent and horizontally shifted glyph pixels',()=>{
  const reference=createGlyphReference301(),off=capture('sdf-text',false),ideal=capture('sdf-text'),shifted=capture('sdf-text');
  for(let y=0;y<380;y++)for(let x=0;x<600;x++){const alpha=reference.coverage[y*600+x]!;if(alpha<.2)continue;for(let k=0;k<3;k++){ideal.pixels[(y*600+x)*4+k]=255;if(x+16<600)shifted.pixels[(y*600+x+16)*4+k]=255;}}
  expect(measureGlyphEdgeQuality301(ideal.pixels,off.pixels,reference).glyphEdgeError).toBe(0);
  expect(measureGlyphEdgeQuality301(off.pixels,off.pixels,reference).glyphEdgeError).toBe(1);
  expect(measureGlyphEdgeQuality301(shifted.pixels,off.pixels,reference).glyphEdgeError).toBeGreaterThan(.18);
  const noisy=capture('sdf-text');
  for(let y=reference.region[1];y<=reference.region[3];y++)for(let x=reference.region[0];x<=reference.region[2];x++){
   const i=(y*600+x)*4;if(reference.coverage[y*600+x]!>=.2)continue;
   noisy.pixels[i]=80;noisy.pixels[i+1]=45;noisy.pixels[i+2]=20;
  }
  for(let y=0;y<380;y++)for(let x=0;x<600;x++){if(reference.coverage[y*600+x]!<.2)continue;for(let k=0;k<3;k++)noisy.pixels[(y*600+x)*4+k]=255;}
  expect(measureGlyphEdgeQuality301(noisy.pixels,off.pixels,reference).glyphEdgeError).toBe(0);
 });
});
