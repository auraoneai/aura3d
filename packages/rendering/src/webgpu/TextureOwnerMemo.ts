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
  readonly #missing = new WeakMap<K, number>();

  /**
   * `rememberMissing`: a key no member owns is also remembered until the membership changes. Only for sets whose members
   * never start owning a key while they are members (a caller that adds ownership to a member bumps `set.version`).
   */
  find(set: MembershipVersionedSet<T>, key: K, owns: (candidate: T, key: K) => boolean, rememberMissing = false): T | undefined {
    const memo = this.#owners.get(key);
    if (memo && memo.version === set.version && owns(memo.owner, key)) return memo.owner;
    if (rememberMissing && this.#missing.get(key) === set.version) return undefined;
    for (const candidate of set) {
      if (owns(candidate, key)) {
        this.#owners.set(key, { owner: candidate, version: set.version });
        this.#missing.delete(key);
        return candidate;
      }
    }
    this.#owners.delete(key);
    if (rememberMissing) this.#missing.set(key, set.version);
    else this.#missing.delete(key);
    return undefined;
  }
}
