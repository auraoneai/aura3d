/**
 * Collision pair management and contact manifold tracking.
 */

import { Collider } from './Collider';
import { ContactPoint } from './Collision';

export class CollisionPair {
  colliderA: Collider;
  colliderB: Collider;
  contacts: ContactPoint[];
  friction: number;
  restitution: number;
  private pairId: string;

  constructor(a: Collider, b: Collider) {
    this.colliderA = a;
    this.colliderB = b;
    this.contacts = [];
    this.friction = 0;
    this.restitution = 0;
    this.pairId = this.generatePairId(a, b);
  }

  getId(): string {
    return this.pairId;
  }

  private generatePairId(a: Collider, b: Collider): string {
    const idA = (a as any)._id || 0;
    const idB = (b as any)._id || 0;
    return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  }

  addContact(contact: ContactPoint): void {
    this.contacts.push(contact);
    if (this.contacts.length > 4) this.contacts.shift();
  }

  clearContacts(): void {
    this.contacts = [];
  }

  static generateId(a: Collider, b: Collider): string {
    const idA = (a as any)._id || 0;
    const idB = (b as any)._id || 0;
    return idA < idB ? `${idA}_${idB}` : `${idB}_${idA}`;
  }
}
