export type ReleaseInventoryId = 'historical-3' | 'historical-4' | 'native-1';
export const RELEASE_INVENTORIES: Readonly<Record<ReleaseInventoryId, readonly string[]>>;
export function releaseInventoryId(version: string, requested?: ReleaseInventoryId): ReleaseInventoryId;
export function publicPackageNames(version: string, inventoryId?: ReleaseInventoryId): readonly string[];
export function expectedPublicPackageCount(version: string, inventoryId?: ReleaseInventoryId): number;
export function assertReleaseInventory(version: string, names: readonly string[], inventoryId?: ReleaseInventoryId): readonly string[];
