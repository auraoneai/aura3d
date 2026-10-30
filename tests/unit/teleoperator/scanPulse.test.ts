import { describe, expect, it } from "vitest";
import { SKY_LOOKS, SKY_ORDER } from "../../../apps/showcase-teleoperator/src/look";
import {
  CAMERA_PITCH_DEG,
  SCAN_PERIOD_S,
  SCAN_RANGE_M,
  SENSOR_PASS_GLSL,
  SENSOR_PASS_NAME,
  createSensorPass,
  hexToLinear,
  installSensorPass,
  marineDeckAmount,
  ringAt,
  scanPulseAt,
  sensorUniforms
} from "../../../apps/showcase-teleoperator/src/scanPulse";

const base = { motionOk: true, roofCam: false, lowTier: false, skyStrength: 1 } as const;

describe("grid dispatch GD-09 LiDAR scan pulse", () => {
  it("leaves the car every 2.4 s and sweeps out to 60 m", () => {
    expect(SCAN_PERIOD_S).toBe(2.4);
    expect(SCAN_RANGE_M).toBe(60);
    const radii = [0.1, 0.4, 0.8, 1.2].map((t) => scanPulseAt({ ...base, t }).radius);
    for (let i = 1; i < radii.length; i++) expect(radii[i]!).toBeGreaterThan(radii[i - 1]!);
    expect(scanPulseAt({ ...base, t: 0.5 }).radius).toBeCloseTo(scanPulseAt({ ...base, t: 0.5 + SCAN_PERIOD_S }).radius, 9);
    for (let t = 0; t < 10; t += 0.05) expect(scanPulseAt({ ...base, t }).radius).toBeLessThanOrEqual(SCAN_RANGE_M);
    // a 0.6 s pair inside one sweep shows the ring in two different places
    const a = scanPulseAt({ ...base, t: 0.3 });
    const b = scanPulseAt({ ...base, t: 0.9 });
    expect(Math.abs(b.radius - a.radius)).toBeGreaterThan(10);
    expect(a.strength).toBeGreaterThan(0);
    expect(b.strength).toBeGreaterThan(0);
  });

  it("pulses twice as often on the roof sensor camera", () => {
    const chase = scanPulseAt({ ...base, t: 0.3 });
    const roof = scanPulseAt({ ...base, roofCam: true, t: 0.3 + SCAN_PERIOD_S / 2 });
    expect(roof.radius).toBeGreaterThan(0);
    expect(scanPulseAt({ ...base, roofCam: true, t: 0.3 }).radius).toBeCloseTo(roof.radius, 9);
    // 1.2 s later the chase ring is near the end of its sweep while the roof camera has fired a new one
    expect(scanPulseAt({ ...base, t: 0.3 + SCAN_PERIOD_S / 2 }).radius).toBeGreaterThan(roof.radius + 30);
    expect(chase.strength).toBeGreaterThan(0);
  });

  it("reduced motion: no ring at any time, so a 0.6 s pair is identical (PRD §6.3)", () => {
    for (let t = 0; t < 6; t += 0.1) {
      const s = scanPulseAt({ ...base, motionOk: false, t });
      expect(s.strength).toBe(0);
      expect(ringAt(s, s.radius)).toBe(0);
      expect(sensorUniforms({ look: SKY_LOOKS.golden, pulse: s, eyeHeight: 3.4, fovDeg: 56, carX: 1, carZ: -0.8 }).u_ring).toEqual(sensorUniforms({ look: SKY_LOOKS.golden, pulse: scanPulseAt({ ...base, motionOk: false, t: t + 0.6 }), eyeHeight: 3.4, fovDeg: 56, carX: 1, carZ: -0.8 }).u_ring);
    }
  });

  it("Low tier keeps the ring at half strength; night reads stronger than noon", () => {
    const full = scanPulseAt({ ...base, t: 0.5 });
    expect(scanPulseAt({ ...base, lowTier: true, t: 0.5 }).strength).toBeCloseTo(full.strength / 2, 9);
    expect(SKY_LOOKS.night.scanStrength).toBeGreaterThan(SKY_LOOKS.noon.scanStrength);
  });

  it("the ring is a narrow band around its radius and never draws past the range", () => {
    const s = scanPulseAt({ ...base, t: 0.6 });
    expect(ringAt(s, s.radius)).toBeCloseTo(s.strength, 9);
    expect(ringAt(s, s.radius + 3)).toBeLessThan(s.strength * 0.01);
    expect(ringAt({ ...s, radius: SCAN_RANGE_M }, SCAN_RANGE_M + 1)).toBe(0);
  });
});

