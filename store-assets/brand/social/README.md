# Aura3D social artwork

The square profiles use the same folded A as the site favicon. The wide covers use the horizontal Aura3D logo with light lettering on an ink background. Both layouts keep the brand centered for social platforms that crop avatars to circles or display covers at different aspect ratios.

Run `node store-assets/brand/social/generate.mjs` from the repository root to render the 400 px and 800 px profile images, the 1500 × 500 X banner, and the 2560 × 1440 cover. The generator reads the canonical favicon and wordmark from `marketing/public/`.

Website Open Graph and X link previews have a separate generator at `marketing/scripts/generate-og.mjs`.
