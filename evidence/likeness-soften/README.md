# Softened trophy cabinet, rooftop face scans, yellow bean (2026-10-24)

Software WebGL2 on the remote runner (`tools/remote-acr/run.sh`, runs `billlik-1`, `billlik-4`), not real-GPU evidence. Spec: `tests/browser/likeness-soften-frames.spec.ts` (staged builds of the apps, assets served from a local static server).

- **Bean Brawl Race (`yellowBean`)**: the new `yellowBean.c594a8de.glb` loads (HTTP 200), 0 console errors. `bean-brawl-race-1.jpg` shows the yellow bean without the red cheeks (the Pikachu-like face is gone; the smile and eyes remain).
- **Bank Shot (`billiardsTrophyCabinetMeshy`)**: the softened `billiardsTrophyCabinetMeshy.f0e4f16a.glb` loads (HTTP 200), 0 console errors. The 3D canvas is **black in this staged capture, and it is equally black for a control build of the same app from unchanged `main` with the original cabinet** (`bank-shot-ctl`: mean luma 2.5 and non-dark fraction 0.088 for both). So the blackness comes from this capture method (staged assets), not from the cabinet change, and **the cabinet itself was not seen rendering**. Bank Shot's own `bank-shot-shot-visual.spec.ts` could not be used remotely: its dev-server page returned "Not found" in the runner.
- **Rooftop athletes**: served from `/aura-assets/` but used by no app; checked by unit test only (`tests/unit/likeness-audit/photo-textures.test.ts`).
- Texture-level proof: `tests/unit/likeness-audit/soft-cabinet.test.ts`, `photo-textures.test.ts` and `yellow-bean.test.ts` (content bound, manifest hashes, removed originals).
