// Locale (PRD 04 B10, PRD 03 section 7): keyed scripts and language pack
// selection.
//
// Reusable logic holds no English: every text comes from a locale pack. The
// requested pack is used first (exact tag, then its base language, so
// "en-GB" finds "en"), then the English pack. A key missing from both packs
// returns the caller's fallback for UI strings, or the key itself, so a gap
// is visible in QA instead of being papered over with invented text.

import type { LocalePack } from "../types.js";

/** The baseline pack every other locale falls back to. */
export const FALLBACK_LOCALE = "en";

export interface Locale {
  /** The pack in use (after fallback). */
  readonly locale: string;
  /** Caption text for a spoken line key, e.g. `e17.hook.1`. */
  line(key: string): string;
  /** UI, title, tip, bridge or offline text, e.g. `e17.offline`. */
  str(key: string, fallback?: string): string;
  /** True when the key exists as a line or a string in the pack in use or in English. */
  has(key: string): boolean;
}

type Packs = Readonly<Record<string, LocalePack>>;

function own(record: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function findPack(packs: Packs, tag: string): string | null {
  if (tag.length === 0) return null;
  if (Object.hasOwn(packs, tag)) return tag;
  const lower = tag.toLowerCase();
  for (const key of Object.keys(packs)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

/**
 * The pack key to use for a requested locale: the exact tag, then its base
 * language, then English; null when none of them is present.
 */
export function resolveLocale(packs: Packs, requested: string): string | null {
  const tag = requested.trim().replace(/_/g, "-");
  const base = tag.split("-")[0] ?? "";
  return findPack(packs, tag) ?? findPack(packs, base) ?? findPack(packs, FALLBACK_LOCALE);
}

export function createLocale(packs: Packs, locale: string): Locale {
  const activeKey = resolveLocale(packs, locale);
  const fallbackKey = findPack(packs, FALLBACK_LOCALE);
  const active: LocalePack | undefined = activeKey === null ? undefined : packs[activeKey];
  const english: LocalePack | undefined = fallbackKey === null || fallbackKey === activeKey ? undefined : packs[fallbackKey];

  function lookup(pick: (pack: LocalePack) => Readonly<Record<string, string>>, key: string): string | undefined {
    if (active) {
      const text = own(pick(active), key);
      if (text !== undefined) return text;
    }
    if (english) return own(pick(english), key);
    return undefined;
  }

  return {
    locale: activeKey ?? FALLBACK_LOCALE,
    line(key) {
      return lookup((pack) => pack.lines, key) ?? key;
    },
    str(key, fallback) {
      return lookup((pack) => pack.strings, key) ?? fallback ?? key;
    },
    has(key) {
      return lookup((pack) => pack.lines, key) !== undefined || lookup((pack) => pack.strings, key) !== undefined;
    }
  };
}
