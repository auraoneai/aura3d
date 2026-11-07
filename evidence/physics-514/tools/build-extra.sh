#!/bin/bash
# usage: build.sh <branch|base>. Builds 6 games + the physics recipe from the worktree. For base, the 3 lane-changed source files are
# replaced by their e5387f3b0 (origin/main base) versions (and the new backendMissing.ts moved away) for the duration, then restored
# from the saved branch copies.
W=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_37e6949c-ca0-1
O=/tmp/fx517-phys2/$1
E=$W/packages/engine/src/agent-api
cd $W || exit 1
mkdir -p $O
if [ "$1" = base ]; then
  cp /tmp/fx517-phys2/basesrc/createAuraAppCore.ts $E/app/createAuraAppCore.ts
  cp /tmp/fx517-phys2/basesrc/PhysicsWorldProvider.ts $E/physics/PhysicsWorldProvider.ts
  cp /tmp/fx517-phys2/basesrc/index.ts $W/packages/physics-rapier/src/index.ts
  rm -f $E/physics/backendMissing.ts
fi
shasum $E/app/createAuraAppCore.ts $E/physics/PhysicsWorldProvider.ts $W/packages/physics-rapier/src/index.ts > $O.srcsha.txt
for g in showcase-blockfall-reactor showcase-bunker-zero showcase-roadster-rush showcase-teleoperator; do
  until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
  if [ $g = recipe ]; then
    (cd docs/agents/recipes-src/physics-basics && nice -n 10 $W/node_modules/.bin/vite build -c vite.tmp.config.ts --outDir $O/$g --emptyOutDir > $O/$g.log 2>&1; echo "exit $?" >> $O/$g.log)
  else
    (cd apps/$g && nice -n 10 $W/node_modules/.bin/vite build -c vite.nocopy.config.ts --outDir $O/$g --emptyOutDir > $O/$g.log 2>&1; echo "exit $?" >> $O/$g.log)
  fi
  rmdir /tmp/a3d-build.lock
done
if [ "$1" = base ]; then
  cp /tmp/fx517-phys2/branchsrc/createAuraAppCore.ts $E/app/createAuraAppCore.ts
  cp /tmp/fx517-phys2/branchsrc/PhysicsWorldProvider.ts $E/physics/PhysicsWorldProvider.ts
  cp /tmp/fx517-phys2/branchsrc/backendMissing.ts $E/physics/backendMissing.ts
  cp /tmp/fx517-phys2/branchsrc/index.ts $W/packages/physics-rapier/src/index.ts
fi
echo done > $O.extra.done
