import { Geometry, UnlitMaterial, VertexBuffer, VertexFormat, WebGPUParticleBackend, type GPUParticleBackend, type RenderItem } from '@aura3d/rendering';
import { getRootPerformanceQuality, registerRootParticleQualityConsumer } from '../agent-api/RootPerformanceQuality.js';

export interface RootGpuParticleWorkloadOptions {
  readonly count: number;
  /** CPU integration still uses real root-rendered quad resources, never GPU compute claims. */
  readonly simulation?: "webgpu" | "cpu";
  /** Explicit backend injection supports deterministic contract tests; native proof must use WebGPU. */
  readonly backend?: GPUParticleBackend;
}
/** Native compute and exact-sized quad resources submitted by the existing root
 * renderer through RootRenderSourceBridge. This is production-runtime scope,
 * not a claim that compatibility particle descriptors gained native rendering.
 * Lower quality suspends the tail of the pool; restoration retains its state.
 */
export async function createRootGpuParticleWorkload(canvas: HTMLCanvasElement, options: RootGpuParticleWorkloadOptions) {
  if (!Number.isInteger(options.count) || options.count < 1) throw new Error('PARTICLE_WORKLOAD_COUNT_INVALID');
  const capacity=options.count, cpu=options.simulation === "cpu";
  const backend=cpu?null:options.backend ?? new WebGPUParticleBackend();
  if (backend) {
    try { await backend.initialize(); } catch(error) { backend?.dispose(); throw error; }
    if (!backend.capabilities.supported || backend.capabilities.backend !== 'webgpu') {backend?.dispose();throw new Error('PARTICLE_WORKLOAD_NATIVE_WEBGPU_REQUIRED');}
  }
  const positions=new Float32Array(capacity*4),velocities=new Float32Array(capacity*4);
  for(let i=0;i<capacity;i++){positions[i*4]=(i%100-49.5)*.025;positions[i*4+1]=(Math.floor(i/100)-49.5)*.02;velocities[i*4+2]=.001;velocities[i*4+3]=10000;}
  const material=new UnlitMaterial({color:[1,.667,.267,1],renderState:{cullMode:'none'}});
  const corners=[[-.012,-.012],[.012,-.012],[.012,.012],[-.012,-.012],[.012,.012],[-.012,.012]] as const;
  let scale=getRootPerformanceQuality(canvas)?.particleScale ?? 1;
  let activeCount=Math.max(1,Math.floor(capacity*scale)),disposed=false,pending=false;
  let geometry=new Geometry(new VertexBuffer(VertexFormat.P3,activeCount*6),null,'triangles',{min:[-3,-3,-1],max:[3,3,20]});
  let observed={completedUpdates:0,capacity,activeCount:0,drawableParticles:0,dispatchCount:0,workgroups:0,readbackBytes:0,vertexCount:0,particleScale:scale,backend:cpu?'cpu':'webgpu',adapter:cpu?'CPU simulation; root native draw':backend?.capabilities.adapterName ?? 'unavailable'};
  const writeVertices=()=>{let vertex=0;for(let i=0;i<activeCount;i++)for(const corner of corners)geometry.vertexBuffer.setAttribute(vertex++,'position',[positions[i*4]!+corner[0],positions[i*4+1]!+corner[1],positions[i*4+2]!]);};
  const applyScale=(next:number)=>{
    if(disposed)throw new Error('PARTICLE_WORKLOAD_DISPOSED');
    if(pending)throw new Error('PARTICLE_WORKLOAD_UPDATE_PENDING');
    if(!Number.isFinite(next)||next<=0||next>1)throw new Error('PARTICLE_WORKLOAD_SCALE_INVALID');
    const count=Math.max(1,Math.floor(capacity*next));scale=next;
    if(count!==activeCount){const replacement=new Geometry(new VertexBuffer(VertexFormat.P3,count*6),null,'triangles',geometry.bounds);geometry.dispose();geometry=replacement;activeCount=count;}
    writeVertices();
    // Invalidate until the selected workload really completes on the backend.
    observed={...observed,activeCount:0,drawableParticles:0,dispatchCount:0,workgroups:0,readbackBytes:0,vertexCount:0,particleScale:scale};
  };
  let unregister:()=>void;
  try{unregister=registerRootParticleQualityConsumer(canvas,applyScale);}catch(error){geometry.dispose();material.dispose();backend?.dispose();throw error;}
  writeVertices();
  return {
    async update(deltaTime:number){
      if(disposed)throw new Error('PARTICLE_WORKLOAD_DISPOSED');if(pending)throw new Error('PARTICLE_WORKLOAD_UPDATE_PENDING');
      if(!Number.isFinite(deltaTime)||deltaTime<0)throw new Error('PARTICLE_WORKLOAD_DELTA_INVALID');
      pending=true;try{
        const result=cpu?(()=>{
          const p=positions.slice(0,activeCount*4),v=velocities.slice(0,activeCount*4);
          for(let i=0;i<activeCount;i++){for(let axis=0;axis<3;axis++)p[i*4+axis]=p[i*4+axis]!+v[i*4+axis]!*deltaTime;p[i*4+3]=p[i*4+3]!+deltaTime;}
          return {backend:'cpu' as const,count:activeCount,positions:p,velocities:v,workgroups:0};
        })():await backend!.update({positions,velocities,count:activeCount,deltaTime});
        if(result.backend!==(cpu?'cpu':'webgpu')||result.count!==activeCount||result.positions.length!==activeCount*4||result.velocities.length!==activeCount*4)throw new Error('PARTICLE_WORKLOAD_RESULT_MISMATCH');
        positions.set(result.positions);velocities.set(result.velocities);writeVertices();
        observed={...observed,completedUpdates:observed.completedUpdates+1,activeCount,drawableParticles:activeCount,dispatchCount:result.count,workgroups:result.workgroups,readbackBytes:cpu?0:result.positions.byteLength+result.velocities.byteLength,vertexCount:geometry.vertexBuffer.vertexCount,particleScale:scale};
      }catch(error){observed={...observed,drawableParticles:0,activeCount:0};throw error;}finally{pending=false;}
    },
    collectRenderItems():readonly RenderItem[]{if(disposed)throw new Error('PARTICLE_WORKLOAD_DISPOSED');if(pending||observed.activeCount!==activeCount)return [];return [{label:'root-native-particle-quads',geometry,material,castShadow:false}];},
    diagnostics(){return {...observed};},
    dispose(){if(pending)throw new Error('PARTICLE_WORKLOAD_UPDATE_PENDING');if(disposed)return;disposed=true;unregister();geometry.dispose();material.dispose();backend?.dispose();observed={...observed,activeCount:0,drawableParticles:0,vertexCount:0};}
  };
}

/** Explicitly named alias when selecting CPU simulation with native root draws. */
export const createRootParticleWorkload = createRootGpuParticleWorkload;
