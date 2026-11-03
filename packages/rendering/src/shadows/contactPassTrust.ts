import type { RenderPass } from "../RenderPass";

interface ContactPassProof {
  readonly prototype: object;
  readonly execute: RenderPass["execute"];
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  readonly hazards: readonly string[];
}

const proofs = new WeakMap<object, ContactPassProof>();

/** Internal registration by the contact contributor, never by graph phases. */
export function registerContactShadowShadingPass(pass: RenderPass, prototype: object, execute: RenderPass["execute"]): void {
  proofs.set(pass, { prototype, execute, reads: pass.reads, writes: pass.writes, hazards: pass.allowReadWriteHazards ?? [] });
}

/** A foreign pass or Proxy is rejected before reading any of its properties. */
export function isContactShadowShadingPass(pass: RenderPass): boolean {
  const proof = proofs.get(pass);
  if (!proof || Object.getPrototypeOf(pass) !== proof.prototype || Object.getOwnPropertyDescriptor(pass, "execute") !== undefined ||
      Object.getOwnPropertyDescriptor(proof.prototype, "execute")?.value !== proof.execute) return false;
  const ownValue = (name: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(pass, name);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  };
  return ownValue("name") === "prd02.contactShadows" && ownValue("reads") === proof.reads && ownValue("writes") === proof.writes &&
    ownValue("allowReadWriteHazards") === proof.hazards && proof.reads.length === 0 && proof.hazards.length === 0 &&
    proof.writes.length === 1 && proof.writes[0] === "prd02.contactShadowMask";
}
