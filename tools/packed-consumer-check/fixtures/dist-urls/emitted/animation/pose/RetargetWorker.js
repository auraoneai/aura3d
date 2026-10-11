// T0-20 clean fixture: the URL targets the emitted `.js` worker beside it.
export function createRetargetWorker() {
    return new Worker(new URL("./retarget.worker.js", import.meta.url), { type: "module" });
}
