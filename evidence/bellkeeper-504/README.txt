Bellkeeper's Walk 120/144 Hz sliding repro (lane/504-bellkeeper). Method: Chrome headless on Metal GPU via loopback CDP, a virtual clock
shim (tools/shim.js) replaces requestAnimationFrame/performance.now/Date.now so the page runs at a chosen frame cadence; tools/drive.mjs holds
ArrowRight for ~6 s; analyze.mjs counts Idle<->Walk flips; skate.mjs compares ground speed with foot speed (captureTime advance * 2.315).
Result: no repro at 30/60/120/144 Hz, jittered, dropped-frame or coalesced-timestamp cadences, on a local build of main and on production.
data/ has the counts; strip-*.png are 8 frames 0.1 s apart. owner-console-snippet.js captures the owner's machine.
