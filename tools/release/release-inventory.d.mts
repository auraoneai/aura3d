export type ReleaseInventoryId = 'historical-3' | 'historical-4' | 'native-1';
export interface PackageInventoryEntry {
  readonly name: string;
  readonly directory: string | null;
  readonly tier: number | null;
  readonly inventories: readonly ReleaseInventoryId[];
}
export const PACKAGE_INVENTORY: readonly PackageInventoryEntry[];
export function packageTiers(): Record<string, number>;
export function releasePackageTargets(version: string, inventoryId?: ReleaseInventoryId): readonly { name: string; directory: string }[];
export const RELEASE_INVENTORIES: Readonly<Record<ReleaseInventoryId, readonly string[]>>;
export function releaseInventoryId(version: string, requested?: ReleaseInventoryId): ReleaseInventoryId;
export function publicPackageNames(version: string, inventoryId?: ReleaseInventoryId): readonly string[];
export function expectedPublicPackageCount(version: string, inventoryId?: ReleaseInventoryId): number;
export function assertReleaseInventory(version: string, names: readonly string[], inventoryId?: ReleaseInventoryId): readonly string[];
