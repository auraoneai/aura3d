# Chroma Roll: phone start card (last fix)

Problem (final retake): at 390 px wide the start card was wider than the viewport, so its border was clipped on both edges.
Fix: on screens up to 520 px the card is `calc(100vw - 28px)` wide with 16 px side padding, a thinner border and a smaller shadow; the heading is `min(13vw, 64px)` (an `!important` size, because the heading carries an inline size).

- before: `before/title-390.jpg`; after: `after/title-390.jpg` (card and border fully inside the frame).
- Remote run `fixbl-chroma` (software WebGL2, not a GPU), 4 specs passed, frames decoded with `tools/shots/decode-shotsb.mjs`.
