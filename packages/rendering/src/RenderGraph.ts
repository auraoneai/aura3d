import { type RenderPass, type RenderPassContext } from "./RenderPass";

export interface RenderGraphResourceLifetime {
  readonly name: string;
  readonly writer: string;
  readonly readers: readonly string[];
  readonly firstPassIndex: number;
  readonly lastPassIndex: number;
}

export interface RenderGraphPlan {
  readonly passes: readonly RenderPass[];
  readonly resources: readonly RenderGraphResourceLifetime[];
}

export class RenderGraph {
  private readonly passes = new Map<string, RenderPass>();

  addPass(pass: RenderPass): void {
    if (this.passes.has(pass.name)) {
      throw new Error(`Render pass already exists: ${pass.name}`);
    }
    this.passes.set(pass.name, pass);
  }

  clear(): void {
    this.passes.clear();
  }

  compile(): readonly RenderPass[] {
    return this.compilePlan().passes;
  }

  compilePlan(): RenderGraphPlan {
    for (const pass of this.passes.values()) {
      validatePassResources(pass);
    }

    const producers = new Map<string, string>();
    for (const pass of this.passes.values()) {
      for (const write of pass.writes) {
        const existing = producers.get(write);
        if (existing) {
          throw new Error(`Frame resource ${write} is written by both ${existing} and ${pass.name}`);
        }
        producers.set(write, pass.name);
      }
    }

    const dependencies = new Map<string, Set<string>>();
    for (const pass of this.passes.values()) {
      const passDependencies = new Set<string>();
      for (const read of pass.reads) {
        const producer = producers.get(read);
        if (!producer) {
          throw new Error(`Render pass ${pass.name} reads ${read}, but no pass writes it`);
        }
        if (producer !== pass.name) {
          passDependencies.add(producer);
        }
      }
      dependencies.set(pass.name, passDependencies);
    }

    const sorted = topologicalSort(this.passes, dependencies);
    return {
      passes: sorted,
      resources: createResourceLifetimes(sorted, producers)
    };
  }

  execute(context: RenderPassContext): void {
    for (const pass of this.compile()) {
      pass.execute(context);
    }
  }

  async executeAsync(context: RenderPassContext): Promise<void> {
    for (const pass of this.compile()) {
      if (pass.executeAsync) {
        await pass.executeAsync(context);
      } else {
        pass.execute(context);
      }
    }
  }
}

function validatePassResources(pass: RenderPass): void {
  const reads = validateResourceList(pass.name, "reads", pass.reads);
  const writes = validateResourceList(pass.name, "writes", pass.writes);
  const allowedInPlace = new Set(pass.allowReadWriteHazards ?? []);
  for (const resource of reads) {
    if (writes.has(resource) && !allowedInPlace.has(resource)) {
      throw new Error(`Render pass ${pass.name} reads and writes ${resource} without declaring an in-place hazard allowance`);
    }
  }
  for (const resource of allowedInPlace) {
    if (!resource.trim()) {
      throw new Error(`Render pass ${pass.name} allows an empty in-place hazard resource`);
    }
  }
}

function validateResourceList(passName: string, kind: "reads" | "writes", resources: readonly string[]): ReadonlySet<string> {
  const seen = new Set<string>();
  for (const resource of resources) {
    if (!resource.trim()) {
      throw new Error(`Render pass ${passName} ${kind} an empty frame resource`);
    }
    if (seen.has(resource)) {
      throw new Error(`Render pass ${passName} declares duplicate ${kind} resource: ${resource}`);
    }
    seen.add(resource);
  }
  return seen;
}

function topologicalSort(
  passes: ReadonlyMap<string, RenderPass>,
  dependencies: ReadonlyMap<string, ReadonlySet<string>>
): readonly RenderPass[] {
  const sorted: RenderPass[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  const visit = (name: string): void => {
    if (permanent.has(name)) {
      return;
    }
    if (temporary.has(name)) {
      throw new Error(`Render graph cycle detected at ${name}`);
    }
    temporary.add(name);
    for (const dependency of dependencies.get(name) ?? []) {
      visit(dependency);
    }
    temporary.delete(name);
    permanent.add(name);
    const pass = passes.get(name);
    if (!pass) {
      throw new Error(`Unknown render graph pass: ${name}`);
    }
    sorted.push(pass);
  };

  for (const name of passes.keys()) {
    visit(name);
  }
  return sorted;
}

function createResourceLifetimes(
  passes: readonly RenderPass[],
  producers: ReadonlyMap<string, string>
): readonly RenderGraphResourceLifetime[] {
  const passIndex = new Map<string, number>();
  for (let index = 0; index < passes.length; index += 1) {
    passIndex.set(passes[index]!.name, index);
  }

  const readersByResource = new Map<string, string[]>();
  for (const pass of passes) {
    for (const read of pass.reads) {
      const readers = readersByResource.get(read) ?? [];
      readers.push(pass.name);
      readersByResource.set(read, readers);
    }
  }

  return [...producers.entries()]
    .map(([resource, writer]) => {
      const readers = readersByResource.get(resource) ?? [];
      const writerIndex = passIndex.get(writer);
      if (writerIndex === undefined) {
        throw new Error(`Frame resource ${resource} is written by unknown pass ${writer}`);
      }
      const readerIndices = readers.map((reader) => {
        const index = passIndex.get(reader);
        if (index === undefined) {
          throw new Error(`Frame resource ${resource} is read by unknown pass ${reader}`);
        }
        return index;
      });
      return {
        name: resource,
        writer,
        readers,
        firstPassIndex: writerIndex,
        lastPassIndex: Math.max(writerIndex, ...readerIndices)
      };
    })
    .sort((a, b) => a.firstPassIndex - b.firstPassIndex || a.name.localeCompare(b.name));
}
