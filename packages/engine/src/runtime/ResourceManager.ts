export type AuraResourceKind = "gltf" | "glb" | "texture" | "audio" | "json" | "binary" | "other";

export type AuraResourceStatus = "idle" | "loading" | "ready" | "error" | "disposed";

export interface AuraResourceDescriptor<TResource = unknown> {
  readonly id: string;
  readonly url?: string;
  readonly kind: AuraResourceKind;
  readonly metadata?: Readonly<Record<string, unknown>>;
  load?(descriptor: AuraResourceDescriptor<TResource>, signal: AbortSignal): Promise<TResource> | TResource;
  dispose?(resource: TResource, descriptor: AuraResourceDescriptor<TResource>): void | Promise<void>;
}

export interface AuraResourceRecord<TResource = unknown> {
  readonly id: string;
  readonly kind: AuraResourceKind;
  readonly url?: string;
  readonly status: AuraResourceStatus;
  readonly refCount: number;
  readonly loadCount: number;
  readonly cacheHits: number;
  readonly byteSize?: number;
  readonly loadedAt?: number;
  readonly disposedAt?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly resource?: TResource;
  readonly error?: string;
}

export interface AuraResourceManagerEvidence {
  readonly kind: "aura-resource-manager-evidence";
  readonly total: number;
  readonly ready: number;
  readonly loading: number;
  readonly errors: number;
  readonly disposed: number;
  readonly cacheHits: number;
  readonly records: readonly AuraResourceRecord[];
}

interface MutableResourceRecord<TResource = unknown> {
  descriptor: AuraResourceDescriptor<TResource>;
  status: AuraResourceStatus;
  refCount: number;
  loadCount: number;
  cacheHits: number;
  byteSize?: number;
  loadedAt?: number;
  disposedAt?: number;
  resource?: TResource;
  error?: string;
  pending?: Promise<TResource>;
  abortController?: AbortController;
}

export interface AuraResourceManager {
  readonly evidence: AuraResourceManagerEvidence;
  preload<TResource>(descriptor: AuraResourceDescriptor<TResource>): Promise<TResource>;
  acquire<TResource>(descriptor: AuraResourceDescriptor<TResource>): Promise<TResource>;
  release(id: string): Promise<AuraResourceRecord | undefined>;
  get<TResource = unknown>(id: string): TResource | undefined;
  record(id: string): AuraResourceRecord | undefined;
  records(): readonly AuraResourceRecord[];
  dispose(id: string): Promise<AuraResourceRecord | undefined>;
  disposeAll(): Promise<AuraResourceManagerEvidence>;
}

