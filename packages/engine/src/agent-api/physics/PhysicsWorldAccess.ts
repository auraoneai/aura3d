import type { PhysicsWorld } from "@aura3d/physics/solverless";

/** The original world constructor and instance identity, without a loader. */
export type PhysicsWorldConstructor = typeof PhysicsWorld;

/** Access to an entry's physics world; the backend is loaded on demand. */
export interface PhysicsWorldAccess {
  /** Load and initialize the optional backend; concurrent callers share an attempt. */
  preload(): Promise<void>;
  /** Return the constructor for this entry's synchronous physics operations. */
  requireReady(): PhysicsWorldConstructor;
  /**
   * How the solver behind this access loads (`eager` when absent). `on-demand` makes `createAuraApp` defer declared
   * bodies and serve `app.physics` through a facade until `preload()` resolves.
   */
  readonly loadMode?: "eager" | "on-demand" | "stripped" | undefined;
}

export interface PhysicsWorldProvider extends PhysicsWorldAccess {
  /** Return the ready constructor, or explain how to preload this isolated provider. */
  requireReady(): PhysicsWorldConstructor;
}

export interface LegacyPhysicsWorldAccess extends PhysicsWorldAccess {
  /**
   * Return the injected constructor immediately. In a no-TLA build its own
   * construction still reports the existing not-ready error until initialized.
   */
  requireReady(): PhysicsWorldConstructor;
}
