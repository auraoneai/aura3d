/**
 * Inventory.ts
 * Complete inventory system with hotbar, stacking, and item management
 */

import { BlockType, BlockRegistry } from './BlockTypes';

/**
 * Inventory slot
 */
export interface InventorySlot {
  blockType: BlockType;
  count: number;
  maxStack: number;
}

/**
 * Inventory system
 */
export class Inventory {
  private hotbarSlots: InventorySlot[] = [];
  private inventorySlots: InventorySlot[] = [];
  private selectedHotbarIndex: number = 0;

  private readonly HOTBAR_SIZE = 9;
  private readonly INVENTORY_ROWS = 3;
  private readonly INVENTORY_COLS = 9;
  private readonly MAX_STACK_SIZE = 64;

  constructor() {
    this.initializeSlots();
  }

  /**
   * Initialize inventory slots
   */
  private initializeSlots(): void {
    // Initialize hotbar with some blocks
    for (let i = 0; i < this.HOTBAR_SIZE; i++) {
      this.hotbarSlots.push({
        blockType: BlockType.Air,
        count: 0,
        maxStack: this.MAX_STACK_SIZE
      });
    }

    // Set default hotbar items for creative mode
    this.hotbarSlots[0] = { blockType: BlockType.Dirt, count: 64, maxStack: 64 };
    this.hotbarSlots[1] = { blockType: BlockType.Stone, count: 64, maxStack: 64 };
    this.hotbarSlots[2] = { blockType: BlockType.Wood, count: 64, maxStack: 64 };
    this.hotbarSlots[3] = { blockType: BlockType.Planks, count: 64, maxStack: 64 };
    this.hotbarSlots[4] = { blockType: BlockType.Glass, count: 64, maxStack: 64 };
    this.hotbarSlots[5] = { blockType: BlockType.Brick, count: 64, maxStack: 64 };
    this.hotbarSlots[6] = { blockType: BlockType.Sand, count: 64, maxStack: 64 };
    this.hotbarSlots[7] = { blockType: BlockType.Leaves, count: 64, maxStack: 64 };
    this.hotbarSlots[8] = { blockType: BlockType.Cobblestone, count: 64, maxStack: 64 };

    // Initialize main inventory
    const totalInventorySlots = this.INVENTORY_ROWS * this.INVENTORY_COLS;
    for (let i = 0; i < totalInventorySlots; i++) {
      this.inventorySlots.push({
        blockType: BlockType.Air,
        count: 0,
        maxStack: this.MAX_STACK_SIZE
      });
    }
  }

  /**
   * Get selected hotbar slot
   */
  public getSelectedSlot(): InventorySlot {
    return this.hotbarSlots[this.selectedHotbarIndex];
  }

  /**
   * Get selected block type
   */
  public getSelectedBlockType(): BlockType {
    return this.hotbarSlots[this.selectedHotbarIndex].blockType;
  }

  /**
   * Set selected hotbar index
   */
  public setSelectedIndex(index: number): void {
    if (index >= 0 && index < this.HOTBAR_SIZE) {
      this.selectedHotbarIndex = index;
    }
  }

  /**
   * Get selected index
   */
  public getSelectedIndex(): number {
    return this.selectedHotbarIndex;
  }

  /**
   * Get hotbar slots
   */
  public getHotbarSlots(): InventorySlot[] {
    return this.hotbarSlots;
  }

  /**
   * Get inventory slots
   */
  public getInventorySlots(): InventorySlot[] {
    return this.inventorySlots;
  }

