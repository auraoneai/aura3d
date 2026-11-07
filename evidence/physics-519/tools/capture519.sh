#!/bin/bash
# All lane 519 clean-consumer captures, one after another (ccap519.mjs holds /tmp/a3d-rea.lock while each runs).
C=/tmp/phys519/consumer
F=/tmp/phys519/frames
T=/tmp/phys519/tools/ccap519.mjs
mkdir -p $F
cap() { node $T "$1" "$2" "$3" "$4" > "${2%.png}.log" 2>&1; echo "$(basename $2) exit $?"; }
cap $C/published/dist-nophys-present $F/published-nophys-present.png "" 8000
cap $C/branch/dist-nophys-present $F/branch-nophys-present.png "" 8000
cap $C/branch/dist-nophys-plugin-auto-present $F/branch-nophys-plugin-auto-present.png "" 8000
cap $C/branch/dist-nophys-plugin-lazy-present $F/branch-nophys-plugin-lazy-present.png "" 8000
cap $C/published/dist-phys-present $F/published-phys-present-steps140.png "steps=140" 9000
cap $C/branch/dist-phys-present $F/branch-phys-present-steps140.png "steps=140" 9000
cap $C/branch/dist-phys-plugin-auto-present $F/branch-phys-plugin-auto-present-steps140.png "steps=140" 9000
cap $C/branch/dist-lazyrecipe-plugin-lazy-present $F/branch-lazyrecipe-plugin-lazy-steps140.png "steps=140" 9000
cap $C/branch/dist-lazy-plugin-lazy-present $F/branch-lazy-plugin-lazy-steps140.png "steps=140&delay=2500" 9000
cap $C/branch/dist-lazy-plugin-auto-present $F/branch-lazy-plugin-auto-steps140.png "steps=140&delay=2500" 9000
echo done > /tmp/phys519/capture.done
