import { describe, expect, it } from "vitest";
import {
  createRoomEnvironmentScene,
  ROOM_ENVIRONMENT_PANEL_RADIANCES,
  ROOM_ENVIRONMENT_SCENE_OFFSET_Y,
  sampleRoomEnvironment
} from "../../../../packages/rendering/src/environment/RoomEnvironmentScene";

describe("independently authored neutral studio", () => {
  const scene = createRoomEnvironmentScene();

  it("defines a finite room, five colored-neutral emitters and a bounded point source", () => {
    expect(ROOM_ENVIRONMENT_SCENE_OFFSET_Y).toBe(0);
    expect(scene.room.position).toEqual([0, 1, 0]);
    expect(scene.room.scale).toEqual([24, 20, 24]);
    expect(scene.room.albedo).toEqual([0.8, 0.8, 0.8]);
    expect(scene.boxes).toHaveLength(2);
    expect(scene.panels).toHaveLength(5);
    expect(ROOM_ENVIRONMENT_PANEL_RADIANCES).toEqual([64, 32, 24, 16, 48]);
    expect(scene.panels.map((panel) => panel.emissive)).toEqual([
      [64, 64, 64], [32, 32, 32], [24, 24, 24], [16, 16, 16], [48, 48, 48]
    ]);
    expect(scene.light).toMatchObject({ position: [0, 7, 0], intensity: 240, distance: 40, decay: 2, color: [1, 1, 1] });
  });

  it("samples nearest luminous panels at the authored radiance, independent of ray length", () => {
    for (const [direction, expected] of [
      [[0, 1, 0], 64],
      [[-11.8, 3, 0], 32],
      [[11.8, 5, -3], 24],
      [[0, 2, -11.8], 16],
      [[4, 5, 11.8], 48]
    ] as const) {
      const scaled = direction.map((part) => part * 7) as [number, number, number];
      expect(sampleRoomEnvironment(direction)).toEqual([expected, expected, expected]);
      expect(sampleRoomEnvironment(scaled)).toEqual([expected, expected, expected]);
    }
  });

  it("uses Lambertian floor reflectance, inverse-square falloff and the declared range window", () => {
    // Downward ray meets the floor at y=-9; the light at y=7 is 16 metres away.
    const expected = (0.8 / Math.PI) * 240 * (1 - 16 / 40) ** 2 / 16 ** 2;
    for (const actual of sampleRoomEnvironment([0, -1, 0])) expect(actual).toBeCloseTo(expected, 10);
  });

  it("returns finite nonnegative radiance for other directions and zero for invalid rays", () => {
    for (const direction of [[1, 0, 0], [0, 0, 1], [0.2, -1, 0.3], [-0.3, 0.2, -1]] as const) {
      for (const channel of sampleRoomEnvironment(direction)) {
        expect(Number.isFinite(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
      }
    }
    expect(sampleRoomEnvironment([0, 0, 0])).toEqual([0, 0, 0]);
    expect(sampleRoomEnvironment([NaN, 0, 1])).toEqual([0, 0, 0]);
  });
});
