// silt-and-signal: manual=1 (sim advances only through stepFrames). Deterministic scripted input from the start line: fly left and
// low so the canal fills the lower left of the chase camera. Same input, same frame count, every variant.
const H = window.__AURA_SILT__;
H.stepFrames(30);
H.stepFrames(70, { throttle: 0.5, steer: -1, lift: -0.4, brake: false, boost: false, interact: false });
H.stepFrames(40, { throttle: 0.3, steer: 0, lift: 0, brake: false, boost: false, interact: false });
