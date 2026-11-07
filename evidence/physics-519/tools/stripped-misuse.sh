#!/bin/bash
# Recipe 16 built with aura3d({ physics: false }) (forced strip): what a wrongly stripped physics app shows.
D=/tmp/phys519/consumer/branch
until mkdir /tmp/a3d-build.lock 2>/dev/null; do sleep 10; done
(cd $D && nice -n 10 node_modules/.bin/vite build phys -c $D/vite.plugin-false.config.js --outDir $D/dist-phys-plugin-false-present --emptyOutDir > build-phys-plugin-false-present.log 2>&1; echo "exit $?" >> build-phys-plugin-false-present.log)
rmdir /tmp/a3d-build.lock
node /tmp/phys519/tools/ccap519.mjs $D/dist-phys-plugin-false-present /tmp/phys519/frames/branch-phys-plugin-false-present.png "steps=140" 9000 > /tmp/phys519/frames/branch-phys-plugin-false-present.log 2>&1
echo "exit $?"
