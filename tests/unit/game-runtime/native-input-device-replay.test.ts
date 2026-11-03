import { afterEach, describe, expect, it, vi } from "vitest";
import { game, type GameInputController, type GameInputReplayPlan } from "../../../packages/engine/src";

const version = "aura-game-input-device-state/v1" as const;
const dt = 1 / 60;
type DeviceRecording = NonNullable<GameInputReplayPlan["deviceState"]>;
type DeviceFrame = DeviceRecording["frames"][number];
type MutablePad = { connected: boolean; index: number; axes: number[]; buttons: { pressed: boolean; value: number }[] };

function pad(index: number, axes: number[], pressed: number[] = []): MutablePad {
  return {
    connected: true,
    index,
    axes,
    buttons: Array.from({ length: 4 }, (_, button) => ({ pressed: pressed.includes(button), value: pressed.includes(button) ? 1 : 0 }))
  };
}

function emit(target: EventTarget, type: string, properties: Record<string, unknown>): void {
  target.dispatchEvent(Object.assign(new Event(type), properties));
}

function input(target?: EventTarget, record = false) {
  return game.input({
    actions: {
      jump: ["Space", "GamepadA"],
      guard: ["GamepadB"],
      fire: ["PointerPrimary"],
      right: ["KeyD"]
    },
    axes: {
      padX: { gamepadAxis: 0, smoothing: 8, deadzone: 0.1 },
      pad1X: { gamepadAxis: 0, gamepadIndex: 1, deadzone: 0 },
      lookX: { pointerDelta: "x" },
      moveX: { positive: "right", gamepadAxis: 1, deadzone: 0 }
    },
    target,
    autoListen: target !== undefined,
    gamepad: true,
    ...(record ? { recordDeviceState: version } : {})
  });
}

function deviceFrame(frame: number, overrides: Partial<DeviceFrame> = {}): DeviceFrame {
  return {
    frame,
    time: frame * dt,
    pointer: { active: false, x: 0, y: 0, dx: 0, dy: 0, buttons: [] },
    gamepads: [],
    ...overrides
  };
}

