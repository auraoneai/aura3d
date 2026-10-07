/**
 * C-33 step plugin `webm` (PRD-12 §9.6, T5.4): `{"webm": {"seconds": 5}}`
 * timeline step — records ~seconds of video around the action shot. Playwright
 * records per-context (the runner enables `recordVideo` when a webm step is in
 * the timeline); this step holds the recording window and registers the file.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: "webm",
  owner: "prd12",
  async run(page, step, ctx) {
    const seconds = step.webm?.seconds ?? 5;
    await sleep(seconds * 1000);
    const video = page.video();
    if (!video) {
      ctx.log("webm: recordVideo not enabled on this context — no video captured");
      return { files: [], data: { seconds, error: "recordVideo-not-enabled" } };
    }
    // The file completes on context close; the runner renames it to <run>__capture.webm.
    const file = await video.path();
    return { files: [file], data: { seconds } };
  }
};
