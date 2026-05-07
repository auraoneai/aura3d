import type { Vec3 } from "./Shape.js";

export type Contact = {
  readonly colliderA: number;
  readonly colliderB: number;
  readonly bodyA: number;
  readonly bodyB: number;
  readonly normal: Vec3;
  readonly penetration: number;
  readonly sensor: boolean;
};

export type CollisionEventType = "begin" | "stay" | "end";

export type CollisionEvent = {
  readonly type: CollisionEventType;
  readonly pairKey: string;
  readonly contact: Contact;
};

export function contactPairKey(colliderA: number, colliderB: number): string {
  return colliderA < colliderB ? `${colliderA}:${colliderB}` : `${colliderB}:${colliderA}`;
}

export class CollisionEventQueue {
  private previousContacts = new Map<string, Contact>();
  private events: CollisionEvent[] = [];

  update(currentContacts: readonly Contact[]): readonly CollisionEvent[] {
    const next = new Map<string, Contact>();
    const events: CollisionEvent[] = [];
    for (const contact of currentContacts) {
      const pairKey = contactPairKey(contact.colliderA, contact.colliderB);
      next.set(pairKey, contact);
      events.push({ type: this.previousContacts.has(pairKey) ? "stay" : "begin", pairKey, contact });
    }
    for (const [pairKey, contact] of this.previousContacts) {
      if (!next.has(pairKey)) {
        events.push({ type: "end", pairKey, contact });
      }
    }
    events.sort((a, b) => a.pairKey.localeCompare(b.pairKey) || a.type.localeCompare(b.type));
    this.previousContacts = next;
    this.events = events;
    return this.drain();
  }

  removeCollider(colliderId: number): readonly CollisionEvent[] {
    const removedEvents: CollisionEvent[] = [];
    for (const [pairKey, contact] of this.previousContacts) {
      if (contact.colliderA === colliderId || contact.colliderB === colliderId) {
        const event = { type: "end" as const, pairKey, contact };
        this.events.push(event);
        removedEvents.push(event);
        this.previousContacts.delete(pairKey);
      }
    }
    return removedEvents;
  }

  drain(): readonly CollisionEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  snapshotContacts(): readonly Contact[] {
    return Array.from(this.previousContacts.values());
  }
}
