#!/bin/bash
# Adds showcase-teleoperator: cross-hop and vault-breakers fail to mount on base and branch alike (asset 404 / material error), so
# they show no 3D; teleoperator is a second rendering non-Rapier game.
GAMES=showcase-teleoperator bash /tmp/phys519/tools/games-build.sh branch
GAMES=showcase-teleoperator bash /tmp/phys519/tools/games-build.sh base
cd /Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1 && git status --short packages
for run in "base a" "branch a" "branch b" "base b"; do CAPGAMES=showcase-teleoperator bash /tmp/phys519/tools/games-capture.sh $run; done
echo done > /tmp/phys519/games-chain3.done
