import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPORT_PATH = "tests/reports/controls-picking-xr-context/report.json";
const MAX_AGE_MS = 45 * 60 * 1000;
interface Check { readonly id: string; readonly pass: boolean; readonly detail: string }
const check = (id: string, pass: boolean, detail: string): Check => ({ id, pass, detail });
const json = (path: string): any => JSON.parse(readFileSync(resolve(path), "utf8"));
const source = (path: string): string => readFileSync(resolve(path), "utf8");
const fresh = (value: any): boolean => {
  const time = Date.parse(String(value.generatedAt ?? ""));
  return Number.isFinite(time) && Date.now() - time <= MAX_AGE_MS;
};

const baseline = json("tests/reports/current-threejs-baseline.json");
const orbit = json("tests/reports/threejs-parity/orbit-controls/orbit-controls.json");
const trackball = json("tests/reports/current-routes/controls/trackball.json");
const picking = json("tests/reports/current-routes/interactive/picking.json");
const xr = json("tests/reports/current-routes/webxr/interactions.json");
const transform = json("tests/reports/threejs-parity-transform-controls/transform-controls.json");
const input = json("tests/reports/controls-picking-xr-context/input-modalities.json");
const context = json("tests/reports/public-renderer-normal-path/context-lifecycle.json");
const orbitParity = source("tests/unit/input/orbit-controls-three-parity.test.ts");
const cubeParity = source("tests/unit/rendering/interactive-cubes-three-parity.test.ts");
const pointParity = source("tests/unit/rendering/interactive-points-three-parity.test.ts");

