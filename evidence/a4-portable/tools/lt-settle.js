// last-train: deterministic state (manual=1: the sim only advances through stepFrames). Drive the sim through the first leg
// with the game's own controller so the chase camera looks out over the floating route (cloud sea visible under and beyond it),
// then stop a fixed number of frames after the arrival. No game code or camera is touched.
window.__AURA_LAST_TRAIN__.runLeg(0);
window.__AURA_LAST_TRAIN__.stepFrames(45);
