# Aura FC 3D audit-fix evidence (lane G09, 2026-10-29)

All frames come from remote runs (`tools/remote-acr/run.sh`, headless Chromium on software WebGL2, not real-GPU frames).
Spec `tests/browser/audit-fix/aura-fc-3d.spec.ts` logs `FC_META` (luma, sim and camera evidence) and `GL_JPG` canvas
JPEGs; each folder has the decoded frames (`<target>--<shot>.jpg`) and the raw `log-lines.txt`. The sim is advanced with
the QA `step(n)` hook (fixed 1/60 s steps); judge the later shots of each target, never `a-ready`.

| Folder | Build | RUN_ID |
|---|---|---|
| `before/desktop` | base `b2dba3713` | `g09cap-before1-171735` |
| `before/phone` | base | `g09cap-before2-172254` |
| `before/modes` (shootout, Touch Lab, pause) | base | `g09cap-before3-172254` |
| `before/venues` (Favela, Lagos, Uyuni) | base | `g09cap-before4-171735` |
| `after/desktop` | `2cc85c5ae` | `g09cap-after1-171737` |
| `after/phone` | `d6ae2caef` | `g09cap-after2-172256` |
| `after/modes` | `0faa96cb1` | `g09cap-after3-172256` |
| `after/venues` (first venue looks, washed out) | `2cc85c5ae` | `g09cap-after4-171737` |
| `after/venues-tuned` | `fa446fdf5` | `g09cap-after5-180321` |
| `diag-4.5.0` (render path, bloom A/B, AO A/B, foot crops) | `6a0275a76` | `g09cap-diag-171922` |
| `diag` (wave 1 diag run) | `c2fe20792` | `g09diag-125021`, `g09ao-130820` |
| `referee-wave2` | see `docs/audits/lanes/g09.md` Wave 2 | `g09w2before3-171746`, `g09w2after3-171748` |