  /**
   * Add item to inventory
   */
  public addItem(blockType: BlockType, count: number = 1): boolean {
    if (blockType === BlockType.Air) return false;

    let remaining = count;

    // Try to stack with existing items in hotbar
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType && slot.count < slot.maxStack) {
        const canAdd = Math.min(remaining, slot.maxStack - slot.count);
        slot.count += canAdd;
        remaining -= canAdd;

        if (remaining === 0) return true;
      }
    }

    // Try to stack with existing items in inventory
    for (const slot of this.inventorySlots) {
      if (slot.blockType === blockType && slot.count < slot.maxStack) {
        const canAdd = Math.min(remaining, slot.maxStack - slot.count);
        slot.count += canAdd;
        remaining -= canAdd;

        if (remaining === 0) return true;
      }
    }

    // Try to find empty slots in hotbar
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === BlockType.Air || slot.count === 0) {
        const canAdd = Math.min(remaining, this.MAX_STACK_SIZE);
        slot.blockType = blockType;
        slot.count = canAdd;
        remaining -= canAdd;

        if (remaining === 0) return true;
      }
    }

    // Try to find empty slots in inventory
    for (const slot of this.inventorySlots) {
      if (slot.blockType === BlockType.Air || slot.count === 0) {
        const canAdd = Math.min(remaining, this.MAX_STACK_SIZE);
        slot.blockType = blockType;
        slot.count = canAdd;
        remaining -= canAdd;

        if (remaining === 0) return true;
      }
    }

    return remaining < count;
  }

  /**
   * Remove item from inventory
   */
  public removeItem(blockType: BlockType, count: number = 1): boolean {
    let remaining = count;

    // Remove from hotbar first
    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType && slot.count > 0) {
        const canRemove = Math.min(remaining, slot.count);
        slot.count -= canRemove;
        remaining -= canRemove;

        if (slot.count === 0) {
          slot.blockType = BlockType.Air;
        }

        if (remaining === 0) return true;
      }
    }

    // Remove from inventory
    for (const slot of this.inventorySlots) {
      if (slot.blockType === blockType && slot.count > 0) {
        const canRemove = Math.min(remaining, slot.count);
        slot.count -= canRemove;
        remaining -= canRemove;

        if (slot.count === 0) {
          slot.blockType = BlockType.Air;
        }

        if (remaining === 0) return true;
      }
    }

    return remaining < count;
  }

  /**
   * Use selected item (returns false if none available)
   */
  public useSelectedItem(): boolean {
    const slot = this.getSelectedSlot();
    if (slot.blockType === BlockType.Air || slot.count === 0) {
      return false;
    }

    slot.count--;
    if (slot.count === 0) {
      slot.blockType = BlockType.Air;
    }

    return true;
  }

  /**
   * Has item in inventory
   */
  public hasItem(blockType: BlockType, count: number = 1): boolean {
    let total = 0;

    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType) {
        total += slot.count;
      }
    }

    for (const slot of this.inventorySlots) {
      if (slot.blockType === blockType) {
        total += slot.count;
      }
    }

    return total >= count;
  }

  /**
   * Get item count
   */
  public getItemCount(blockType: BlockType): number {
    let total = 0;

    for (const slot of this.hotbarSlots) {
      if (slot.blockType === blockType) {
        total += slot.count;
      }
    }

    for (const slot of this.inventorySlots) {
      if (slot.blockType === blockType) {
        total += slot.count;
      }
    }

    return total;
  }

  /**
   * Clear inventory
   */
  public clear(): void {
    for (const slot of this.hotbarSlots) {
      slot.blockType = BlockType.Air;
      slot.count = 0;
    }

    for (const slot of this.inventorySlots) {
      slot.blockType = BlockType.Air;
      slot.count = 0;
    }
  }

  /**
   * Swap slots
   */
  public swapSlots(index1: number, index2: number, fromHotbar1: boolean, fromHotbar2: boolean): void {
    const slots1 = fromHotbar1 ? this.hotbarSlots : this.inventorySlots;
    const slots2 = fromHotbar2 ? this.hotbarSlots : this.inventorySlots;

    if (index1 < 0 || index1 >= slots1.length || index2 < 0 || index2 >= slots2.length) {
      return;
    }

    const temp = { ...slots1[index1] };
    slots1[index1] = { ...slots2[index2] };
    slots2[index2] = temp;
  }

  /**
   * Serialize inventory
   */
  public serialize(): string {
    return JSON.stringify({
      hotbar: this.hotbarSlots,
      inventory: this.inventorySlots,
      selectedIndex: this.selectedHotbarIndex
    });
  }

  /**
   * Deserialize inventory
   */
  public deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.hotbarSlots = parsed.hotbar;
      this.inventorySlots = parsed.inventory;
      this.selectedHotbarIndex = parsed.selectedIndex;
    } catch (e) {
      console.error('Failed to deserialize inventory:', e);
    }
  }
}
