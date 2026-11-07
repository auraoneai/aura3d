#!/bin/bash
# fx522: no-physics app and prefabs.miniGolfHole() app built with aura3d() (fixed plugin), the pre-fix plugin, and no plugin.
set -u
D=/tmp/fx522-consumer
cd $D
echo 'export default {};' > vite.none.config.js
build() { # label root config
  until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
  nice -n 10 node_modules/.bin/vite build $2 -c $D/$3 --outDir $D/dist-$1 --emptyOutDir > build-$1.log 2>&1
  echo "exit $?" >> build-$1.log
  rmdir /tmp/a3d-build.lock
}
build nophys-aura3d . vite.aura3d.config.js
build golf-aura3d golf vite.aura3d.config.js
build golf-none golf vite.none.config.js
build golf-aura3d-old golf vite.aura3d-old.config.js
echo done > $D/build.done
