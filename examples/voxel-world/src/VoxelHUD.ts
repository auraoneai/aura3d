/**
 * VoxelHUD.ts
 * Complete HUD system with crosshair, hotbar, debug info, and inventory display
 */

import { Inventory } from './Inventory';
import { BlockRegistry, BlockType } from './BlockTypes';
import { ChunkStats } from './ChunkManager';
import { Vector3 } from '../../../src/math/Vector3';

/**
 * HUD display system
 */
export class VoxelHUD {
  private container: HTMLDivElement;
  private crosshair: HTMLDivElement;
  private hotbarContainer: HTMLDivElement;
  private debugInfo: HTMLDivElement;
  private inventoryOverlay: HTMLDivElement | null = null;

  private showDebug: boolean = false;
  private showInventory: boolean = false;

  constructor(parentElement: HTMLElement) {
    this.container = document.createElement('div');
    this.container.id = 'voxel-hud';
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      font-family: monospace;
      color: white;
    `;

    // Create crosshair
    this.crosshair = this.createCrosshair();
    this.container.appendChild(this.crosshair);

    // Create hotbar
    this.hotbarContainer = this.createHotbar();
    this.container.appendChild(this.hotbarContainer);

    // Create debug info
    this.debugInfo = this.createDebugInfo();
    this.container.appendChild(this.debugInfo);

    parentElement.appendChild(this.container);
  }

  /**
   * Create crosshair
   */
  private createCrosshair(): HTMLDivElement {
    const crosshair = document.createElement('div');
    crosshair.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
    `;

    // Horizontal line
    const hLine = document.createElement('div');
    hLine.style.cssText = `
      position: absolute;
      top: 50%;
      left: 25%;
      width: 50%;
      height: 2px;
      background: white;
      transform: translateY(-50%);
    `;

    // Vertical line
    const vLine = document.createElement('div');
    vLine.style.cssText = `
      position: absolute;
      left: 50%;
      top: 25%;
      width: 2px;
      height: 50%;
      background: white;
      transform: translateX(-50%);
    `;

    // Center dot
    const dot = document.createElement('div');
    dot.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 4px;
      height: 4px;
      background: white;
      border-radius: 50%;
      transform: translate(-50%, -50%);
    `;

    crosshair.appendChild(hLine);
    crosshair.appendChild(vLine);
    crosshair.appendChild(dot);

    return crosshair;
  }

  /**
   * Create hotbar
   */
  private createHotbar(): HTMLDivElement {
    const hotbar = document.createElement('div');
    hotbar.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      background: rgba(0, 0, 0, 0.5);
      padding: 8px;
      border-radius: 4px;
    `;

    return hotbar;
  }

