import { RenderGraph } from '../../RenderGraph';
import { PRODUCTION_PASS_ORDER } from '../passes/FramegraphTopology';
import { assertValidPassContext, type RenderPass, type RenderPassExecutionContext } from './RenderPass';

/** Public compatibility facade. The native RenderGraph owns dependency compilation. */
export class FrameGraph {
  private readonly passes: RenderPass[] = [];

  addPass(pass: RenderPass): this {
    if (this.passes.some((entry) => entry.id === pass.id)) throw new Error(`Duplicate pass: ${pass.id}.`);
    this.passes.push(pass);
    return this;
  }

  getPasses(): readonly RenderPass[] { return [...this.passes]; }

  compile(externalResources: readonly string[] = [
    'scene.geometry', 'scene.casters', 'shadow.maps', 'environment.sky', 'environment.lighting'
  ]): readonly RenderPass[] {
    // Legacy accumulation writes share names. Version them internally, without changing
    // the published handles. Canonical stage order resolves successive HDR writers.
    const order = new Map(PRODUCTION_PASS_ORDER.map((id, index) => [id, index]));
    const active = this.passes.filter((pass) => pass.enabled !== false).sort((a, b) =>
      (order.get(a.id) ?? PRODUCTION_PASS_ORDER.length) - (order.get(b.id) ?? PRODUCTION_PASS_ORDER.length));
    const writers = new Map<string, RenderPass[]>();
    for (const pass of active) for (const name of pass.writes) {
      const list = writers.get(name) ?? []; list.push(pass); writers.set(name, list);
    }
    const graph = new RenderGraph();
    graph.addPass({ name: '$external', reads: [], writes: externalResources.map((name) => `${name}@external`), execute() {} });
    const resourceVersion = (name: string, pass: RenderPass) => `${name}@${pass.id}`;
    for (const pass of active) {
      const reads = pass.reads.map((name) => {
        const producers = writers.get(name) ?? [];
        const selfIndex = producers.indexOf(pass);
        const producer = selfIndex >= 0 ? producers[selfIndex - 1] : producers[producers.length - 1];
        if (producer) return resourceVersion(name, producer);
        if (externalResources.includes(name)) return `${name}@external`;
        throw new Error(`${pass.id} missing producer for ${name}.`);
      });
      graph.addPass({ name: pass.id, reads, writes: pass.writes.map((name) => resourceVersion(name, pass)), execute() {} });
    }
    return graph.compile().filter((pass) => pass.name !== '$external').map((pass) => active.find((entry) => entry.id === pass.name)!);
  }

  execute(context: RenderPassExecutionContext): void {
    assertValidPassContext('FrameGraph', context);
    const written = new Set(this.passes.flatMap((pass) => [...pass.writes]));
    const external = [...(context.resources?.keys() ?? [])].filter((name) => !written.has(name));
    // Invalidate before compiling too: an invalid/disabled producer cannot leave a stale output visible.
    for (const name of written) context.resources?.delete(name);
    const passes = this.compile(external);
    for (const pass of passes) {
      if (!pass.execute) throw new Error(`${pass.id} has no executable pass.`);
    }
    // Never reuse previous-frame outputs when a producer is disabled or fails.
    for (const name of written) context.resources?.delete(name);
    try {
      for (const pass of passes) pass.execute!(context);
    } catch (error) {
      for (const name of written) context.resources?.delete(name);
      throw error;
    }
  }
}
