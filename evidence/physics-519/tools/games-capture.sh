#!/bin/bash
# usage: games-capture.sh <base|branch> <run a|b>. 514 method: evidence/physics-514/tools/cap.mjs (loopback CDP, real GPU, virtual-clock shim,
# 10 s settle, 240 frames at 1/60 s with frame-indexed keys); public/ served read-only from the main checkout.
T=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1/evidence/physics-514/tools
O=/tmp/phys519/games
V=$1; S=$2
export SHIM=$T/shim.js
mkdir -p $O/frames
for g in ${CAPGAMES:-showcase-bank-shot showcase-slingshot-siege showcase-blockfall-reactor showcase-aurora-lander showcase-vault-breakers}; do
  Q=""; K=""
  case $g in
    showcase-bank-shot) K="Space:5:70";;
    showcase-vault-breakers) K="Space:5:70";;
    showcase-slingshot-siege) Q="seed=1&level=0&demo=1";;
    showcase-aurora-lander) K="ArrowUp:30:150";;
    showcase-cross-hop) K="ArrowUp:60:62";;
    showcase-teleoperator) Q="";;
  esac
  KEYSEQ=$K nice -n 10 node $T/cap.mjs /Users/gurbakshchahal/platforms/aura3d $O/$V/$g $O/frames/$V-$g-$S.png "$Q" 240 10000 > $O/frames/$V-$g-$S.log 2>&1
  echo "$V-$g-$S exit $?"
done
