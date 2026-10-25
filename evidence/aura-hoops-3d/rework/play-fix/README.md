# Hoops, Diamond, Links, Red Zone athletes: clean hems and flat faces (2026-10-25)

`tools/hoops-athlete-retexture/retexture-face.mjs` repaints any of the 15-joint athletes: all primitives merged, every vertex classified by body region from its own skin weights, region-straddling edges split (1.5 cm, 6 mm on the head) so hems and sleeves are clean cuts, and a second palette row holds face ink for flat eyes and a mouth. Output is one primitive with a tiny NEAREST palette texture (FC keeps named flat materials so its team tint works). Clips (23, FC 26) are unchanged. Sizes 1.2 to 1.8 MB each.

**Verified by model render (CPU rasteriser, not in-game frames):** `athletes-after.png` (Hoops big man and guard) and `hoops-diamond-redzone-faces.png` (Hoops x2, Diamond, Red Zone quarterback). Hems are clean cuts, no ragged shards. Faces are two ink bars and a mouth.

**Verified by unit test:** `tests/unit/likeness-audit` (palette strip at most 1 KB, one material, 15 joints, at least 23 clips, hashes and sizes match the manifests).

**Not verified:** in-game frames at normal camera distance; face features are tiny at gameplay scale and may read as a dark band. Red Zone uses `face: false` under the helmet. Diamond and Red Zone were not run remotely in this lane.

Software GL only. Not GPU evidence.
