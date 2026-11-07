#!/bin/bash
# Side-by-side crops of the near-camera frames around the emitter origin (base = 5.0.2, branch = lane), plus amplified
# with-minus-without images. Run from the repo root.
F=evidence/lane-511-engine-api/games-r3/frames
O=evidence/lane-511-engine-api/games-r3
crop() { python3 "$O/crop.py" "$O/crop-near-$1.png" $2 $3 $4 $5 $6 "base=$F/cross-hop-diorama-$7-near-base.png" "basenoamb=$F/cross-hop-diorama-$7-near-basenoamb.png" "branch=$F/cross-hop-diorama-$7-near-branch.png" "branchnoamb=$F/cross-hop-diorama-$7-near-branchnoamb.png"; }
crop pollen 480 290 800 400 2 t0-pollen
crop fireflies 480 290 800 400 2 t2-fireflies
crop embers 480 80 800 360 2 t3-embers
crop rain 400 40 880 400 1 t4-rain
crop confetti 480 290 800 420 2 t5-confetti
for t in t0-pollen t2-fireflies t3-embers t4-rain t5-confetti; do
  for v in base branch; do
    python3 "$O/absdiff.py" "$F/cross-hop-diorama-$t-near-$v.png" "$F/cross-hop-diorama-$t-near-${v}noamb.png" "$O/absdiff-near-$t-$v-minus-noamb-x8.png" 8
  done
done
