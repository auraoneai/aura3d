/**
 * Wonder World per-story stills, part 4 of 4: G05-G12. One canvas-only JPEG per story at its first "invite" or "model"
 * beat (600 ms into the beat's wait, or 3 s after the beat starts), drawn with the admitted models
 * (`?models=1&modelWaitMs=180000&manual=1`, 1024x768): the redacted per-story captures for the evidence README. The
 * page reaches each moment with one advance() on the simulated story clock (wonder-world-timeline.ts) and checks its
 * director against it; each story's still must be drawn, from admitted GLBs only, with no stage warning or error.
 * The four parts together cover all 32 stories; wonder-world-capture-lib.ts holds the suite.
 * Remote runner only: apps/veer-wonder-world/tools/remote-run.sh stills-4   (estimated 20-30 min: one boot and eight story
 * loads that wait for their models)
 *
 * Records: WWSHOT still-<code> and WWJSON still-<code> per story, WWJSON stills-g05-g12-summary.
 */
import { defineStillsSuite } from "./wonder-world-capture-lib";
import { ACTIVITIES } from "./wonder-world-lib";

defineStillsSuite({ title: "Wonder World per-story stills G05-G12", stories: ACTIVITIES.slice(4) });