function recording(frames: readonly DeviceFrame[]): DeviceRecording {
  return { schemaVersion: version, frames };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("versioned game input device recording", () => {
  it("replays sampled pointer and polled gamepads frame by frame, including seek, export and idle frames", () => {
    const target = new EventTarget();
    const firstPad = pad(0, [0.5, -0.3], [0]);
    const secondPad = pad(1, [-0.8, 0.4], [1]);
    const disconnected = { ...pad(2, [1, 1], [0]), connected: false };
    let pads: (MutablePad | null)[] = [firstPad];
    const getGamepads = vi.fn(() => pads);
    vi.stubGlobal("navigator", { getGamepads });
    const recorder = input(target, true);
    const snapshots = [];

    emit(target, "pointermove", { clientX: 20, clientY: 8 });
    recorder.press("KeyD");
    snapshots.push(recorder.update(dt));

    emit(target, "pointerdown", { clientX: 20, clientY: 8, button: 0, pointerType: "mouse" });
    firstPad.axes[0] = -0.5;
    snapshots.push(recorder.update(dt));

    emit(target, "pointermove", { clientX: 65, clientY: 12 });
    recorder.release("KeyD");
    firstPad.buttons[0]!.pressed = false;
    firstPad.axes[1] = 0.7;
    pads = [firstPad, secondPad];
    snapshots.push(recorder.update(dt));

    emit(target, "pointerup", { clientX: 70, clientY: 15, button: 0, pointerType: "mouse" });
    pads = [null];
    snapshots.push(recorder.update(dt));

    pads = [disconnected, secondPad];
    snapshots.push(recorder.update(dt));
    secondPad.axes[0] = 0.25;
    snapshots.push(recorder.update(dt));

    expect(snapshots[0]!.pointer).toMatchObject({ dx: 20, dy: 8, active: false });
    expect(snapshots[0]!.actions.jump).toMatchObject({ pressed: true, held: true });
    expect(snapshots[2]!.actions.jump).toMatchObject({ released: true, held: false });
    expect(snapshots[2]!.gamepads).toHaveLength(2);
    expect(snapshots[2]!.axes!.pad1X).toBe(-0.8);
    expect(snapshots[3]!.gamepads).toEqual([]);
    expect(snapshots[4]!.gamepads).toHaveLength(1);
    expect(snapshots[4]!.gamepads[0]!.index).toBe(1);
    expect(snapshots[4]!.actions.guard).toMatchObject({ pressed: true, held: true });

    const events = recorder.recorded();
    const devices = recorder.recordedDeviceState()!;
    expect(devices.schemaVersion).toBe(version);
    expect(devices.frames.map((sample) => sample.frame)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(events.at(-1)!.frame).toBe(3);
    const plan = game.inputReplay(events, { fps: 60, seed: 42, deviceState: devices });
    expect(plan.frameCount).toBe(5);
    expect(plan.events).toEqual(events);
    const exported = game.exportReplay(plan);
    expect(exported.schemaVersion).toBe("aura-game-input-replay/v2");
    const imported = game.importReplay(JSON.stringify(exported));
    expect(imported).toEqual(plan);

    const callsAfterCapture = getGamepads.mock.calls.length;
    getGamepads.mockImplementation(() => { throw new Error("replay must not poll live hardware"); });
    const replay = input();
    const driver = game.inputReplayDriver(replay, imported);
    expect(driver.snapshot().complete).toBe(false);
    for (const expected of snapshots) expect(driver.step(dt)).toEqual(expected);
    expect(driver.snapshot()).toMatchObject({ frame: 5, complete: true, checksum: plan.checksum });
    expect(replay.recorded()).toEqual([]);
    expect(replay.recordedDeviceState()).toBeUndefined();

    for (const frame of [4, 0, 5, 2, 3, 1, 5]) {
      expect(driver.seek(frame, dt)).toEqual(snapshots[frame]);
    }
    const direct = input();
    expect(direct.replay(events, dt, devices)).toEqual(snapshots[5]);
    expect(direct.replay([], dt)).toMatchObject({
      pointer: { active: false, x: 0, y: 0, dx: 0, dy: 0, buttons: [] },
      gamepads: [],
      actions: { guard: { held: false, released: true } }
    });
    expect(getGamepads).toHaveBeenCalledTimes(callsAfterCapture);
    recorder.dispose();
    replay.dispose();
    direct.dispose();
  });

  it("keeps legacy events, checksums, v1 exports, and zero-delta batching unchanged", () => {
    const events = [
      { frame: 0, time: 0, type: "press", binding: "KeyD" },
      { frame: 1, time: dt, type: "release", binding: "KeyD" }
    ] as const;
    const plan = game.inputReplay(events);
    expect(plan.checksum).toBe("a6b1ab6c");
    expect(plan).not.toHaveProperty("deviceState");
    expect(game.exportReplay(plan).schemaVersion).toBe("aura-game-input-replay/v1");
    const eventAt = game.inputReplayEventsAt(plan, 0);
    (eventAt[0] as { binding: string }).binding = "changed";
    expect(plan.events[0]!.binding).toBe("KeyD");
    const legacy = input();
    expect(legacy.replay(events)).toMatchObject({
      frame: 1,
      time: 0,
      actions: { right: { pressed: true, held: false, released: false } },
      pointer: { dx: 0, dy: 0 },
      gamepads: []
    });
    expect(legacy.replay(events).actions.right.pressed).toBe(false);

    const first = deviceFrame(0, {
      pointer: { active: false, x: 10, y: 2, dx: 10, dy: 2, buttons: [] },
      gamepads: [{ connected: true, index: 0, axes: [0.4], buttons: ["GamepadA"] }]
    });
    const second = deviceFrame(1, {
      pointer: { active: true, x: 20, y: 4, dx: 10, dy: 2, buttons: [0] },
      gamepads: [{ connected: true, index: 1, axes: [-0.6], buttons: ["GamepadB"] }]
    });
    const batched = input();
    const snapshot = batched.replay(events, 0, recording([first, second]));
    expect(snapshot).toMatchObject({
      frame: 1,
      time: 0,
      pointer: second.pointer,
      gamepads: second.gamepads,
      actions: { right: { pressed: true, held: false }, guard: { pressed: true, held: true } }
    });
    const repeated = batched.replay(events, 0, recording([first, second]));
    expect(repeated.actions.right.pressed).toBe(false);
    expect(repeated.actions.guard.pressed).toBe(false);
    expect(repeated.pointer.dx).toBe(0);

    const cumulative = input();
    expect(cumulative.replay(events.slice(0, 1), 0, recording([first])).actions.right.pressed).toBe(true);
    expect(cumulative.replay(events.slice(0, 1), 0, recording([first])).actions.right.pressed).toBe(false);
    const extended = cumulative.replay(events, 0, recording([first, second]));
    expect(extended.actions.right).toMatchObject({ held: false, released: true });
    expect(extended.actions.guard).toMatchObject({ held: true, pressed: true });
    expect(extended.pointer).toEqual(second.pointer);
    const timed = input();
    expect(timed.replay(events.slice(0, 1), dt, recording([first]))).toMatchObject({
      frame: 1, actions: { right: { held: true, pressed: true } }
    });
    expect(timed.replay(events, dt, recording([first, second]))).toMatchObject({
      frame: 2, pointer: second.pointer,
      actions: { right: { held: false, released: true }, guard: { held: true, pressed: true } }
    });
    legacy.dispose();
    batched.dispose();
    cumulative.dispose();
    timed.dispose();
  });

  it("restarts a direct replay if a previously supplied mutable device prefix changes", () => {
    const mutable = structuredClone(recording([deviceFrame(0, {
      gamepads: [{ connected: true, index: 0, axes: [0.75], buttons: ["GamepadA"] }]
    })])) as unknown as MutableRecording;
    const replay = input();
    const initial = replay.replay([], dt, mutable as unknown as DeviceRecording);
    expect(initial).toMatchObject({ frame: 1, actions: { jump: { held: true, pressed: true } } });
    mutable.frames[0]!.gamepads[0]!.axes[0] = -0.75;
    mutable.frames[0]!.gamepads[0]!.buttons = [];
    const changed = replay.replay([], dt, mutable as unknown as DeviceRecording);
    expect(changed).toMatchObject({ frame: 1, actions: { jump: { held: false, pressed: false } } });
    expect(changed.gamepads[0]!.axes).toEqual([-0.75]);
    replay.dispose();
  });

  it("does not alias device inputs, returned recordings, plans, exports, snapshots, or active playback", () => {
    const target = new EventTarget();
    const hardware = pad(0, [0.75], [0]);
    vi.stubGlobal("navigator", { getGamepads: () => [hardware] });
    const recorder = input(target, true);
    (recorder.snapshot().pointer.buttons as number[]).push(15);
    emit(target, "pointerdown", { clientX: 12, clientY: 7, button: 0, pointerType: "mouse" });
    const snapshot = recorder.update(dt);
    expect(snapshot.pointer.buttons).toEqual([0]);
    const returned = recorder.recordedDeviceState()!;
    const original = structuredClone(returned);
    const bindings = recorder.recorded();
    (bindings[0] as { binding: string }).binding = "changed";
    expect(recorder.recorded()[0]!.binding).toBe("PointerPrimary");

    const plan = game.inputReplay(recorder.recorded(), { deviceState: returned });
    const exported = game.exportReplay(plan);
    const replay = input();
    const driver = game.inputReplayDriver(replay, plan);
    const checksum = plan.checksum;
    (returned.frames[0]!.pointer.buttons as number[]).push(8);
    (returned.frames[0]!.gamepads[0]!.axes as number[])[0] = -1;
    (returned.frames[0]!.gamepads[0]!.buttons as string[]).push("changed");
    hardware.axes[0] = -0.25;
    hardware.buttons[0]!.pressed = false;
    (snapshot.pointer.buttons as number[]).push(9);
    (snapshot.gamepads[0]!.axes as number[])[0] = 0;
    expect(recorder.recordedDeviceState()).toEqual(original);
    expect(plan.deviceState).toEqual(original);
    expect(exported.replay.deviceState).toEqual(original);

    (exported.replay.deviceState!.frames[0]!.pointer.buttons as number[]).push(10);
    expect(plan.deviceState).toEqual(original);
    (plan.events[0] as { binding: string }).binding = "changed";
    (plan.deviceState!.frames[0]!.gamepads[0]!.axes as number[])[0] = -0.9;
    (plan as { fps: number }).fps = 30;
    const played = driver.step();
    expect(played.time).toBe(dt);
    expect(played.actions.fire.held).toBe(true);
    expect(driver.snapshot().checksum).toBe(checksum);
    expect(played.pointer).toEqual(original.frames[0]!.pointer);
    expect(played.gamepads).toEqual(original.frames[0]!.gamepads);
    (played.pointer.buttons as number[]).push(11);
    (played.gamepads[0]!.buttons as string[]).length = 0;
    const held = driver.step();
    expect(held.pointer.buttons).toEqual([0]);
    expect(held.gamepads[0]!.buttons).toEqual(original.frames[0]!.gamepads[0]!.buttons);
    expect(held.actions.jump.held).toBe(true);
    expect(held.pointer.dx).toBe(0);
    expect(driver.snapshot().time).toBe(dt);

    const nextLive = recorder.update(dt);
    expect(nextLive.pointer.buttons).toEqual([0]);
    expect(nextLive.gamepads[0]!.axes).toEqual([-0.25]);
    recorder.dispose();
    replay.dispose();
  });

  it("schedules sparse samples with held pad state and one-frame pointer deltas", () => {
    const first = deviceFrame(0, {
      pointer: { active: false, x: 12, y: 0, dx: 12, dy: 0, buttons: [] },
      gamepads: [{ connected: true, index: 0, axes: [0.8], buttons: ["GamepadA"] }]
    });
    const last = deviceFrame(3, {
      pointer: { active: false, x: 36, y: 0, dx: 24, dy: 0, buttons: [] }
    });
    const plan = game.inputReplay([{ frame: 2, time: 2 * dt, type: "press", binding: "KeyD" }], {
      deviceState: recording([last, first])
    });
    expect(plan.deviceState!.frames.map((sample) => sample.frame)).toEqual([0, 3]);
    const stepped = input();
    const driver = game.inputReplayDriver(stepped, plan);
    const frames = [driver.step(dt), driver.step(dt), driver.step(dt), driver.step(dt)];
    expect(frames[0]!.pointer.dx).toBe(12);
    expect(frames[1]!.pointer.dx).toBe(0);
    expect(frames[2]!.actions.jump.held).toBe(true);
    expect(frames[2]!.actions.right.pressed).toBe(true);
    expect(frames[3]!.pointer.dx).toBe(24);
    expect(frames[3]!.actions.jump).toMatchObject({ held: false, released: true });
    expect(frames[3]!.gamepads).toEqual([]);

    const sought = input();
    const seeker = game.inputReplayDriver(sought, plan);
    expect(seeker.seek(2, dt)).toEqual(frames[2]);
    expect(seeker.step(dt)).toEqual(frames[3]);
    expect(seeker.seek(0, dt)).toEqual(frames[0]);
    stepped.dispose();
    sought.dispose();
  });

  it("seeks over a large unsampled gap without losing the final recorded sample", () => {
    const target = 2 ** 31 + 7;
    const plan = game.inputReplay([], {
      deviceState: recording([
        deviceFrame(0, { gamepads: [{ connected: true, index: 0, axes: [0.3], buttons: ["GamepadA"] }] }),
        deviceFrame(target, { pointer: { active: false, x: 6, y: 0, dx: 6, dy: 0, buttons: [] } })
      ])
    });
    const replay = input();
    const driver = game.inputReplayDriver(replay, plan);
    const result = driver.seek(target, dt);
    expect(result).toMatchObject({
      frame: target + 1,
      pointer: { x: 6, dx: 6 },
      gamepads: [],
      actions: { jump: { held: false, released: true } }
    });
    expect(driver.snapshot()).toMatchObject({ frame: target, complete: true });
    replay.dispose();
  });

  it("clears captured device frames without changing live input and isolates replay owners", () => {
    const target = new EventTarget();
    const hardware = pad(0, [0.5], [0]);
    const getGamepads = vi.fn(() => [hardware]);
    vi.stubGlobal("navigator", { getGamepads });
    const recorder = input(target, true);
    emit(target, "pointerdown", { clientX: 3, clientY: 5, button: 0, pointerType: "mouse" });
    const live = recorder.update(dt);
    const saved = recorder.recordedDeviceState()!;
    const replay = game.inputReplayDriver(recorder, game.inputReplay(recorder.recorded(), { deviceState: saved }));
    const other = game.inputReplayDriver(recorder, game.inputReplay([], {
      deviceState: recording([deviceFrame(0, {
        gamepads: [{ connected: true, index: 1, axes: [0], buttons: ["GamepadB"] }]
      })])
    }));
    expect(replay.step(dt).actions.jump.held).toBe(true);
    emit(target, "pointermove", { clientX: 13, clientY: 5 });
    expect(other.step(dt).actions.guard.held).toBe(true);
    expect(replay.step(dt).actions.jump.held).toBe(true);
    other.reset();
    expect(recorder.snapshot().actions.jump.held).toBe(true);
    replay.reset();
    expect(recorder.snapshot()).toEqual(live);
    recorder.clearReplay();
    expect(recorder.recorded()).toEqual([]);
    expect(recorder.recordedDeviceState()!.frames).toEqual([]);
    expect(recorder.snapshot()).toEqual(live);
    expect(recorder.update(dt).pointer).toMatchObject({ buttons: [0], dx: 10 });
    expect(recorder.recordedDeviceState()!.frames).toHaveLength(1);
    recorder.dispose();
    expect(recorder.recordedDeviceState()!.frames).toEqual([]);
    expect(recorder.snapshot()).toMatchObject({ gamepads: [], pointer: { active: false, buttons: [] } });
    const callsAfterDispose = getGamepads.mock.calls.length;
    expect(recorder.update(dt)).toBe(recorder.snapshot());
    expect(getGamepads).toHaveBeenCalledTimes(callsAfterDispose);
    expect(recorder.recordedDeviceState()!.frames).toEqual([]);
    expect(() => replay.step(dt)).toThrow(/disposed/i);
  });

  it("does not silently replay device samples into a foreign controller without the device-state contract", () => {
    const foreign = { replay: vi.fn() } as unknown as GameInputController;
    const plan = game.inputReplay([], { deviceState: recording([deviceFrame(0)]) });
    expect(() => game.inputReplayDriver(foreign, plan)).toThrow(/controller created by createGameInput/i);
    expect(foreign.replay).not.toHaveBeenCalled();
  });
});

type MutableRecording = {
  schemaVersion: string;
  frames: {
    frame: number;
    time: number;
    pointer: { active: boolean; x: number; y: number; dx: number; dy: number; buttons: number[] };
    gamepads: { connected: boolean; index: number; axes: number[]; buttons: string[] }[];
  }[];
};

describe("game input device replay validation", () => {
  const valid: DeviceRecording = recording([deviceFrame(0, {
    pointer: { active: true, x: 1, y: 2, dx: 3, dy: 4, buttons: [0] },
    gamepads: [{ connected: true, index: 0, axes: [0.5], buttons: ["GamepadA"] }]
  })]);
  const cases: [string, (data: MutableRecording) => void][] = [
    ["unknown version", (data) => { data.schemaVersion = "v99"; }],
    ["invalid frame", (data) => { data.frames[0]!.frame = 0.5; }],
    ["unsafe frame", (data) => { data.frames[0]!.frame = Number.MAX_SAFE_INTEGER; }],
    ["negative time", (data) => { data.frames[0]!.time = -1; }],
    ["non-finite pointer", (data) => { data.frames[0]!.pointer.dx = Number.NaN; }],
    ["negative pointer button", (data) => { data.frames[0]!.pointer.buttons[0] = -1; }],
    ["sparse pointer button", (data) => { data.frames[0]!.pointer.buttons = Array(1); }],
    ["non-finite gamepad axis", (data) => { data.frames[0]!.gamepads[0]!.axes[0] = Infinity; }],
    ["out-of-range gamepad axis", (data) => { data.frames[0]!.gamepads[0]!.axes[0] = 2; }],
    ["sparse gamepad axis", (data) => { data.frames[0]!.gamepads[0]!.axes = Array(1); }],
    ["missing gamepad button", (data) => { data.frames[0]!.gamepads[0]!.buttons[0] = ""; }],
    ["invalid gamepad index", (data) => { data.frames[0]!.gamepads[0]!.index = -1; }],
    ["disconnected gamepad", (data) => { data.frames[0]!.gamepads[0]!.connected = false; }],
    ["duplicate gamepad index", (data) => { data.frames[0]!.gamepads.push(structuredClone(data.frames[0]!.gamepads[0]!)); }],
    ["duplicate frame", (data) => { data.frames.push(structuredClone(data.frames[0]!)); }],
    ["sparse frame", (data) => { data.frames = Array(1); }],
    ["decreasing time", (data) => {
      data.frames[0]!.time = 2;
      data.frames.push({ ...structuredClone(data.frames[0]!), frame: 1, time: 1 });
    }]
  ];

  it.each(cases)("rejects %s", (_name, mutate) => {
    const invalid = structuredClone(valid) as unknown as MutableRecording;
    mutate(invalid);
    expect(() => game.inputReplay([], { deviceState: invalid as unknown as DeviceRecording })).toThrow(RangeError);
    const controller = input();
    const before = controller.snapshot();
    expect(() => controller.replay([], dt, invalid as unknown as DeviceRecording)).toThrow(RangeError);
    expect(controller.snapshot()).toBe(before);
    controller.dispose();
  });

  it("rejects unsupported capture versions and replay export version mismatches", () => {
    expect(() => game.input({
      actions: {},
      recordDeviceState: "unknown" as typeof version
    })).toThrow(RangeError);
    const plan = game.inputReplay([], { deviceState: valid });
    const envelope = game.exportReplay(plan);
    expect(() => game.importReplay({ ...envelope, schemaVersion: "aura-game-input-replay/v1" })).toThrow(/unsupported/i);
    const noDevices = game.exportReplay(game.inputReplay([]));
    expect(() => game.importReplay({ ...noDevices, schemaVersion: "aura-game-input-replay/v2" })).toThrow(/unsupported/i);
    expect(game.inputReplay([], { deviceState: valid }).checksum).not.toBe(game.inputReplay([]).checksum);
    const changed = structuredClone(valid) as unknown as MutableRecording;
    changed.frames[0]!.gamepads[0]!.axes[0] = -0.5;
    expect(game.inputReplay([], { deviceState: changed as unknown as DeviceRecording }).checksum)
      .not.toBe(game.inputReplay([], { deviceState: valid }).checksum);
  });
});
