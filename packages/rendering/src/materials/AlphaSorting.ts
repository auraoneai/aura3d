export interface V4AlphaSortItem {
  readonly id: string;
  readonly depth: number;
  readonly alphaMode: "opaque" | "mask" | "blend";
  readonly renderOrder?: number;
}

export function sortV4AlphaItems(items: readonly V4AlphaSortItem[]): readonly V4AlphaSortItem[] {
  return [...items].sort((a, b) => {
    const orderA = a.renderOrder ?? 0;
    const orderB = b.renderOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    const groupA = alphaGroup(a.alphaMode);
    const groupB = alphaGroup(b.alphaMode);
    if (groupA !== groupB) return groupA - groupB;
    if (a.alphaMode === "blend" || b.alphaMode === "blend") return b.depth - a.depth;
    return a.depth - b.depth;
  });
}

function alphaGroup(mode: V4AlphaSortItem["alphaMode"]): number {
  switch (mode) {
    case "opaque":
      return 0;
    case "mask":
      return 1;
    case "blend":
      return 2;
  }
}
