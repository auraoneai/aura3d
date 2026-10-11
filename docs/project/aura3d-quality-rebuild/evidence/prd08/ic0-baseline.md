# PRD-08 IC-0 baseline (lane note)

IC-0 is the flag-`none` baseline capture of the lane scenes (PRD-08 Phase 1). The program record of IC-0 (`history/rounds/IC-0.json`, noise floor) is G5 / lane 12's; it is not written here.

Lane-08 side:
- The six `prd08-motion-*` scenes are active in the benchmark registry (#911, `motion-registry.test.ts`, green in main unit run 38113231509).
- The lane's flag-on capture is the `motion scenes (macos-14)` job of `qr-prd08-camera.yml` (`--flags camera`, Aura3D + three r0.185.1).
- A flag-`none` baseline of the same scenes comes from the same job with `--flags none`, or from G5's IC-0 nightly-on-main capture, which covers lane scenes in both `none` and `$ALL`.

Status: **pending**. No flag-`none` capture of the `prd08-motion-*` scenes on a main commit exists yet. The first main motion run is 38113231509 (queued at the time of writing). When G5 records IC-0, it should cite the main run that produced the `none` capture of these six scenes.
