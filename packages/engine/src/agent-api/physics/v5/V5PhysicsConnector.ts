import type { PhysicsWorldConstructor } from "../PhysicsWorldAccess.js";
import type { V5PhysicsCore } from "./V5PhysicsCore.js";

/**
 * An opt-in connector imports the entry's v5PhysicsCore and uses its classes.
 * `initialize` must finish backend initialization before returning the world
 * constructor. A connector must not await its own provider's preload: that
 * would wait on the attempt currently initializing it.
 */
export interface V5PhysicsConnector {
  readonly core: V5PhysicsCore;
  initialize(core: V5PhysicsCore): PhysicsWorldConstructor | PromiseLike<PhysicsWorldConstructor>;
}

/** Load a connector only after a consumer has explicitly installed one. */
export type V5PhysicsConnectorLoader = () => V5PhysicsConnector | PromiseLike<V5PhysicsConnector>;

export type V5PhysicsConnectorErrorCode =
  | "CONNECTOR_MISSING"
  | "CONNECTOR_LOCKED"
  | "CONNECTOR_INVALID"
  | "CONNECTOR_CORE_MISMATCH"
  | "CONNECTOR_LOAD_FAILED"
  | "CONNECTOR_INITIALIZATION_FAILED"
  | "PHYSICS_LOADING"
  | "PHYSICS_NOT_READY";

/** A stable diagnostic whose cause retains the original loader or backend failure. */
export class V5PhysicsConnectorError extends Error {
  readonly code: V5PhysicsConnectorErrorCode;

  constructor(code: V5PhysicsConnectorErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "V5PhysicsConnectorError";
    this.code = code;
  }
}
