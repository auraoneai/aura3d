#!/bin/bash
# Lane 519 clean consumer. node_modules = the clean @aura3d/engine@5.0.2 npm tree used by lane 514 (/tmp/physics-clean) with
# @aura3d/engine replaced by (a) the published 5.0.2 tarball or (b) this branch's packed tarball. Builds, each serialized under
# /tmp/a3d-build.lock with nice 10:
#   nophys-*        src/main.ts: one lit box, no physics
#   phys-*          phys/main.ts: recipe 16 (declared bodies + app.physics at startup)
#   lazy-*          lazy/main.ts: no-physics intro, recipe 16 scene after ?delay ms (branch only)
#   lazyrecipe-*    lazyrecipe/main.ts: recipe 16 with `await app.physics.ready()` before the imperative calls (branch only)
# Suffix: -present / -absent (Rapier installed or moved away), -plugin-<mode> = vite.config with auraPhysicsPlugin({ physics: mode }).
set -u
C=/tmp/phys519/consumer
SRC=/tmp/physics-clean
APPS=/tmp/phys519/apps
BRANCH_TGZ=$1
PUB_TGZ=/tmp/fx517-phys-pub/aura3d-engine-5.0.2.tgz
PLUGIN=/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_5b8956aa-712-1/packages/assets/dist/vite/auraPhysics.js
build() { # dir label root config
  local D=$1 L=$2 R=$3 CFG=$4
  until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
  (cd $D && nice -n 10 node_modules/.bin/vite build $R -c $D/$CFG --outDir $D/dist-$L --emptyOutDir > build-$L.log 2>&1; echo "exit $?" >> build-$L.log)
  rmdir /tmp/a3d-build.lock
}
for V in branch published; do
  D=$C/$V
  rm -rf $D; mkdir -p $D
  cp -R $SRC/src $SRC/index.html $SRC/package.json $D/
  mkdir -p $D/phys $D/lazy $D/lazyrecipe
  cp $APPS/recipe16.ts $D/phys/main.ts; cp $APPS/phys-index.html $D/phys/index.html
  cp $APPS/lazy/main.ts $D/lazy/main.ts; cp $APPS/phys-index.html $D/lazy/index.html
  cp $APPS/lazyrecipe/main.ts $D/lazyrecipe/main.ts; cp $APPS/phys-index.html $D/lazyrecipe/index.html
  cp -R $SRC/node_modules $D/node_modules
  rm -rf $D/node_modules/@aura3d/engine; mkdir -p $D/node_modules/@aura3d/engine
  if [ $V = branch ]; then TGZ=$BRANCH_TGZ; else TGZ=$PUB_TGZ; fi
  tar xzf $TGZ -C $D/node_modules/@aura3d/engine --strip-components=1
  shasum $TGZ > $D/engine-tarball.sha1
  echo 'export default {};' > $D/vite.none.config.js
  for M in auto lazy true false; do
    if [ $M = auto ] || [ $M = lazy ]; then Q="\"$M\""; else Q=$M; fi
    printf 'import { auraPhysicsPlugin } from "%s";\nexport default { plugins: [auraPhysicsPlugin({ physics: %s })] };\n' "$PLUGIN" "$Q" > $D/vite.plugin-$M.config.js
  done
  build $D nophys-present . vite.none.config.js
  build $D phys-present phys vite.none.config.js
  if [ $V = branch ]; then
    build $D nophys-plugin-auto-present . vite.plugin-auto.config.js
    build $D nophys-plugin-lazy-present . vite.plugin-lazy.config.js
    build $D phys-plugin-auto-present phys vite.plugin-auto.config.js
    build $D lazy-plugin-lazy-present lazy vite.plugin-lazy.config.js
    build $D lazyrecipe-plugin-lazy-present lazyrecipe vite.plugin-lazy.config.js
    build $D lazy-plugin-auto-present lazy vite.plugin-auto.config.js
    mv $D/node_modules/@dimforge $D/node_modules/.dimforge-away
    build $D nophys-absent . vite.none.config.js
    build $D nophys-plugin-auto-absent . vite.plugin-auto.config.js
    mv $D/node_modules/.dimforge-away $D/node_modules/@dimforge
  fi
done
echo done > $C.done
