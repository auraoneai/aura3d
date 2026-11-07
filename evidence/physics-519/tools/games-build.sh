#!/bin/bash
# usage: games-build.sh <base|branch>. Builds 5 games from this worktree with each app's own vite.config (publicDir off; the
# capture serves the main checkout's public/ read-only). base = engine/physics sources of origin/lane/514-physics-out-of-box
# (cf536d3bc) checked out over packages/ for the duration, then restored from HEAD.
W=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1
BASE=cf536d3bc
O=/tmp/phys519/games/$1
cd $W || exit 1
mkdir -p $O
GAMES=${GAMES:-"showcase-bank-shot showcase-slingshot-siege showcase-blockfall-reactor showcase-aurora-lander showcase-vault-breakers"}
until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
if [ "$1" = base ]; then git checkout $BASE -- packages; fi
git diff --stat HEAD -- packages > $O.srcdiff.txt
for g in $GAMES; do
  if [ -f apps/$g/vite.config.ts ]; then
    printf 'import config from "./vite.config";\nexport default { ...config, publicDir: false };\n' > apps/$g/vite.nocopy519.config.ts
  else
    # No app config (the app has its own small public/): the repo root config, app public/ copied as usual.
    printf 'import config from "../../vite.config";\nexport default { ...config };\n' > apps/$g/vite.nocopy519.config.ts
  fi
  (cd apps/$g && nice -n 10 $W/node_modules/.bin/vite build -c vite.nocopy519.config.ts --outDir $O/$g --emptyOutDir > $O/$g.log 2>&1; echo "exit $?" >> $O/$g.log)
  rm -f apps/$g/vite.nocopy519.config.ts
done
if [ "$1" = base ]; then git checkout HEAD -- packages; fi
git status --short packages > $O.status-after.txt
rmdir /tmp/a3d-build.lock
echo done > $O.done
