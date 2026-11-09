/** A set that counts its membership changes (adds of new members, deletes, clears), for lookups memoized against it. */
export class MembershipVersionedSet<T> extends Set<T> {
  version = 0;

  override add(value: T): this {
    if (!this.has(value)) this.version += 1;
    return super.add(value);
  }

  override delete(value: T): boolean {
    const removed = super.delete(value);
    if (removed) this.version += 1;
    return removed;
  }

  override clear(): void {
    if (this.size > 0) this.version += 1;
    super.clear();
  }
}

/**
 * The first member of a `MembershipVersionedSet` (in set order) that owns a key, as a full scan finds it. A found owner
 * is remembered until the set's membership changes and is rechecked with `owns` on every lookup (a remembered owner
 * that no longer owns the key is scanned past); a key without an owner is never remembered, so it is scanned for again.
 */
export class TextureOwnerMemo<K extends object, T> {
  readonly #owners = new WeakMap<K, { readonly owner: T; readonly version: number }>();

  find(set: MembershipVersionedSet<T>, key: K, owns: (candidate: T) => boolean): T | undefined {
    const memo = this.#owners.get(key);
    if (memo && memo.version === set.version && owns(memo.owner)) return memo.owner;
    for (const candidate of set) {
      if (owns(candidate)) {
        this.#owners.set(key, { owner: candidate, version: set.version });
        return candidate;
      }
    }
    this.#owners.delete(key);
    return undefined;
  }
}