const checks: Check[] = [
  check("current-three-r185", baseline.pass === true && baseline.three?.version === "0.185.1" && baseline.three?.tag === "r185", `three=${String(baseline.three?.version)}; tag=${String(baseline.three?.tag)}`),
  check("orbit-pan-zoom-rendered", orbit.pass === true && orbit.after?.rotateSamples > 0 && orbit.after?.panSamples > 0 && orbit.after?.wheelSamples > 0 && orbit.after?.azimuth !== orbit.before?.azimuth && orbit.after?.distance > orbit.before?.distance, `rotate=${String(orbit.after?.rotateSamples)}; pan=${String(orbit.after?.panSamples)}; wheel=${String(orbit.after?.wheelSamples)}`),
  check("trackball-rendered", trackball.pass === true && trackball.runtime?.renderer === "a3d-webgl2" && trackball.runtime?.rotateEnabled === true && trackball.runtime?.panEnabled === true && trackball.runtime?.zoomEnabled === true && trackball.runtime?.trackballRollApplied === true, `runtime=${JSON.stringify(trackball.runtime)}`),
  check("first-person-pointer-lock", input.pass === true && input.result?.firstPersonMoved === true && input.result?.pointerLock?.requested === true && input.result?.pointerLock?.settled === true, `moved=${String(input.result?.firstPersonMoved)}; pointerLock=${JSON.stringify(input.result?.pointerLock)}`),
  check("keyboard-touch-pointer-gamepad-focus", input.result?.keyboardBeforeBlur === true && input.result?.keyboardAfterBlur === false && input.result?.pointerButtonDown === true && input.result?.touchCountDuringDown === 1 && input.result?.touchCountAfterUp === 0 && input.result?.gamepadAxis === 0.75 && input.result?.gamepadButtonPressed === true, `keyboard=${String(input.result?.keyboardBeforeBlur)}/${String(input.result?.keyboardAfterBlur)}; touch=${String(input.result?.touchCountDuringDown)}/${String(input.result?.touchCountAfterUp)}; gamepad=${String(input.result?.gamepadAxis)}`),
  check("accessible-viewport-semantics", input.result?.accessibility?.focusable === true && input.result?.accessibility?.role === "application" && Boolean(input.result?.accessibility?.label) && Boolean(input.result?.accessibility?.describedBy), JSON.stringify(input.result?.accessibility)),
  check("cube-and-point-picking-rendered", picking.pass === true && picking.runtime?.renderer === "a3d-webgl2" && picking.runtime?.cubePickHits > 0 && picking.runtime?.pointPickHits > 0, `cube=${String(picking.runtime?.cubePickHits)}; point=${String(picking.runtime?.pointPickHits)}`),
  check("picking-compared-to-current-three", /from "three"/.test(cubeParity) && /THREE\.Raycaster/.test(cubeParity) && /from "three"/.test(pointParity) && /THREE\.Raycaster/.test(pointParity) && /from "three"/.test(orbitParity) && /OrbitControls/.test(orbitParity), "focused unit gate compares orbit and identical cube/point rays against actual Three.js"),
  check("drag-transform-gizmo", transform.pass === true && transform.translateDrag?.constrainedToAxis === true && transform.rotateDrag?.constrainedToAxis === true && transform.scaleDrag?.constrainedToAxis === true && transform.snappedDrag?.committed === 0.5 && transform.missedPointerFallsThrough === true && transform.localSpaceDiffersFromWorld === true, `translate=${String(transform.translateDrag?.pickedHandle)}; snap=${String(transform.snappedDrag?.committed)}; captures=${String(transform.captures?.length)}`),
  check("webxr-injected-session-only", xr.pass === true && xr.renderer === "injected-webxr-session" && xr.runtime?.evidenceMode === "injected-webxr-session" && xr.runtime?.realDeviceClaimed === false && xr.runtime?.xrSessionStarted === true && xr.runtime?.xrModeCount === 3 && xr.runtime?.controllerCount >= 2 && xr.runtime?.hitTestCount > 0, `mode=${String(xr.runtime?.evidenceMode)}; realDevice=${String(xr.runtime?.realDeviceClaimed)}; modes=${String(xr.runtime?.xrModeCount)}`),
  check("context-pauses-remounts-restores", context.pass === true && context.probe?.pausedOnLoss === true && context.probe?.recoveryCount >= 1 && context.probe?.resourcesRecreated === true && context.probe?.sceneRestored === true && context.probe?.afterRestore?.runtimeMounted === true && context.probe?.afterRestore?.pixelHash === context.probe?.beforeLoss?.pixelHash && context.probe?.deviceLost === false, `lost=${String(context.probe?.lostCount)}; restored=${String(context.probe?.restoredCount)}; hash=${String(context.probe?.afterRestore?.pixelHash)}`),
  check("reports-fresh", [baseline, orbit, trackball, picking, xr, transform, input, context].every(fresh), `generatedAt=${[baseline, orbit, trackball, picking, xr, transform, input, context].map((entry) => entry.generatedAt).join(",")}`)
];

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "aura3d.renderer-controls-picking-xr-context/1.0",
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  claim: "bounded-public-controls-picking-injected-xr-and-app-driven-context-recovery",
  currentThree: { version: baseline.three?.version, tag: baseline.three?.tag, releaseCommit: baseline.three?.releaseCommit },
  controls: { orbit, trackball, transform, input },
  picking,
  xr,
  context,
  scope: {
    proven: ["rendered orbit rotate/pan/wheel and rendered trackball rotate/pan/zoom/roll", "package first-person and pointer-lock behavior plus real browser keyboard, touch-pointer, gamepad, focus, and accessible viewport semantics", "rendered cube/point picking and rendered transform gizmo drag constraints/snapping", "injected WebXR VR/AR/inline session-controller behavior", "root app-driven context loss pause, renderer remount/resource recreation, and identical restored scene pixels"],
    limited: ["WebXR evidence uses injected sessions and does not claim a physical headset/controller/device run", "context recovery is an explicit app-owned setScene remount after the public restoration signal, not transparent automatic recovery for every renderer consumer", "accessibility proof covers the tested viewport semantics and input focus behavior, not a full WCAG audit"],
    blocked: ["physical-device WebXR support without physical-device evidence", "universal automatic GPU-resource recovery", "pixel-identical Three.js control visuals"]
  },
  checks,
  failures: failures.map(({ id, detail }) => ({ id, detail }))
};

mkdirSync(dirname(resolve(REPORT_PATH)), { recursive: true });
writeFileSync(resolve(REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) {
  console.error(`Controls/picking/XR/context proof is UNPROVEN: ${failures.map((entry) => entry.id).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Controls/picking/XR/context proof PASS: Three.js ${String(report.currentThree.version)}; ${checks.length}/${checks.length} checks; ${REPORT_PATH}`);
}
