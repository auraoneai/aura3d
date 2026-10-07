/**
 * audio-live harness: builds the courier engine-loop fixture on a real
 * AudioContext and exposes drive/report hooks to the spec.
 */
import {
  createCourierEngineFixture,
  rpmForSpeed,
  vanEngineSpec,
  type FixtureLayerReport
} from "../../packages/game/fixtures/courier/engine";

interface AudioLiveResult {
  readonly status: "waiting" | "ready" | "error";
  readonly contextState?: string;
  readonly layerCount?: number;
  readonly bufferedLayers?: number;
  readonly idleReport?: readonly FixtureLayerReport[];
  readonly maxReport?: readonly FixtureLayerReport[];
  readonly driveReport?: readonly FixtureLayerReport[];
  readonly loadOffGains?: readonly number[];
  readonly loadOnGains?: readonly number[];
  readonly idleRpmExpected?: number;
  readonly maxRpmExpected?: number;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_AUDIO_LIVE__?: AudioLiveResult;
    __AUDIO_LIVE_DRIVE__?: {
      setRpm: (rpm: number) => Promise<readonly FixtureLayerReport[]>;
      setLoad: (load: number) => Promise<readonly FixtureLayerReport[]>;
      update: (speed: number, throttle: number) => Promise<readonly FixtureLayerReport[]>;
      layers: () => readonly FixtureLayerReport[];
    };
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

async function boot(): Promise<void> {
  try {
    const fixture = await createCourierEngineFixture({ probeBase: "/probes/" });
    await fixture.unlock();
    window.__AUDIO_LIVE_DRIVE__ = {
      setRpm: async (rpm) => {
        fixture.setRpm(rpm);
        await settle();
        return fixture.layerReport();
      },
      setLoad: async (load) => {
        fixture.setLoad(load);
        await settle();
        return fixture.layerReport();
      },
      update: async (speed, throttle) => {
        fixture.update(speed, throttle);
        await settle();
        return fixture.layerReport();
      },
      layers: () => fixture.layerReport()
    };
    // Rates/gains ramp via setTargetAtTime — let the initial mix settle.
    await settle();
    const idleReport = fixture.layerReport();
    fixture.setRpm(vanEngineSpec.maxRpm);
    await settle();
    const maxReport = fixture.layerReport();
    fixture.update(13, 1);
    await settle();
    const driveReport = fixture.layerReport();
    fixture.setLoad(0);
    await settle();
    const loadOffGains = fixture.layerReport().map((l) => l.gain);
    fixture.setLoad(1);
    await settle();
    const loadOnGains = fixture.layerReport().map((l) => l.gain);
    fixture.stop();

    window.__AURA3D_AUDIO_LIVE__ = {
      status: "ready",
      contextState: fixture.contextState(),
      layerCount: idleReport.length,
      bufferedLayers: idleReport.filter((l) => l.buffered).length,
      idleReport,
      maxReport,
      driveReport,
      loadOffGains,
      loadOnGains,
      idleRpmExpected: vanEngineSpec.idleRpm,
      maxRpmExpected: vanEngineSpec.maxRpm
    };
  } catch (error) {
    window.__AURA3D_AUDIO_LIVE__ = {
      status: "error",
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    };
  }
}

document.getElementById("audio-start")?.addEventListener("click", () => void boot());
