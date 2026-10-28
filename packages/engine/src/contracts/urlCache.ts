// Internal (deliberately not re-exported from contracts/index.ts: it is not public API).

/**
 * `new URL(href)` is re-parsed for every flag and lighting lookup, several times per frame, for an `href` that only changes
 * on navigation. The parsed `URL` is read-only to every caller here, so the last parse is reused while the string is equal.
 */
let lastParsedHref: string | undefined;
let lastParsedUrl: URL | undefined;
export function parseHrefCached(href: string): URL {
  if (lastParsedUrl === undefined || lastParsedHref !== href) {
    lastParsedUrl = new URL(href, "http://localhost/");
    lastParsedHref = href;
  }
  return lastParsedUrl;
}

let lastSearch: string | undefined;
let lastParams: URLSearchParams | undefined;
/** `new URLSearchParams(search)` for per-frame option reads: re-parsed only when the query string changes. Read-only to callers. */
export function cachedSearchParams(search: string): URLSearchParams {
  if (lastParams === undefined || lastSearch !== search) {
    lastParams = new URLSearchParams(search);
    lastSearch = search;
  }
  return lastParams;
}