  /**
   * Create debug info panel
   */
  private createDebugInfo(): HTMLDivElement {
    const debug = document.createElement('div');
    debug.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.5;
      display: ${this.showDebug ? 'block' : 'none'};
    `;

    return debug;
  }

  /**
   * Update hotbar display
   */
  public updateHotbar(inventory: Inventory): void {
    const slots = inventory.getHotbarSlots();
    const selectedIndex = inventory.getSelectedIndex();

    // Clear hotbar
    this.hotbarContainer.innerHTML = '';

    // Create slot elements
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotElement = document.createElement('div');
      const isSelected = i === selectedIndex;

      slotElement.style.cssText = `
        width: 50px;
        height: 50px;
        background: ${isSelected ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.5)'};
        border: 2px solid ${isSelected ? 'white' : 'rgba(255, 255, 255, 0.3)'};
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
      `;

      // Block icon (colored square)
      if (slot.blockType !== BlockType.Air && slot.count > 0) {
        const props = BlockRegistry.get(slot.blockType);
        if (props) {
          const icon = document.createElement('div');
          const color = props.material.color;
          icon.style.cssText = `
            width: 32px;
            height: 32px;
            background: rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]});
            border: 1px solid rgba(0, 0, 0, 0.5);
          `;
          slotElement.appendChild(icon);

          // Count
          if (slot.count > 1) {
            const count = document.createElement('div');
            count.textContent = slot.count.toString();
            count.style.cssText = `
              position: absolute;
              bottom: 2px;
              right: 4px;
              font-size: 11px;
              font-weight: bold;
              text-shadow: 1px 1px 2px black;
            `;
            slotElement.appendChild(count);
          }

          // Slot number
          const number = document.createElement('div');
          number.textContent = (i + 1).toString();
          number.style.cssText = `
            position: absolute;
            top: 2px;
            left: 4px;
            font-size: 10px;
            opacity: 0.7;
          `;
          slotElement.appendChild(number);
        }
      } else {
        // Empty slot - just show number
        const number = document.createElement('div');
        number.textContent = (i + 1).toString();
        number.style.cssText = `
          position: absolute;
          top: 2px;
          left: 4px;
          font-size: 10px;
          opacity: 0.5;
        `;
        slotElement.appendChild(number);
      }

      this.hotbarContainer.appendChild(slotElement);
    }
  }

  /**
   * Update debug info
   */
  public updateDebugInfo(
    playerPos: Vector3,
    chunkPos: Vector3,
    fps: number,
    stats: ChunkStats,
    selectedBlock: string
  ): void {
    if (!this.showDebug) return;

    const memoryMB = (stats.memoryUsage / 1024 / 1024).toFixed(2);

    this.debugInfo.innerHTML = `
      <div><strong>G3D Voxel World</strong></div>
      <div>FPS: ${fps.toFixed(1)}</div>
      <div>Position: ${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}, ${playerPos.z.toFixed(1)}</div>
      <div>Chunk: ${chunkPos.x}, ${chunkPos.y}, ${chunkPos.z}</div>
      <div>Selected: ${selectedBlock}</div>
      <div>&nbsp;</div>
      <div><strong>Chunks</strong></div>
      <div>Loaded: ${stats.loadedChunks}</div>
      <div>Generating: ${stats.generatingChunks}</div>
      <div>Meshing: ${stats.meshingChunks}</div>
      <div>Memory: ${memoryMB} MB</div>
      <div>&nbsp;</div>
      <div><strong>Controls</strong></div>
      <div>WASD: Move</div>
      <div>Space: Jump</div>
      <div>Shift: Sneak</div>
      <div>Mouse: Look</div>
      <div>Left Click: Break</div>
      <div>Right Click: Place</div>
      <div>1-9: Select block</div>
      <div>F3: Toggle debug</div>
    `;
  }

  /**
   * Toggle debug display
   */
  public toggleDebug(): void {
    this.showDebug = !this.showDebug;
    this.debugInfo.style.display = this.showDebug ? 'block' : 'none';
  }

  /**
   * Set crosshair visibility
   */
  public setCrosshairVisible(visible: boolean): void {
    this.crosshair.style.display = visible ? 'block' : 'none';
  }

  /**
   * Show message
   */
  public showMessage(message: string, duration: number = 3000): void {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.cssText = `
      position: absolute;
      top: 30%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      padding: 15px 30px;
      border-radius: 4px;
      font-size: 16px;
      pointer-events: none;
      animation: fadeIn 0.3s;
    `;

    this.container.appendChild(messageElement);

    setTimeout(() => {
      messageElement.style.animation = 'fadeOut 0.3s';
      setTimeout(() => {
        this.container.removeChild(messageElement);
      }, 300);
    }, duration);
  }

  /**
   * Show loading screen
   */
  public showLoading(message: string = 'Loading...'): void {
    const loading = document.createElement('div');
    loading.id = 'loading-screen';
    loading.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      pointer-events: all;
    `;
    loading.textContent = message;
    this.container.appendChild(loading);
  }

  /**
   * Hide loading screen
   */
  public hideLoading(): void {
    const loading = document.getElementById('loading-screen');
    if (loading) {
      this.container.removeChild(loading);
    }
  }

  /**
   * Update block break progress
   */
  public updateBreakProgress(progress: number): void {
    let progressBar = document.getElementById('break-progress');

    if (progress <= 0) {
      if (progressBar) {
        this.container.removeChild(progressBar);
      }
      return;
    }

    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.id = 'break-progress';
      progressBar.style.cssText = `
        position: absolute;
        top: 45%;
        left: 50%;
        transform: translateX(-50%);
        width: 200px;
        height: 20px;
        background: rgba(0, 0, 0, 0.5);
        border: 2px solid white;
        border-radius: 4px;
        overflow: hidden;
      `;
      this.container.appendChild(progressBar);
    }

    progressBar.innerHTML = `
      <div style="
        width: ${progress * 100}%;
        height: 100%;
        background: linear-gradient(90deg, #4a4a4a, #ffffff);
        transition: width 0.1s;
      "></div>
    `;
  }

  /**
   * Dispose HUD
   */
  public dispose(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