export function createResourceManager(): AuraResourceManager {
  const records = new Map<string, MutableResourceRecord>();

  const publicRecord = (record: MutableResourceRecord): AuraResourceRecord => ({
    id: record.descriptor.id,
    kind: record.descriptor.kind,
    ...(record.descriptor.url ? { url: record.descriptor.url } : {}),
    status: record.status,
    refCount: record.refCount,
    loadCount: record.loadCount,
    cacheHits: record.cacheHits,
    ...(record.byteSize !== undefined ? { byteSize: record.byteSize } : {}),
    ...(record.loadedAt !== undefined ? { loadedAt: record.loadedAt } : {}),
    ...(record.disposedAt !== undefined ? { disposedAt: record.disposedAt } : {}),
    ...(record.descriptor.metadata ? { metadata: record.descriptor.metadata } : {}),
    ...(record.resource !== undefined ? { resource: record.resource } : {}),
    ...(record.error ? { error: record.error } : {})
  });

  const evidence = (): AuraResourceManagerEvidence => {
    const publicRecords = [...records.values()].map(publicRecord);
    return {
      kind: "aura-resource-manager-evidence",
      total: publicRecords.length,
      ready: publicRecords.filter((record) => record.status === "ready").length,
      loading: publicRecords.filter((record) => record.status === "loading").length,
      errors: publicRecords.filter((record) => record.status === "error").length,
      disposed: publicRecords.filter((record) => record.status === "disposed").length,
      cacheHits: publicRecords.reduce((sum, record) => sum + record.cacheHits, 0),
      records: publicRecords
    };
  };

  const loadDefault = async <TResource>(descriptor: AuraResourceDescriptor<TResource>, signal: AbortSignal): Promise<TResource> => {
    if (!descriptor.url) throw new Error(`Resource "${descriptor.id}" requires either a url or custom load() function.`);
    if (typeof fetch !== "function") throw new Error(`Resource "${descriptor.id}" cannot load because fetch is unavailable.`);
    const response = await fetch(descriptor.url, { signal });
    if (!response.ok) throw new Error(`Resource "${descriptor.id}" failed to load ${descriptor.url}: HTTP ${response.status}.`);
    if (descriptor.kind === "json") return await response.json() as TResource;
    return await response.arrayBuffer() as TResource;
  };

  const ensureRecord = <TResource>(descriptor: AuraResourceDescriptor<TResource>): MutableResourceRecord<TResource> => {
    const existing = records.get(descriptor.id) as MutableResourceRecord<TResource> | undefined;
    if (existing && existing.status !== "disposed") return existing;
    const next: MutableResourceRecord<TResource> = {
      descriptor,
      status: "idle",
      refCount: 0,
      loadCount: 0,
      cacheHits: 0
    };
    records.set(descriptor.id, next as MutableResourceRecord);
    return next;
  };

  const disposeRecord = async (record: MutableResourceRecord): Promise<AuraResourceRecord> => {
    if (record.status === "disposed") return publicRecord(record);
    record.abortController?.abort();
    if (record.resource !== undefined && record.descriptor.dispose) {
      await record.descriptor.dispose(record.resource, record.descriptor);
    }
    record.pending = undefined;
    record.resource = undefined;
    record.error = undefined;
    record.refCount = 0;
    record.status = "disposed";
    record.disposedAt = Date.now();
    return publicRecord(record);
  };

  const manager: AuraResourceManager = {
    get evidence() {
      return evidence();
    },
    async preload<TResource>(descriptor: AuraResourceDescriptor<TResource>): Promise<TResource> {
      const record = ensureRecord(descriptor);
      if (record.status === "ready" && record.resource !== undefined) {
        record.cacheHits += 1;
        return record.resource;
      }
      if (record.pending) {
        record.cacheHits += 1;
        return await record.pending;
      }
      record.abortController = new AbortController();
      record.status = "loading";
      record.error = undefined;
      record.loadCount += 1;
      record.pending = Promise.resolve()
        .then(() => descriptor.load ? descriptor.load(descriptor, record.abortController!.signal) : loadDefault(descriptor, record.abortController!.signal))
        .then((resource) => {
          record.resource = resource;
          record.byteSize = inferByteSize(resource);
          record.loadedAt = Date.now();
          record.status = "ready";
          record.pending = undefined;
          return resource;
        })
        .catch((error: unknown) => {
          record.status = "error";
          record.error = error instanceof Error ? error.message : String(error);
          record.pending = undefined;
          throw error;
        });
      return await record.pending;
    },
    async acquire<TResource>(descriptor: AuraResourceDescriptor<TResource>): Promise<TResource> {
      const resource = await manager.preload(descriptor);
      const record = ensureRecord(descriptor);
      record.refCount += 1;
      return resource;
    },
    async release(id: string): Promise<AuraResourceRecord | undefined> {
      const record = records.get(id);
      if (!record) return undefined;
      record.refCount = Math.max(0, record.refCount - 1);
      if (record.refCount === 0 && record.status === "ready") return await disposeRecord(record);
      return publicRecord(record);
    },
    get<TResource = unknown>(id: string): TResource | undefined {
      return records.get(id)?.resource as TResource | undefined;
    },
    record(id: string): AuraResourceRecord | undefined {
      const record = records.get(id);
      return record ? publicRecord(record) : undefined;
    },
    records(): readonly AuraResourceRecord[] {
      return [...records.values()].map(publicRecord);
    },
    async dispose(id: string): Promise<AuraResourceRecord | undefined> {
      const record = records.get(id);
      return record ? await disposeRecord(record) : undefined;
    },
    async disposeAll(): Promise<AuraResourceManagerEvidence> {
      for (const record of records.values()) await disposeRecord(record);
      return evidence();
    }
  };

  return manager;
}

function inferByteSize(resource: unknown): number | undefined {
  if (resource instanceof ArrayBuffer) return resource.byteLength;
  if (ArrayBuffer.isView(resource)) return resource.byteLength;
  if (typeof Blob !== "undefined" && resource instanceof Blob) return resource.size;
  if (typeof resource === "string") return new TextEncoder().encode(resource).byteLength;
  return undefined;
}
