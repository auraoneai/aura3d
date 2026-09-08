import type { VisualCapture301 } from './muse3jsparity-301-visual-cases';
/** Analytic pinhole projection; no renderer output is used to define expected geometry. */
export function projectVisualPoint(point: readonly number[], eye: readonly number[], target: readonly number[], fov: number, width: number, height: number): [number, number] {
  const sub = (a: readonly number[], b: readonly number[]) => a.map((v, i) => v - b[i]!);
  const unit = (a: readonly number[]) => { const n = Math.hypot(...a); return a.map(v => v / n); };
  const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s,v,i) => s + v * b[i]!,0);
  const cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const forward = unit(sub(target, eye)), right = unit(cross(forward,[0,1,0])), up = cross(right,forward), delta = sub(point,eye);
  const z = dot(delta,forward), tan = Math.tan(fov*Math.PI/360);
  if (!(z > 0)) throw new Error('Expected geometry behind camera');
  return [(dot(delta,right)/(z*tan*width/height)+1)*width/2,(1-dot(delta,up)/(z*tan))*height/2];
}
function within(x: number,y: number,polygon: readonly (readonly number[])[]): boolean {
  let inside = false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[i]!,b=polygon[j]!;
    if((a[1]!>y)!==(b[1]!>y)&&x<(b[0]!-a[0]!)*(y-a[1]!)/(b[1]!-a[1]!)+a[0]!)inside=!inside;
  }
  return inside;
}
/** One minus footprint IoU penalizes both boundary leakage and missing decal pixels. */
export function decalFootprintError(on: VisualCapture301, off: VisualCapture301): number {
  const s=on.settings.camera;
  const polygon=[[-.4,.012,.6],[.4,.012,.6],[.4,.012,1.4],[-.4,.012,1.4]].map(p=>projectVisualPoint(p,s.position,s.target,s.fov,on.width,on.height));
  let intersection=0,union=0;
  for(let y=0;y<on.height;y++)for(let x=0;x<on.width;x++){
    const i=(y*on.width+x)*4;
    const observed=Math.abs(on.pixels[i]!-off.pixels[i]!)+Math.abs(on.pixels[i+1]!-off.pixels[i+1]!)+Math.abs(on.pixels[i+2]!-off.pixels[i+2]!)>18;
    const expected=within(x+.5,y+.5,polygon);
    if(observed&&expected)intersection++; if(observed||expected)union++;
  }
  return union?1-intersection/union:1;
}
/** Symmetric seeded particle grid has a known projected center for every fixed time. */
export function particleTrajectoryProjectionError(capture: VisualCapture301): number {
  let sx=0,sy=0,count=0;
  for(let y=0;y<capture.height;y++)for(let x=0;x<capture.width;x++){
    const i=(y*capture.width+x)*4;
    if(capture.pixels[i]!+capture.pixels[i+1]!+capture.pixels[i+2]!>40){sx+=x+.5;sy+=y+.5;count++;}
  }
  if(!count)return 1;
  const expected=projectVisualPoint([0,0,(capture.frame+1)/60*.001],[0,0,4],[0,0,0],45,capture.width,capture.height);
  return Math.hypot(sx/count-expected[0],sy/count-expected[1])/Math.hypot(capture.width,capture.height);
}
