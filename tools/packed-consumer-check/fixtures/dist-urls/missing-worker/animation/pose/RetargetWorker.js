// T0-20 known-bad fixture: `.js` URL, but the worker was not packed beside it.
export function createRetargetWorker() {
    return new Worker(new URL("./retarget.worker.js", import.meta.url), { type: "module" });
}