describe("grid dispatch GD-05 marine deck (sensor pass)", () => {
  const eye = 3.4;
  const sinElev = (height: number, distance: number): number => (height - eye) / Math.hypot(height - eye, distance);

  it("leaves the street and the cars clear on every sky", () => {
    for (const sky of SKY_ORDER) {
      for (const [h, d] of [[0, 10], [1.5, 40], [6.25, 30], [0, 200]] as const) expect(marineDeckAmount(SKY_LOOKS[sky].marine, h, sinElev(h, d), eye)).toBe(0);
    }
  });

  it("dusk: tower tops 140 m away dissolve, the ceiling above the horizon is the fog bank", () => {
    const deck = SKY_LOOKS.golden.marine;
    expect(marineDeckAmount(deck, 60, sinElev(60, 140), eye)).toBeGreaterThan(0.6);
    expect(marineDeckAmount(deck, 25, sinElev(25, 140), eye)).toBe(0);
    // a sky ray at 10 deg elevation (depth = camera far, 620 m)
    expect(marineDeckAmount(deck, eye + 620 * Math.sin((10 * Math.PI) / 180), Math.sin((10 * Math.PI) / 180), eye)).toBeCloseTo(deck.opacity, 2);
    // the 2 deg band under the deck keeps the sunset glow
    expect(marineDeckAmount(deck, eye + 620 * Math.sin((2 * Math.PI) / 180), Math.sin((2 * Math.PI) / 180), eye)).toBe(0);
  });

  it("marine fog: the deck sits at 12-26 m and swallows a 30 m tower 100 m away; noon only a faint high haze", () => {
    expect(SKY_LOOKS.fog.marine.base).toBe(12);
    expect(marineDeckAmount(SKY_LOOKS.fog.marine, 30, sinElev(30, 100), eye)).toBeGreaterThan(0.8);
    expect(marineDeckAmount(SKY_LOOKS.noon.marine, 60, sinElev(60, 140), eye)).toBe(0);
    expect(SKY_LOOKS.noon.marine.opacity).toBeLessThanOrEqual(0.3);
  });
});

describe("grid dispatch sensor pass descriptor", () => {
  it("is one depth-reading HDR pass with the deck and ring uniforms the GLSL declares", () => {
    const pass = createSensorPass(SKY_LOOKS.golden);
    expect(pass.name).toBe(SENSOR_PASS_NAME);
    expect(pass.insertAt).toBe("before-tonemap");
    expect(pass.inputs).toEqual(["color", "depth"]);
    for (const key of Object.keys(pass.uniforms ?? {})) expect(SENSOR_PASS_GLSL, key).toMatch(new RegExp(`uniform (vec3|vec4|float) ${key};`));
    // the engine prelude owns these; the pass must not redeclare them
    expect(SENSOR_PASS_GLSL).not.toMatch(/#version|precision |uniform sampler2D u_color|in vec2 v_uv/);
    expect(CAMERA_PITCH_DEG).toBeGreaterThan(9.5);
    expect(CAMERA_PITCH_DEG).toBeLessThan(10.5);
  });

  it("installs once and streams the frame's uniforms through app.post.setPassUniform", () => {
    const writes: Array<[string, string, unknown]> = [];
    let added = 0;
    const host = {
      addPostPass: () => { added += 1; return () => { added -= 1; }; },
      post: { setPassUniform: (name: string, key: string, value: number | readonly number[]) => { writes.push([name, key, value]); } }
    };
    const sensor = installSensorPass(host, SKY_LOOKS.night);
    expect(sensor.active).toBe(true);
    expect(added).toBe(1);
    sensor.update({ look: SKY_LOOKS.night, pulse: scanPulseAt({ ...base, t: 0.5 }), eyeHeight: 1.8, fovDeg: 58, carX: 0.9, carZ: -0.8 });
    expect(writes.map((w) => w[1]).sort()).toEqual(["u_cam", "u_car", "u_deck", "u_deckColor", "u_ring", "u_ringColor"]);
    expect(writes.every((w) => w[0] === SENSOR_PASS_NAME)).toBe(true);
    expect((writes.find((w) => w[1] === "u_cam")![2] as number[])[0]).toBe(1.8);
    sensor.dispose();
    expect(added).toBe(0);
  });

  it("converts the teal objective colour to linear for the HDR target", () => {
    const [r, g, b] = hexToLinear("#3fd6c6");
    expect(r).toBeLessThan(0.06);
    expect(g).toBeGreaterThan(0.65);
    expect(b).toBeGreaterThan(0.55);
  });
});
