#!/bin/bash
# Adds showcase-cross-hop (vault-breakers fails to mount on base and branch alike: MODEL_CUSTOM_MATERIAL_UNSUPPORTED).
until [ -f /tmp/phys519/games-chain.done ]; do sleep 15; done
GAMES=showcase-cross-hop bash /tmp/phys519/tools/games-build.sh branch
GAMES=showcase-cross-hop bash /tmp/phys519/tools/games-build.sh base
cd /Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1 && git status --short packages
for run in "base a" "branch a" "branch b" "base b"; do CAPGAMES=showcase-cross-hop bash /tmp/phys519/tools/games-capture.sh $run; done
echo done > /tmp/phys519/games-chain2.done
