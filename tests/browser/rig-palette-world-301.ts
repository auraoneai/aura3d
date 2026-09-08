import type { RootSkinPaletteDraw301 } from './root-skin-palette-witness-301';
export type Point301=readonly[number,number,number];
export interface SkinBinding301 {jointNames:readonly string[];bindMatrices:readonly (readonly number[])[];hierarchyEdges:readonly {parent:string;child:string;bindLength:number}[]}
export function multiplyMatrix301(a:readonly number[],b:readonly number[]):number[]{if(a.length!==16||b.length!==16)throw new Error('Expected two matrices');const out=Array<number>(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]!+=a[k*4+r]!*b[c*4+k]!;return out;}
/** Recover actual root joint world transforms from the draw-bound GPU palette:
 * model * (inverse(mesh) * jointWorld * inverseBind) * bind. */
export function paletteJointPositions301(draw:Pick<RootSkinPaletteDraw301,'jointMatrices'|'modelMatrix'|'jointCount'>,binding:SkinBinding301):Record<string,Point301>{
 if(!draw.modelMatrix||draw.jointCount!==binding.jointNames.length||binding.bindMatrices.length!==draw.jointCount)throw new Error('GPU palette and measured skin binding differ');
 const positions:Record<string,Point301>={};for(let i=0;i<draw.jointCount;i++){const world=multiplyMatrix301(multiplyMatrix301(draw.modelMatrix,draw.jointMatrices.slice(i*16,i*16+16)),binding.bindMatrices[i]!);positions[binding.jointNames[i]!]=[world[12]!,world[13]!,world[14]!];}return positions;
}
export function measureRenderedSegments301(bindings:Record<string,SkinBinding301>,bind:Record<string,Point301>,posed:Record<string,Point301>,mappedJoints?:ReadonlySet<string>){
 const edges=new Map<string,{parent:string;child:string}>();
 for(const binding of Object.values(bindings))for(const edge of binding.hierarchyEdges)if(!mappedJoints||(mappedJoints.has(edge.parent)&&mappedJoints.has(edge.child)))edges.set(`${edge.parent}->${edge.child}`,edge);
 const segments:{from:string;to:string;bindLength:number;posedLength:number;relativeLengthChange:number}[]=[];
 const missing:string[]=[],degenerate:string[]=[];
 const dist=(p:Point301,q:Point301)=>Math.hypot(...p.map((v,j)=>v-q[j]!));
 const observedScale=Math.max(1e-8,...Object.values(bind).flatMap((point,index,all)=>all.slice(index+1).map(other=>dist(point,other))));
 // Exporters often append helper joints at effectively the same transform (10^-8
 // world units apart). Relative error on those zero-length helpers is numerical
 // noise, not deformation. Keep the cutoff proportional to the measured rig.
 const degenerateLength=observedScale*1e-6;
 for(const edge of edges.values()){
  const bindA=bind[edge.parent],bindB=bind[edge.child],a=posed[edge.parent],b=posed[edge.child];
  if(!bindA||!bindB||!a||!b){missing.push(`${edge.parent}->${edge.child}`);continue;}
  // Renderer normalization is part of the submitted model matrix. Comparing a
  // GPU-world posed length to an authored asset-space length reports uniform
  // normalization as skeletal stretch. Derive both lengths from the same
  // draw-bound palette/model frame instead.
  const bindLength=dist(bindA,bindB);
  if(!Number.isFinite(bindLength)||bindLength<=degenerateLength){degenerate.push(`${edge.parent}->${edge.child}`);continue;}
  const posedLength=dist(a,b);segments.push({from:edge.parent,to:edge.child,bindLength,posedLength,relativeLengthChange:Math.abs(posedLength-bindLength)/bindLength});
 }
 return {positions:posed,segments,missing,degenerate,maxRelativeSegmentLengthChange:segments.length&&missing.length===0?Math.max(...segments.map(s=>s.relativeLengthChange)):null};
}
