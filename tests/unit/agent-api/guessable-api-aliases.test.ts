import { describe, expect, it } from "vitest";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { ignoredOptionMessages, editDistance, suggestOption } from "../../../packages/engine/src/agent-api/nodes/optionDiagnostics";

/**
 * E3-06 guessable API. Every alias must produce the same node JSON as the canonical spelling; every unknown option
 * must be reported once with a "did you mean" suggestion (warn-only: the node still builds).
 */
const json = (builder: { toJSON(): unknown }) => JSON.parse(JSON.stringify(builder.toJSON())) as Record<string, unknown>;
const notes = (builder: { toJSON(): unknown }) => (json(builder).ignoredOptions ?? []) as string[];

describe("aliases compile to the canonical node", () => {
  it(".rotation(x, y, z) equals .rotate(x, y, z), including the vector and order forms", () => {
    const base = () => primitives.box({ name: "b" });
    expect(json(base().rotation(1, 2, 3))).toEqual(json(base().rotate(1, 2, 3)));
    expect(json(base().rotation([1, 2, 3], "YXZ"))).toEqual(json(base().rotate([1, 2, 3], "YXZ")));
    expect(json(base().rotation(1, 2, 3, "ZYX"))).toEqual(json(base().rotate(1, 2, 3, "ZYX")));
  });

  it("primitives.plane({ size: [w, d] }) equals size: [w, 1, d]; other forms are untouched", () => {
    expect(json(primitives.plane({ name: "g", size: [10, 6] }))).toEqual(json(primitives.plane({ name: "g", size: [10, 1, 6] })));
    expect(json(primitives.plane({ name: "g", size: 4 }))).toEqual(json(primitives.plane({ name: "g", size: 4 })));
    expect(json(primitives.plane({ name: "g", size: [10, 6] }))).toMatchObject({ size: [10, 1, 6] });
  });

  it("lights castShadow: true equals shadow: true; an explicit shadow wins; castShadow: false is the default", () => {
    for (const kind of ["directional", "point", "spot"] as const) {
      const make = lights[kind] as (o: Record<string, unknown>) => { toJSON(): unknown };
      expect(json(make({ name: "l", castShadow: true }))).toEqual(json(make({ name: "l", shadow: true })));
      expect(json(make({ name: "l", castShadow: false }))).toEqual(json(make({ name: "l" })));
      expect(json(make({ name: "l", castShadow: true, shadow: { mapSize: 2048 } }))).toEqual(json(make({ name: "l", shadow: { mapSize: 2048 } })));
    }
  });

  it("lights.hemisphere({ color }) equals skyColor; skyColor wins when both are given", () => {
    expect(json(lights.hemisphere({ color: "#abcdef", groundColor: "#111111" }))).toEqual(json(lights.hemisphere({ skyColor: "#abcdef", groundColor: "#111111" })));
    expect(json(lights.hemisphere({ color: "#000000", skyColor: "#abcdef" }))).toEqual(json(lights.hemisphere({ skyColor: "#abcdef" })));
  });

  it("material.pbr and material.metal map side: double to doubleSided: true", () => {
    expect(material.metal({ side: "double" })).toEqual(material.metal({ doubleSided: true }));
    expect(material.pbr({ color: "#fff", side: "double" })).toEqual(material.pbr({ color: "#fff", doubleSided: true }));
    expect(material.pbr({ color: "#fff", side: "front" })).toEqual(material.pbr({ color: "#fff" }));
    expect(material.pbr({ side: "double", doubleSided: false })).toEqual(material.pbr({ doubleSided: false }));
  });

  it("existing three.js spellings still equal their canonical option (metalness, emissiveIntensity, envMapIntensity)", () => {
    expect(JSON.parse(JSON.stringify(material.pbr({ metalness: 0.7 })))).toEqual(JSON.parse(JSON.stringify(material.pbr({ metallic: 0.7 }))));
  });
});

describe("unknown options are reported with a suggestion", () => {
  it("light builders name the builder, list valid keys and suggest the nearest spelling", () => {
    const note = notes(lights.directional({ name: "sun", intensty: 2 } as never));
    expect(note).toHaveLength(1);
    expect(note[0]).toMatch(/^OPTION_IGNORED lights\.directional: option "intensty" is not read/);
    expect(note[0]).toContain('Did you mean "intensty" -> "intensity"?');
    expect(notes(lights.point({ decayy: 2 } as never))[0]).toContain('"decayy" -> "decay"');
    expect(notes(lights.spot({ angel: 1 } as never))[0]).toContain('"angel" -> "angle"');
    expect(notes(lights.ambient({ colour: "#fff" } as never))[0]).toContain('"colour"');
    expect(notes(lights.hemisphere({ groundColour: "#000" } as never))[0]).toContain('"groundColour" -> "groundColor"');
  });

  it("three.js names with no Aura3D spelling carry a note but no wrong suggestion", () => {
    const note = notes(lights.directional({ shadowMapSize: 2048 } as never));
    expect(note[0]).toMatch(/OPTION_IGNORED lights\.directional: option "shadowMapSize"/);
    expect(note[0]).not.toContain("Did you mean");
  });

  it("valid light options and the aliases produce no note and leave the node JSON free of ignoredOptions", () => {
    expect(notes(lights.directional({ name: "s", position: [1, 2, 3], intensity: 2, color: "#fff", castShadow: true }))).toEqual([]);
    expect(Object.keys(json(lights.directional({})))).not.toContain("ignoredOptions");
    expect(notes(lights.spot({ angle: 1, penumbra: 0.2, distance: 5, decay: 2, power: 3 }))).toEqual([]);
  });

  it("primitives suggest the Aura3D spelling for a three.js name (existing guard, new suggestion)", () => {
    const note = notes(primitives.box({ castshadow: false, recieveShadow: true } as never));
    expect(note[0]).toContain('"recieveShadow" -> "receiveShadow"');
    const wire = notes(primitives.box({ material: material.pbr({ wireframe: true, flatShading: true } as never) }));
    expect(wire.join("\n")).toContain('option "wireframe"');
    expect(wire.join("\n")).toContain("geometry.wireframe");
    expect(wire.join("\n")).toContain('option "flatShading"');
  });

  it("material transparent is stripped from the spec and reported with what to use", () => {
    const glass = material.pbr({ color: "#cfe6ee", opacity: 0.14, transparent: true } as never);
    expect(glass).toEqual(material.pbr({ color: "#cfe6ee", opacity: 0.14 }));
    expect(notes(primitives.box({ material: glass })).join("\n")).toMatch(/option "transparent".*opacity < 1/);
  });

  it("material side: back is reported, not silently dropped", () => {
    const messages = notes(primitives.box({ material: material.pbr({ side: "back" }) }));
    expect(messages.join("\n")).toMatch(/option "side" value "back" has no effect/);
  });

  it("the scene compiler collects light notes through ignoredOptionMessages (warn once per node)", () => {
    const node = lights.point({ powr: 5 } as never).toJSON() as never;
    const collected = ignoredOptionMessages([node]);
    expect(collected).toHaveLength(1);
    expect(collected[0]!.message).toContain('"powr" -> "power"');
  });

  it("editDistance and suggestOption behave on short names", () => {
    expect(editDistance("intensty", "intensity")).toBe(1);
    expect(suggestOption("metalness", ["metallic", "roughness"])).toBe("metallic");
    expect(suggestOption("castShadow", ["name", "shadow"])).toBe("shadow");
    expect(suggestOption("zzzz", ["name", "shadow"])).toBeUndefined();
  });
});
