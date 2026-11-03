import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Member = {
  kind: "field" | "method" | "get" | "set";
  name: string;
  static: boolean;
  readonly?: boolean;
  optional?: boolean;
  type?: string;
  signature?: string;
};
type ApiClass = {
  name: string;
  constructors: { signature: string; implicit: boolean }[];
  members: Member[];
};
type Unit = {
  name: string;
  role: "surface" | "structural-support";
  bindings: { local: string; target: string }[];
  types: { name: string; kind: "interface" | "alias"; exported: boolean; declaration: string }[];
  classes: ApiClass[];
  functions: { name: string; signature: string }[];
  values: { name: string; type: string; runtimeValue: "unresolved" }[];
};
type Contract = {
  schemaVersion: number;
  kind: string;
  status: string;
  limits: string[];
  groups: { mutable: Unit[]; native: Unit[] };
};

const contractPath = resolve("docs/prds/aura3d-independent-math-api.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as Contract;

// These inventories are deliberately fixed. They are not read from the old
// implementation, so replacement work can proceed without inspecting it.
const methods: Record<string, string> = {
  Box3: "fromImmutable toImmutable set setFromArray setFromBufferAttribute setFromPoints setFromCenterAndSize setFromObject clone copy makeEmpty isEmpty getCenter getSize expandByPoint expandByVector expandByScalar expandByObject containsPoint containsBox getParameter intersectsBox intersectsSphere intersectsPlane intersectsTriangle clampPoint distanceToPoint getBoundingSphere intersect union applyMatrix4 translate equals toJSON fromJSON",
  Color: "fromImmutable toImmutable set setScalar setHex setRGB setHSL setStyle setColorName clone copy copySRGBToLinear copyLinearToSRGB convertSRGBToLinear convertLinearToSRGB getHex getHexString getHSL getRGB getStyle offsetHSL add addColors addScalar sub multiply multiplyScalar lerp lerpColors lerpHSL setFromVector3 applyMatrix3 equals fromArray toArray fromBufferAttribute toJSON [Symbol.iterator]",
  Euler: "fromImmutable toImmutable set clone copy setFromRotationMatrix setFromQuaternion setFromVector3 reorder equals fromArray toArray _onChange _onChangeCallback [Symbol.iterator]",
  Frustum: "fromImmutable toImmutable set copy setFromProjectionMatrix intersectsObject intersectsSprite intersectsSphere intersectsBox containsPoint clone",
  Matrix3: "fromImmutable toImmutable set identity copy extractBasis setFromMatrix4 multiply premultiply multiplyMatrices multiplyScalar determinant invert transpose getNormalMatrix transposeIntoArray setUvTransform scale rotate translate makeTranslation makeRotation makeScale equals fromArray toArray clone",
  Matrix4: "fromImmutable toImmutable set identity clone copy copyPosition setFromMatrix3 extractBasis makeBasis extractRotation makeRotationFromEuler makeRotationFromQuaternion lookAt multiply premultiply multiplyMatrices multiplyScalar determinant determinantAffine transpose setPosition invert scale getMaxScaleOnAxis makeTranslation makeRotationX makeRotationY makeRotationZ makeRotationAxis makeScale makeShear compose decompose makePerspective makeOrthographic equals fromArray toArray",
  Plane: "fromImmutable toImmutable set setComponents setFromNormalAndCoplanarPoint setFromCoplanarPoints copy normalize negate distanceToPoint distanceToSphere projectPoint intersectLine intersectsLine intersectsBox intersectsSphere coplanarPoint applyMatrix4 translate equals clone",
  Quaternion: "fromImmutable toImmutable set clone copy setFromEuler setFromAxisAngle setFromRotationMatrix setFromUnitVectors angleTo rotateTowards identity invert conjugate dot lengthSq length normalize multiply premultiply multiplyQuaternions slerp slerpQuaternions random equals fromArray toArray fromBufferAttribute toJSON _onChange _onChangeCallback [Symbol.iterator]",
  Ray: "fromImmutable toImmutable set copy at lookAt recast closestPointToPoint distanceToPoint distanceSqToPoint distanceSqToSegment intersectSphere intersectsSphere distanceToPlane intersectPlane intersectsPlane intersectBox intersectsBox intersectTriangle applyMatrix4 equals clone",
  Sphere: "fromImmutable toImmutable set setFromPoints copy isEmpty makeEmpty containsPoint distanceToPoint intersectsSphere intersectsBox intersectsPlane clampPoint getBoundingBox applyMatrix4 translate expandByPoint union equals clone toJSON fromJSON",
  Triangle: "fromImmutable set setFromPointsAndIndices setFromAttributeAndIndices clone copy getArea getMidpoint getNormal getPlane getBarycoord getInterpolation containsPoint isFrontFacing intersectsBox closestPointToPoint equals",
  Vector2: "fromImmutable toImmutable set setScalar setX setY setComponent getComponent clone copy add addScalar addVectors addScaledVector sub subScalar subVectors multiply multiplyScalar divide divideScalar applyMatrix3 min max clamp clampScalar clampLength floor ceil round roundToZero negate dot cross lengthSq length manhattanLength normalize angle angleTo distanceTo distanceToSquared manhattanDistanceTo setLength lerp lerpVectors equals fromArray toArray fromBufferAttribute rotateAround random [Symbol.iterator]",
  Vector3: "fromImmutable toImmutable set setScalar setX setY setZ setComponent getComponent clone copy add addScalar addVectors addScaledVector sub subScalar subVectors multiply multiplyScalar multiplyVectors applyEuler applyAxisAngle applyMatrix3 applyNormalMatrix applyMatrix4 applyQuaternion project unproject transformDirection divide divideScalar min max clamp clampScalar clampLength floor ceil round roundToZero negate dot lengthSq length manhattanLength normalize setLength lerp lerpVectors cross crossVectors projectOnVector projectOnPlane reflect angleTo distanceTo distanceToSquared manhattanDistanceTo setFromSpherical setFromSphericalCoords setFromCylindrical setFromCylindricalCoords setFromMatrixPosition setFromMatrixScale setFromMatrixColumn setFromMatrix3Column setFromEuler setFromColor equals fromArray toArray fromBufferAttribute random randomDirection [Symbol.iterator]",
  Vector4: "fromImmutable toImmutable set setScalar setX setY setZ setW setComponent getComponent clone copy add addScalar addVectors addScaledVector sub subScalar subVectors multiply multiplyScalar applyMatrix4 divide divideScalar setAxisAngleFromQuaternion setAxisAngleFromRotationMatrix setFromMatrixPosition min max clamp clampScalar clampLength floor ceil round roundToZero negate dot lengthSq length manhattanLength normalize setLength lerp lerpVectors equals fromArray toArray fromBufferAttribute random [Symbol.iterator]"
};
const fields: Record<string, string> = {
  Box3: "isBox3 min max", Color: "isColor r g b", Euler: "isEuler _x _y _z _order", Frustum: "planes",
  Matrix3: "isMatrix3 elements", Matrix4: "isMatrix4 elements", Plane: "isPlane normal constant",
  Quaternion: "isQuaternion _x _y _z _w", Ray: "origin direction", Sphere: "isSphere center radius",
  Triangle: "a b c", Vector2: "isVector2 x y", Vector3: "isVector3 x y z", Vector4: "isVector4 x y z w"
};
const staticMethods: Record<string, string> = {
  Quaternion: "slerpFlat multiplyQuaternionsFlat",
  Triangle: "getNormal getBarycoord containsPoint getInterpolation getInterpolatedAttribute isFrontFacing"
};
const staticFields: Record<string, string> = { Color: "NAMES", Euler: "DEFAULT_ORDER" };
const accessors: Record<string, string> = {
  Euler: "x y z order", Quaternion: "x y z w", Vector2: "width height", Vector4: "width height"
};
const nativeInventory: Record<string, { fields: string; methods: string; staticMethods?: string }> = {
  ConvexHull: { fields: "tolerance faces newFaces assigned unassigned vertices", methods: "setFromPoints containsPoint intersectRay intersectsRay makeEmpty compute", staticMethods: "fromPoints" },
  ConvexHullFace: { fields: "normal midpoint area constant outside mark edge", methods: "getEdge compute distanceToPoint", staticMethods: "create" },
  HalfEdge: { fields: "vertex face prev next twin", methods: "head tail length lengthSquared setTwin" },
  VertexNode: { fields: "point prev next face", methods: "" },
  VertexList: { fields: "head tail", methods: "first last clear insertBefore insertAfter append appendChain remove removeSubList isEmpty" },
  OBB: { fields: "center halfSize rotation", methods: "set clone copy getSize clampPoint containsPoint intersectsBox3 intersectsSphere intersectsOBB intersectsPlane intersectRay intersectsRay equals applyMatrix4", staticMethods: "fromBox3" }
};
const privateTypeClosure: Record<string, string> = {
  "mutable.Color": "ColorSpaceDefinition", "mutable.Euler": "ElementsLike",
  "mutable.Frustum": "MeshLike SpriteLike", "mutable.Matrix3": "ElementsLike Vec2Like Vec3ColumnTarget",
  "mutable.Matrix4": "ElementsLike Vec3Like Vec3Target QuaternionTarget", "mutable.Quaternion": "Vec3Like ElementsLike",
  "mutable.Ray": "SphereLike PlaneLike", "mutable.Sphere": "PlaneLike", "mutable.Triangle": "InterpolationTarget",
  "mutable.Vector2": "Matrix3Like", "mutable.Vector3": "ElementsLike", "mutable.Vector4": "ElementsLike",
  "native.Matrix3": "Matrix3Elements"
};
const signatureDigests: Record<string, string> = {
  "mutable.Box3": "2d1d770feb90eb6a56a21b4afcf44151996b397bde2fcf49834a83c9279b6697",
  "mutable.Color": "1d9dcaa2f9b5f0171804a57f179386b2465578713f54337d71426ea7ee2a18c3",
  "mutable.Euler": "3101c4c15df873dc2a08018cf721c6b2f783c4ab201b8859bd31f444a6c71ef4",
  "mutable.Frustum": "e325383310883031b75a694beb6996242facf2b7638c4f8d048dd901ca1d4c7e",
  "mutable.Matrix3": "6a2e5601bd97fc11abd7d5bf72f081f9484ca10acbffdc944850393f08712cd9",
  "mutable.Matrix4": "f192c3b842f21befb91d520a35538cff34af5aa419ba8221b1f1c85f8fcdc56f",
  "mutable.Plane": "992809d0a552113e95f6aba83625b1704ab7499dcccbc2879c47f2ba55f105d9",
  "mutable.Quaternion": "97c1e24c35e94cf1bf0e80568931246bfeb0031291f89445e37a5975079152b6",
  "mutable.Ray": "09181762c69366a4427f7b1a8bf12cc2ebd93f0fb58440e52ac8766208265bde",
  "mutable.Sphere": "c4fb98ca86a7cab2efdf7e9d8ce0203aff714787685e6618c4437dc9960e40d2",
  "mutable.Triangle": "821d709e8dadace738dc9bbc2cebdeeeb37837daa023510366763568bcb96488",
  "mutable.Vector2": "f9f01c390cd26e103bd5f7a080e067c0f39cca00495de9eb5fa7622a53eabacc",
  "mutable.Vector3": "e83a185df895982ef25ee2c4e23749de964438df00a16f570f36757b219f9b19",
  "mutable.Vector4": "e7bfb8f121e4f83f3943393c0f0db284b61f053048d7195b6d849c6098dd329d",
  "native.ConvexHull": "dc7da2bbeeb3ae7657af460a0e05e3ef073857afee96d198552346d807901c01",
  "native.ConvexHullFace": "5f4da091eaee4b02b9c3753dc5f2ab3f42b8f882aa82fa7706b8c11fa96b703d",
  "native.HalfEdge": "1185880c20c4de6b1a444e5e09c0b7bca629b8e8e0d8f75fdce7ae925c2a0f9d",
  "native.VertexNode": "1885458dbaf75697fd112602f047aa0ba42c6fb4288bba9b32a7b2f58009f839",
  "native.VertexList": "12932787f405e1a82d5a3efe4adbe3a33b74a9d1c6de31555e6aab963709315e",
  "native.OBB": "6e13d6cfdf7db239a0d3eda9138a341a4bd46fdcb72907d90e38a720da6ca276"
};

const words = (text = "") => text ? text.split(/\s+/) : [];
const sorted = (items: string[]) => [...items].sort();
const memberNames = (value: ApiClass, kind: Member["kind"], isStatic = false) =>
  value.members.filter((member) => member.kind === kind && member.static === isStatic).map((member) => member.name);
const allClasses = (units: Unit[]) => units.filter((unit) => unit.role === "surface").flatMap((unit) => unit.classes);

function hasComments(text: string): boolean {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) return true;
  }
  return false;
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

