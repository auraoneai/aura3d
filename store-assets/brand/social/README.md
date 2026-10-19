# Aura3D brand/social renders — store-assets/brand/social/

Dated: **2026-10-18** (brand-asset portfolio pass). Everything in this folder was
produced by the committed generator `generate.mjs` from already-committed repo
identity only. Nothing was invented, deployed, or fetched from outside the repo.

## Master source (canonical, all elements pre-existing)

| Element | Value | Provenance (committed file) |
| --- | --- | --- |
| Wordmark text | `Aura3D` | nav brand `<span>` + `og:site_name` in `index.html` / `marketing/index.html` |
| Tagline text | `AI-Native TypeScript 3D SDK for Browser 3D Apps` | frozen `<title>`/`og:title` copy, `index.html` line 6 |
| Mark geometry + colors | orbit/atom mark, `#38bdf8` body + `#34d399` tilted ellipse (light-background variant) | inline nav `brand-mark` SVG, `index.html` — reproduced verbatim in `generate.mjs` |
| Background | `#fbfbf8` | `--bg`, `marketing/src/styles.css`; also `theme-color` in every page head |
| Wordmark color | `#1a1e26` | `--ink`, `marketing/src/styles.css` |
| Tagline color | `#565d69` | `--ink-2`, `marketing/src/styles.css` |
| Typography | Graphik Web (licensed, paid library) — Semibold wordmark, Regular tagline | repo-committed `public/fonts/graphik/Graphik-Semibold-Web.woff2`, `Graphik-Regular-Web.woff2` (the site's own display weight; per `fonts/README.md` weight discipline a wordmark may take Semibold/Bold — Semibold keeps continuity with the shipped site face set) |

No new claims, no new copy: the only strings rendered are the wordmark and the
frozen tagline above.

## Files (latest run, 2026-10-18)

| File | Pixels | Bytes | sha256 (first 16) |
| --- | --- | --- | --- |
| `profile-400.png` | 400x400 | 13,866 | `8c71c0267c64bce5` |
| `profile-800.png` | 800x800 | 30,938 | `0302fb662834deb8` |
| `og-1200x630.png` | 1200x630 | 28,438 | `33fb9051be9cb417` |
| `twitter-1200x600.png` | 1200x600 | 24,756 | `4c43da2e790d1cb6` |
| `banner-x-1500x500.png` | 1500x500 | 22,281 | `adf0bcc536748c99` |
| `banner-cover-2560x1440.png` | 2560x1440 | 50,602 | `d52707967bade861` |

Safe zones (measured from rendered pixels, not assumed):

- Profiles: full lockup inside the central circle (content circumradius 142px of
  200px radius at 400; 285px of 400px at 800) — survives circular crops.
- `banner-x-1500x500.png`: content bbox 590x117 centered inside the conservative
  ~1260x300 center band — safe across X/Twitter device crops.
- `banner-cover-2560x1440.png`: content bbox 1084x216 centered inside the
  ~1400x460 center band shared by YouTube/LinkedIn/Facebook cover crops.
- All canvases: background verified as exactly `#fbfbf8` corner-to-corner; mark
  blue/green pixels and Graphik ink confirmed present on every render.

## Re-run

```bash
node store-assets/brand/social/generate.mjs
```

Renderer: the repo's own Playwright devDependency. Launch fallback chain:
pinned Chromium build → installed Google Chrome (`channel: 'chrome'`) → newest
cached `ms-playwright/chromium-*` build. Fonts are inlined as base64 data URIs
from `public/fonts/graphik/` (page `setContent` blocks `file://` fetches), and
the script **aborts** if `document.fonts.check()` fails for either Graphik
weight, so a system-fallback face can never be rasterized silently.

## Favicon verdict (not regenerated — not stale)

A full favicon set exists and is current:

- `favicon.svg` (root, `public/`, `marketing/` — byte-identical atom mark on dark
  tile): committed in `9a8a0aaaa` 2026-06-02 (v1.0.0 release), unchanged since;
  still the live mark geometry used in every page nav.
- `marketing/favicon.ico` + `marketing/public/favicon.ico` (16x16): added in
  `ad16ee46e` 2026-08-15 to fix a production `/favicon.ico` 404.
- `public/apple-touch-icon.png` + `marketing/public/apple-touch-icon.png`
  (180x180): regenerated `2026-10-18` in the UI/SEO pass `7a556f61a`.

Newest piece was refreshed yesterday; nothing is stale, so per the pass rules
the set was verified and left untouched.

## Wiring (before → after)

Scope: pages that carry `og:`/`twitter:` image metadata in `marketing/` and the
root `index.html` (18 files). Before, every one of them pointed social scrapers
at the **Aura Clash game poster** (`previews/aura-clash-poster.png|.svg`); 15 of
18 had no `twitter:image` at all.

| File | og:image before → after | twitter:image before → after |
| --- | --- | --- |
| `index.html` | `.../previews/aura-clash-poster.png` → `.../store-assets/brand/social/og-1200x630.png` | (absent) → `.../store-assets/brand/social/twitter-1200x600.png` |
| `marketing/index.html` | same → same | (absent) → added |
| `marketing/docs/index.html`, `api.html`, `claims.html`, `evidence.html`, `assets.html`, `templates.html`, `deployment.html`, `agent-quickstart.html`, `agent-rules.html`, `prompt-recipes.html`, `claude.html`, `cursor.html` | poster `.png` → brand og | (absent) → added |
| `marketing/docs/aura-clash.html`, `marketing/docs/aura-clash-showcase.html` | poster `.svg` → brand og; poster alt → `Aura3D wordmark and tagline on the brand light background` | poster `.svg` → brand twitter; alt swapped likewise |
| `marketing/docs/aura3d-vs-threejs.html` | (no image tags) → og:image + alt added alongside existing og block | (absent) → twitter:card + twitter:image added |

Intentionally left alone:

- JSON-LD `"image"` in `marketing/docs/aura-clash-showcase.html` — structured
  data describing that game page's own content, not site branding.
- Build outputs (`marketing/dist/`, `.vercel/output/`, root `dist/`) — they
  regenerate on the next build; nothing was deployed.
- Game/app pages under `apps/` and `public/toptennis*/` — outside this pass's
  marketing scope.

### Placeholder base + swap note

The wired URLs use `https://aura3d.auraone.ai/store-assets/brand/social/...`.
**Nothing is deployed** — that path is not served yet, so the base is a
placeholder until the store-assets folder is published. A swap-note comment sits
directly above `og:image` in `index.html` and `marketing/index.html`:

> swap the base to the CDN origin at deploy time.

## Verification performed

1. `file` on all six PNGs: exact dimensions, 8-bit RGB.
2. Pixel audit (sharp): background `#fbfbf8` at every corner; content bbox
   centered (within 1-2px horizontal); safe-zone checks above all pass.
3. Font gate: `document.fonts.check('600 …')` and `('400 …')` asserted true
   in-run for every canvas (licensed Graphik, not a fallback).
4. Vision review of `og-1200x630.png`: background, mark colors `#38bdf8`/`#34d399`,
   both text lines exact, crisp, centered, no clipping — matches spec.
