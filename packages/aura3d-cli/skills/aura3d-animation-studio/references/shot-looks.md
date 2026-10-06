# Episode look continuity

One look across every shot — the episode reads as a single world. Shot
differences come from framing, key placement and palette accents, never from a
different grade.

## Shot look board

| Shot kind | Look stays | What moves | Anchor detail |
| --- | --- | --- | --- |
| establishing | same preset | wide frame, horizon + fog band visible | palette accent introduced |
| dialogue | same preset | `interior-warm`-style pools, catchlights | face lit by key, rim separates hair |
| action | same preset | `chase`/`tracking` framing | motion-blur-free but rim keeps silhouette |
| night / stealth | `night-city` only if scripted as a second look | key drops to practical sources | emissive signs carry the palette |
| climax | same preset | contrast maxes — deepest shadow, hardest key | accent hue saturates |

## Rules that keep continuity

- `looks.preset(<id>)` once, in the shared scene assembly — never per shot
  (`look/multiple-looks`).
- Fog density and grade stay constant; density jumps between cuts read as a
  different world.
- Reuse the key direction across shots; flipping key side mid-dialogue is the
  classic continuity break.
- The grade (`output.preset`) is fixed for the whole episode — a different
  grade is a different timeline, not a different shot.