function isDeclarationOnly(text: string, mode: "signature" | "type" | "declaration"): boolean {
  if (hasComments(text)) return false;
  const source = mode === "signature" ? `declare function contract${text};` : mode === "type" ? `type Contract = ${text};` : text;
  const file = ts.createSourceFile("contract.d.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const parsed = file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] };
  if (parsed.parseDiagnostics.length || file.statements.length !== 1) return false;
  const statement = file.statements[0]!;
  if (mode === "signature" && !ts.isFunctionDeclaration(statement)) return false;
  if (mode === "type" && !ts.isTypeAliasDeclaration(statement)) return false;
  if (mode === "declaration" && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) return false;
  let safe = true;
  const visit = (node: ts.Node) => {
    if (ts.isBlock(node) || ts.isArrowFunction(node) || ts.isObjectLiteralExpression(node) ||
        (ts.isFunctionDeclaration(node) && !!node.body) ||
        (ts.isParameter(node) && !!node.initializer) ||
        (ts.isPropertyDeclaration(node) && !!node.initializer)) safe = false;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return safe;
}

function hasLiteralType(text: string): boolean {
  const file = ts.createSourceFile("value.d.ts", `type Contract = ${text};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isLiteralTypeNode(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("independent math declaration contract", () => {
  it("defines a neutral, unresolved schema without duplicate symbols", () => {
    expect(Object.keys(contract).sort()).toEqual(["groups", "kind", "limits", "schemaVersion", "status"]);
    expect(contract.schemaVersion).toBe(1);
    expect(contract.kind).toBe("declaration-only");
    expect(contract.status).toBe("behavior-unresolved");
    expect(contract.limits.join(" ")).toMatch(/defaults.*exceptions.*mutation/i);
    // Freeze helper declarations and top-level signatures as well as class members.
    expect(createHash("sha256").update(JSON.stringify(contract)).digest("hex")).toBe("c556e34101171b277c9b694e26be567d039955cd9b1dcf7e3cd699f9e25ff94a");
    expect(Object.keys(contract.groups).sort()).toEqual(["mutable", "native"]);
    const serialized = JSON.stringify(contract);
    expect(serialized).not.toMatch(/three(?:\.js)?|babylon|playcanvas|https?:\/\/|\/Users\//i);
    expect(serialized).not.toMatch(/"(?:body|initializer|comment|sourcePath)"\s*:/);
    expect(stringValues(contract).some(hasComments)).toBe(false);
    for (const units of Object.values(contract.groups)) {
      expect(new Set(units.map((unit) => unit.name)).size).toBe(units.length);
      for (const unit of units) {
        expect(Object.keys(unit).sort()).toEqual(["bindings", "classes", "functions", "name", "role", "types", "values"]);
        expect(["surface", "structural-support"]).toContain(unit.role);
        expect(new Set(unit.bindings.map((binding) => binding.local)).size).toBe(unit.bindings.length);
        expect(new Set(unit.types.map((type) => type.name)).size).toBe(unit.types.length);
        expect(new Set(unit.classes.map((value) => value.name)).size).toBe(unit.classes.length);
        expect(new Set(unit.functions.map((fn) => fn.name)).size).toBe(unit.functions.length);
        expect(new Set(unit.values.map((value) => value.name)).size).toBe(unit.values.length);
        for (const binding of unit.bindings) expect(Object.keys(binding).sort()).toEqual(["local", "target"]);
        for (const type of unit.types) {
          expect(Object.keys(type).sort()).toEqual(["declaration", "exported", "kind", "name"]);
          expect(["interface", "alias"]).toContain(type.kind);
          expect(typeof type.exported).toBe("boolean");
        }
        for (const fn of unit.functions) expect(Object.keys(fn).sort()).toEqual(["name", "signature"]);
        for (const value of unit.classes) {
          expect(Object.keys(value).sort()).toEqual(["constructors", "members", "name"]);
          expect(value.constructors.length).toBeGreaterThan(0);
          expect(new Set(value.constructors.map((ctor) => ctor.signature)).size).toBe(value.constructors.length);
          for (const ctor of value.constructors) {
            expect(Object.keys(ctor).sort()).toEqual(["implicit", "signature"]);
            expect(typeof ctor.implicit).toBe("boolean");
          }
          const keys = value.members.map((member) => `${member.kind}:${member.static}:${member.name}:${member.signature ?? ""}`);
          expect(new Set(keys).size).toBe(keys.length);
          for (const member of value.members) {
            expect(["field", "method", "get", "set"]).toContain(member.kind);
            expect(typeof member.static).toBe("boolean");
            if (member.kind === "field") {
              expect(Object.keys(member).sort()).toEqual(["kind", "name", "optional", "readonly", "static", "type"]);
              expect(typeof member.optional).toBe("boolean");
              expect(typeof member.readonly).toBe("boolean");
            } else {
              expect(Object.keys(member).sort()).toEqual(["kind", "name", "signature", "static"]);
            }
          }
        }
        for (const value of unit.values) {
          expect(Object.keys(value).sort()).toEqual(["name", "runtimeValue", "type"]);
          expect(value.runtimeValue).toBe("unresolved");
          expect(hasLiteralType(value.type), `${unit.name}.${value.name}`).toBe(false);
        }
      }
    }
  });

  it("freezes the complete public class and member inventories", () => {
    const mutable = allClasses(contract.groups.mutable);
    expect(sorted(mutable.map((value) => value.name))).toEqual(sorted(Object.keys(methods)));
    for (const value of mutable) {
      expect(sorted(memberNames(value, "method"))).toEqual(sorted(words(methods[value.name])));
      expect(sorted(memberNames(value, "method", true))).toEqual(sorted(words(staticMethods[value.name])));
      expect(sorted(memberNames(value, "field"))).toEqual(sorted(words(fields[value.name])));
      expect(sorted(memberNames(value, "field", true))).toEqual(sorted(words(staticFields[value.name])));
      expect(sorted(memberNames(value, "get"))).toEqual(sorted(words(accessors[value.name])));
      expect(sorted(memberNames(value, "set"))).toEqual(sorted(words(accessors[value.name])));
    }
    const native = allClasses(contract.groups.native);
    expect(sorted(native.map((value) => value.name))).toEqual(sorted(Object.keys(nativeInventory)));
    for (const value of native) {
      const expected = nativeInventory[value.name]!;
      expect(sorted(memberNames(value, "field"))).toEqual(sorted(words(expected.fields)));
      expect(sorted(memberNames(value, "method"))).toEqual(sorted(words(expected.methods)));
      expect(sorted(memberNames(value, "method", true))).toEqual(sorted(words(expected.staticMethods)));
      expect(memberNames(value, "get")).toEqual([]);
      expect(memberNames(value, "set")).toEqual([]);
    }
    for (const [group, classes] of [["mutable", mutable], ["native", native]] as const) {
      for (const value of classes) {
        const digest = createHash("sha256").update(JSON.stringify({ constructors: value.constructors, members: value.members })).digest("hex");
        expect(digest, `${group}.${value.name}`).toBe(signatureDigests[`${group}.${value.name}`]);
      }
    }
  });

  it("includes the exported type, function and value surfaces and their type bindings", () => {
    const mutable = contract.groups.mutable;
    const exportedTypes = mutable.flatMap((unit) => unit.types.filter((type) => type.exported).map((type) => type.name));
    expect(sorted(exportedTypes)).toEqual(sorted(words("Vector2Like BufferAttributeLike2 Vector3Like BufferAttributeLike3 ProjectionCameraLike Vector4Like BufferAttributeLikeW QuaternionLike EulerLike EulerOrder BufferAttributeLike4 ColorLike HSL RGB Box3Like Box3ObjectLike TriangleLike PositionAttributeLike SphereLike PlaneLike Line3Like RayLike FrustumLike TriangleCornersLike")));
    expect(sorted(mutable.flatMap((unit) => unit.functions.map((fn) => fn.name)))).toEqual(["LinearToSRGB", "SRGBToLinear"]);
    expect(sorted(mutable.flatMap((unit) => unit.values.map((value) => value.name)))).toEqual(sorted(words("WebGLCoordinateSystem WebGPUCoordinateSystem ColorManagement COLOR_KEYWORDS NoColorSpace SRGBColorSpace LinearSRGBColorSpace LinearTransfer SRGBTransfer")));
    const shape = contract.groups.native.find((unit) => unit.name === "ShapeUtils")!;
    expect(sorted(shape.functions.map((fn) => fn.name))).toEqual(sorted(words("earcut shapeArea isClockWise triangulateShape")));
    expect(shape.values.map((value) => value.name)).toEqual(["ShapeUtils"]);
    expect(shape.types).toEqual([]);
    for (const [groupName, units] of Object.entries(contract.groups)) for (const unit of units) {
      const helpers = unit.types.filter((type) => !type.exported).map((type) => type.name);
      expect(sorted(helpers), `${groupName}.${unit.name}`).toEqual(sorted(words(privateTypeClosure[`${groupName}.${unit.name}`])));
      for (const binding of unit.bindings) {
        const [group, unitName, symbol] = binding.target.split(".");
        const target = contract.groups[group as keyof Contract["groups"]]?.find((item) => item.name === unitName);
        expect(target, binding.target).toBeDefined();
        expect([...target!.types, ...target!.classes, ...target!.functions, ...target!.values].some((item) => item.name === symbol), binding.target).toBe(true);
      }
    }
  });

  it("accepts only declarations and rejects comments, initializers, and executable bodies", () => {
    expect(isDeclarationOnly("(x: number): number", "signature")).toBe(true);
    expect(isDeclarationOnly("{ run(x: number): void; }", "type")).toBe(true);
    expect(isDeclarationOnly("(x: number): number { return x; }", "signature")).toBe(false);
    expect(isDeclarationOnly("(x: number /* comment */): number", "signature")).toBe(false);
    expect(isDeclarationOnly("(x = 2): number", "signature")).toBe(false);
    expect(isDeclarationOnly("interface X { x: number }; const x = 1", "declaration")).toBe(false);
    expect(hasLiteralType("1 | 2")).toBe(true);
    expect(hasLiteralType("{ label: 'example' }")).toBe(true);
    for (const units of Object.values(contract.groups)) for (const unit of units) {
      for (const type of unit.types) expect(isDeclarationOnly(type.declaration, "declaration"), `${unit.name}.${type.name}`).toBe(true);
      for (const fn of unit.functions) expect(isDeclarationOnly(fn.signature, "signature"), `${unit.name}.${fn.name}`).toBe(true);
      for (const value of unit.values) expect(isDeclarationOnly(value.type, "type"), `${unit.name}.${value.name}`).toBe(true);
      for (const value of unit.classes) {
        for (const ctor of value.constructors) expect(isDeclarationOnly(ctor.signature, "signature"), value.name).toBe(true);
        for (const member of value.members) {
          const declaration = member.kind === "field" ? member.type : member.signature;
          expect(declaration, `${value.name}.${member.name}`).toBeTruthy();
          expect(isDeclarationOnly(declaration!, member.kind === "field" ? "type" : "signature"), `${value.name}.${member.name}`).toBe(true);
        }
      }
    }
  });
});
