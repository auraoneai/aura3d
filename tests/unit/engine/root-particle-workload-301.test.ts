import { describe, expect, it, vi } from 'vitest';
import { createRootParticleWorkload } from '../../../packages/engine/src/production-runtime/RootGpuParticleWorkload';
import { applyRootParticleQuality, supportsRootParticleQuality } from '../../../packages/engine/src/agent-api/RootPerformanceQuality';
import type { GPUParticleBackend, GPUParticleUpdateInput } from '@aura3d/rendering';

describe('root particle native workload quality',()=>{
 it('reduces both backend dispatch and draw geometry, restores capacity and unregisters',async()=>{
  const canvas={} as HTMLCanvasElement;
  const update=vi.fn(async(input:GPUParticleUpdateInput)=>({backend:'webgpu' as const,count:input.count,workgroups:Math.ceil(input.count/64),positions:input.positions.slice(0,input.count*4),velocities:input.velocities.slice(0,input.count*4)}));
  const backend:GPUParticleBackend={capabilities:{supported:true,backend:'webgpu'},initialize:vi.fn(async()=>{}),update,dispose:vi.fn()};
  const owner=await createRootParticleWorkload(canvas,{count:10000,backend});
  expect(owner.collectRenderItems()).toEqual([]);
  await owner.update(1/60);expect(update.mock.calls.at(-1)![0].count).toBe(10000);expect(owner.collectRenderItems()[0]!.geometry.vertexBuffer.vertexCount).toBe(60000);
  applyRootParticleQuality(canvas,.4);expect(owner.collectRenderItems()).toEqual([]);
  await owner.update(1/60);expect(update.mock.calls.at(-1)![0].count).toBe(4000);expect(owner.collectRenderItems()[0]!.geometry.vertexBuffer.vertexCount).toBe(24000);
  expect(owner.diagnostics()).toMatchObject({capacity:10000,activeCount:4000,workgroups:63,readbackBytes:128000,particleScale:.4});
  applyRootParticleQuality(canvas,1);await owner.update(1/60);expect(owner.diagnostics().activeCount).toBe(10000);
  owner.dispose();expect(supportsRootParticleQuality(canvas)).toBe(false);expect(backend.dispose).toHaveBeenCalledOnce();expect(()=>owner.collectRenderItems()).toThrow('DISPOSED');
 });
 it('labels CPU integration explicitly while still shrinking the actual root draw resource',async()=>{
  const canvas={} as HTMLCanvasElement;const owner=await createRootParticleWorkload(canvas,{count:100,simulation:'cpu'});
  await owner.update(1/60);expect(owner.diagnostics()).toMatchObject({backend:'cpu',workgroups:0,readbackBytes:0,vertexCount:600});
  applyRootParticleQuality(canvas,.5);await owner.update(1/60);expect(owner.collectRenderItems()[0]!.geometry.vertexBuffer.vertexCount).toBe(300);
  owner.dispose();
 });
 it('rejects adaptation during pending native work and invalidates failed update evidence',async()=>{
  let reject!:(e:Error)=>void;
  const backend:GPUParticleBackend={capabilities:{supported:true,backend:'webgpu'},initialize:async()=>{},update:()=>new Promise((_r,j)=>{reject=j;}),dispose:()=>{}};
  const canvas={} as HTMLCanvasElement,owner=await createRootParticleWorkload(canvas,{count:100,backend});const pending=owner.update(1/60);
  expect(()=>applyRootParticleQuality(canvas,.5)).toThrow('UPDATE_PENDING');expect(owner.collectRenderItems()).toEqual([]);
  reject(new Error('native failed'));await expect(pending).rejects.toThrow('native failed');expect(owner.diagnostics().activeCount).toBe(0);owner.dispose();
 });
});
