// T0-20 known-bad fixture: the pre-#863 emitted shape. The `.ts` URL target is
// never shipped in the packed tarball, so a consumer's worker load 404s.
export function createRetargetWorker() {
    return new Worker(new URL("./retarget.worker.ts", import.meta.url), { type: "module" });
}
