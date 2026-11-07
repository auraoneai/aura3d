#!/bin/bash
# usage: capture-all.sh <variant: branch|base> <run suffix> [games...]
# Real-GPU headless Chrome via loopback CDP, virtual-clock shim (origin/lane/504-bellkeeper evidence/bellkeeper-504/tools/shim.js),
# 10 s real-time settle with rAF held, then 240 frames at 1/60 s with frame-indexed key input. cap.mjs holds /tmp/a3d-rea.lock.
W=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_37e6949c-ca0-1
O=/tmp/fx517-phys2
V=$1; S=$2; shift 2
GAMES=${@:-"showcase-bank-shot showcase-slingshot-siege showcase-aurora-lander showcase-blockfall-reactor showcase-bunker-zero showcase-roadster-rush showcase-teleoperator"}
export SHIM=$O/tools/shim.js
for g in $GAMES; do
  Q=""; K=""; F=240
  case $g in
    showcase-bank-shot) K="Space:5:70";;
    showcase-vault-breakers) K="Space:5:70";;
    showcase-slingshot-siege) Q="seed=1&level=0&demo=1";;
    showcase-aurora-lander) K="ArrowUp:30:150";;
    showcase-cross-hop) K="ArrowUp:60:62";;
    showcase-dot-dash-3d) Q="start=1";;
    showcase-bunker-zero) Q="floor=1&autostart=1";;
    showcase-blockfall-reactor) Q="";;
    showcase-roadster-rush) K="ArrowUp:30:200";;
    showcase-teleoperator) Q="";;
    recipe) Q="steps=140";;
  esac
  KEYSEQ=$K nice -n 10 node $O/tools/cap.mjs /Users/gurbakshchahal/platforms/aura3d $O/$V/$g $O/frames/$V-$g-$S.png "$Q" $F 10000
done
echo done > $O/frames/$V-$S.done
