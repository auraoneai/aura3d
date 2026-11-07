#!/bin/bash
GAMES=showcase-vault-breakers bash /tmp/phys519/tools/games-build.sh branch
GAMES=showcase-vault-breakers bash /tmp/phys519/tools/games-build.sh base
cd /Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1 && git status --short packages
bash /tmp/phys519/tools/games-capture.sh base a
bash /tmp/phys519/tools/games-capture.sh branch a
bash /tmp/phys519/tools/games-capture.sh branch b
bash /tmp/phys519/tools/games-capture.sh base b
echo done > /tmp/phys519/games-chain.done
