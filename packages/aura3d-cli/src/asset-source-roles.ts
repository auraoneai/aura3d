const SOURCE_PRIMITIVE_CONSTRUCTORS = new Set([
  "box",
  "capsule",
  "cone",
  "cube",
  "cylinder",
  "group",
  "plane",
  "primitive",
  "sphere",
  "torus",
]);

const SOURCE_PRIMARY_ROLE_KEYWORDS = [
  "hero",
  "player",
  "character",
  "avatar",
  "enemy",
  "boss",
  "vehicle",
  "car",
  "truck",
  "ship",
  "plane",
  "drone",
  "weapon",
  "gun",
  "sword",
  "product",
  "sneaker",
  "phone",
  "world",
  "track",
  "city",
  "environment",
  "arena",
  "level",
  "map",
  "fighter",
  "kart",
  "creature",
  "terrain",
];

const SOURCE_SUPPORTING_PRIMITIVE_KEYWORDS = [
  "marker",
  "checkpoint",
  "guide",
  "collider",
  "collision",
  "trigger",
  "hitbox",
  "debug",
  "label",
  "hud",
  "anchor",
  "gizmo",
  "helper",
];

export function isPrimitiveConstructorName(name: string): boolean {
  return SOURCE_PRIMITIVE_CONSTRUCTORS.has(name);
}

export function isPrimaryRoleIdentifier(name: string): boolean {
  const readable = readableIdentifier(name);
  return SOURCE_PRIMARY_ROLE_KEYWORDS.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(readable));
}

export function isSupportingPrimitiveIdentifier(name: string): boolean {
  const readable = readableIdentifier(name);
  return SOURCE_SUPPORTING_PRIMITIVE_KEYWORDS.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(readable));
}

function readableIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
