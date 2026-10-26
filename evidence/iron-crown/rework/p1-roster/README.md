# Iron Crown roster art pass (2026-10-25)

Boulder Kane, Seraph Lin and Sovereign carried photographic faces baked into their Meshy atlases. `tools/iron-crown-restyle/flatface.mjs` replaced them with flat stylised faces in the same style as Kenji Arashi and Mara Volt: own skin tone, hair colour, brows, eyes, a scar for Boulder, lash lines for Seraph. Seraph's surgical mask and Sovereign's helmet keep their original material. Skeleton, the 10 fight clips and all non-head triangles are unchanged. Jinx Oko keeps his painted mask face (already stylised). Gameplay, hitboxes and replays are untouched.

- `head-before-*.png` / `head-after-*.png`: bind-pose head close-ups (front and three-quarter), before and after.
- `fight-*.jpg`, `attack-*.jpg`: in-bout frames from the remote runner (Versus mode, Crown Arena), software WebGL2, 1280x720 or 1440x900.
- `card-source-boulder-vs-sovereign.jpg`: the frame used for the index card.
- Runs: `p1crown-3` (Seraph, Jinx, Sovereign, Kenji/Mara control), `p1crown-4` (Boulder after the dark-skin tweak, standard set), `p1crown-5` (card pairs). 0 console errors and 0 failed responses on every pair.
- Asset records: `apps/showcase-iron-crown/aura-evidence/restyle/ironcrown{Boulder,Seraph,Sovereign}.flatface.json` (input and output sha256, config).
- Not real-GPU evidence. The Sovereign is a boss and only appears as an opponent (not in the Player 1 grid).
