/**
 * Sandbox UI
 *
 * User interface for the physics sandbox including object palette,
 * tool selection, settings panels, and performance stats.
 */

import { PhysicsWorld, Vector3 } from 'g3d';
import { PhysicsController } from './PhysicsController';
import { Spawners } from './Spawners';
import { Simulations } from './Simulations';
import { Tools, ToolType } from './Tools';

export interface PerformanceStats {
  fps: number;
  bodies: number;
  activeBodies: number;
  constraints: number;
}

/**
 * Main UI controller for the sandbox
 */
export class SandboxUI {
  private container: HTMLElement;
  private objectPalette: HTMLElement | null = null;
  private toolPanel: HTMLElement | null = null;
  private settingsPanel: HTMLElement | null = null;
  private statsPanel: HTMLElement | null = null;
  private helpPanel: HTMLElement | null = null;

  constructor(
    private controller: PhysicsController,
    private spawners: Spawners,
    private simulations: Simulations,
    private tools: Tools,
    private physicsWorld: PhysicsWorld
  ) {
    this.container = document.getElementById('ui')!;
  }

  /**
   * Initializes the UI
   */
  public init(): void {
    this.createObjectPalette();
    this.createToolPanel();
    this.createSettingsPanel();
    this.createStatsPanel();
    this.createHelpPanel();
  }

  /**
   * Creates the object palette for spawning
   */
  private createObjectPalette(): void {
    const palette = document.createElement('div');
    palette.className = 'panel';
    palette.style.cssText = `
      position: absolute;
      top: 20px;
      left: 20px;
      max-width: 200px;
    `;

    palette.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">Objects</h3>
      <div id="object-buttons"></div>
    `;

    this.container.appendChild(palette);
    this.objectPalette = palette;

    const buttonContainer = palette.querySelector('#object-buttons')!;

    const objects = [
      { name: 'Box', type: 'box' },
      { name: 'Sphere', type: 'sphere' },
      { name: 'Capsule', type: 'capsule' },
      { name: 'Cylinder', type: 'cylinder' },
      { name: 'Tower', type: 'tower' },
      { name: 'Pyramid', type: 'pyramid' },
      { name: 'Wall', type: 'wall' },
      { name: 'Chain', type: 'chain' },
      { name: "Newton's Cradle", type: 'newtons-cradle' },
      { name: 'Dominoes', type: 'dominoes' },
      { name: 'Wrecking Ball', type: 'wrecking-ball' },
      { name: 'Vehicle', type: 'vehicle' },
      { name: 'Ragdoll', type: 'ragdoll' }
    ];

    for (const obj of objects) {
      const button = this.createButton(obj.name, () => {
        this.spawnObject(obj.type);
      });
      buttonContainer.appendChild(button);
    }
  }

  /**
   * Creates the tool selection panel
   */
  private createToolPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      max-width: 200px;
    `;

    panel.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">Tools</h3>
      <div id="tool-buttons"></div>
    `;

    this.container.appendChild(panel);
    this.toolPanel = panel;

    const buttonContainer = panel.querySelector('#tool-buttons')!;

    const tools: { name: string; type: ToolType; key: string }[] = [
      { name: 'Grab (1)', type: 'grab', key: '1' },
      { name: 'Push (2)', type: 'push', key: '2' },
      { name: 'Slice (3)', type: 'slice', key: '3' },
      { name: 'Freeze (4)', type: 'freeze', key: '4' },
      { name: 'Delete (5)', type: 'delete', key: '5' },
      { name: 'Explode (6)', type: 'explode', key: '6' }
    ];

    for (const tool of tools) {
      const button = this.createButton(tool.name, () => {
        this.tools.setActiveTool(tool.type);
        this.highlightActiveTool(tool.type);
      });
      button.setAttribute('data-tool', tool.type);
      buttonContainer.appendChild(button);
    }

    this.highlightActiveTool('grab');
  }

  /**
   * Creates the settings panel
   */
  private createSettingsPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      max-width: 250px;
    `;

    panel.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">Settings</h3>
      <div id="settings-controls"></div>
    `;

    this.container.appendChild(panel);
    this.settingsPanel = panel;

    const controls = panel.querySelector('#settings-controls')!;

    const gravityButton = this.createButton('Toggle Gravity (G)', () => {
      this.controller.toggleGravity();
    });
    controls.appendChild(gravityButton);

    const resetButton = this.createButton('Reset Scene (R)', () => {
      window.location.reload();
    });
    controls.appendChild(resetButton);

    const simulationSection = document.createElement('div');
    simulationSection.style.marginTop = '15px';
    simulationSection.innerHTML = `
      <h4 style="margin: 10px 0 5px 0; color: #aaa; font-size: 14px;">Simulations</h4>
    `;
    controls.appendChild(simulationSection);

    const clothButton = this.createButton('Cloth Demo', () => {
      this.simulations.createCloth(new Vector3(0, 10, 0), 4, 4, 20, 20);
    });
    simulationSection.appendChild(clothButton);

    const fluidButton = this.createButton('Fluid Demo', () => {
      this.simulations.createFluid(new Vector3(0, 10, 0), 500, new Vector3(4, 8, 4));
    });
    simulationSection.appendChild(fluidButton);

    const softBodyButton = this.createButton('Soft Body Demo', () => {
      this.simulations.createSoftBody(new Vector3(0, 10, 0), new Vector3(2, 2, 2), 5);
    });
    simulationSection.appendChild(softBodyButton);
  }

  /**
   * Creates the performance stats panel
   */
  private createStatsPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      min-width: 200px;
    `;

    panel.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">Performance</h3>
      <div id="stats-content" style="font-family: monospace; font-size: 12px; line-height: 1.8;">
        <div>FPS: <span id="stat-fps">0</span></div>
        <div>Bodies: <span id="stat-bodies">0</span></div>
        <div>Active: <span id="stat-active">0</span></div>
        <div>Constraints: <span id="stat-constraints">0</span></div>
      </div>
    `;

    this.container.appendChild(panel);
    this.statsPanel = panel;
  }

  /**
   * Creates the help panel
   */
  private createHelpPanel(): void {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 400px;
      display: none;
    `;

    panel.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 18px;">Controls</h3>
      <div style="line-height: 2;">
        <div><strong>Left Click:</strong> Use selected tool</div>
        <div><strong>Right Click + Drag:</strong> Rotate camera</div>
        <div><strong>Mouse Wheel:</strong> Zoom camera</div>
        <div><strong>1-6:</strong> Select tool</div>
        <div><strong>Q/E:</strong> Rotate spawn object</div>
        <div><strong>Delete:</strong> Remove selected object</div>
        <div><strong>R:</strong> Reset scene</div>
        <div><strong>G:</strong> Toggle gravity</div>
        <div><strong>T:</strong> Slow motion toggle</div>
        <div><strong>Space:</strong> Pause/Resume</div>
        <div><strong>H:</strong> Toggle this help</div>
      </div>
      <button id="close-help" style="margin-top: 15px; width: 100%; padding: 10px; background: #444; border: none; color: #fff; cursor: pointer; border-radius: 4px;">Close</button>
    `;

    this.container.appendChild(panel);
    this.helpPanel = panel;

    panel.querySelector('#close-help')!.addEventListener('click', () => {
      panel.style.display = 'none';
    });

    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'h') {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  /**
   * Creates a styled button
   */
  private createButton(text: string, onClick: () => void): HTMLElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      margin: 4px 0;
      background: rgba(60, 60, 80, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      cursor: pointer;
      border-radius: 4px;
      font-size: 13px;
      transition: all 0.2s;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(80, 80, 100, 0.9)';
      button.style.borderColor = 'rgba(255, 255, 255, 0.4)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(60, 60, 80, 0.9)';
      button.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });

    button.addEventListener('click', onClick);

    return button;
  }

  /**
   * Highlights the active tool button
   */
  private highlightActiveTool(tool: ToolType): void {
    const buttons = this.toolPanel?.querySelectorAll('button');
    buttons?.forEach((button) => {
      if (button.getAttribute('data-tool') === tool) {
        button.style.background = 'rgba(100, 100, 200, 0.9)';
        button.style.borderColor = 'rgba(150, 150, 255, 0.8)';
      } else {
        button.style.background = 'rgba(60, 60, 80, 0.9)';
        button.style.borderColor = 'rgba(255, 255, 255, 0.2)';
      }
    });
  }

  /**
   * Spawns an object based on type
   */
  private spawnObject(type: string): void {
    const spawnPos = new Vector3(0, 10, 0);

    switch (type) {
      case 'box':
        this.spawners.spawnBox(spawnPos);
        break;
      case 'sphere':
        this.spawners.spawnSphere(spawnPos);
        break;
      case 'capsule':
        this.spawners.spawnCapsule(spawnPos);
        break;
      case 'cylinder':
        this.spawners.spawnCylinder(spawnPos);
        break;
      case 'tower':
        this.spawners.spawnTower(spawnPos, 10);
        break;
      case 'pyramid':
        this.spawners.spawnPyramid(spawnPos, 5);
        break;
      case 'wall':
        this.spawners.spawnWall(spawnPos, 8, 6);
        break;
      case 'chain':
        this.spawners.spawnChain(spawnPos, spawnPos.add(new Vector3(0, -5, 0)), 10);
        break;
      case 'newtons-cradle':
        this.spawners.spawnNewtonsCradle(spawnPos, 5);
        break;
      case 'dominoes':
        this.spawners.spawnDominoes(spawnPos, 20);
        break;
      case 'wrecking-ball':
        this.spawners.spawnWreckingBall(spawnPos, 10);
        break;
      case 'vehicle':
        this.spawners.spawnVehicle(spawnPos);
        break;
      case 'ragdoll':
        this.spawners.spawnRagdoll(spawnPos);
        break;
    }
  }

  /**
   * Updates the performance stats display
   */
  public updateStats(stats: PerformanceStats): void {
    const fpsElement = document.getElementById('stat-fps');
    const bodiesElement = document.getElementById('stat-bodies');
    const activeElement = document.getElementById('stat-active');
    const constraintsElement = document.getElementById('stat-constraints');

    if (fpsElement) fpsElement.textContent = Math.round(stats.fps).toString();
    if (bodiesElement) bodiesElement.textContent = stats.bodies.toString();
    if (activeElement) activeElement.textContent = stats.activeBodies.toString();
    if (constraintsElement) constraintsElement.textContent = stats.constraints.toString();
  }

  /**
   * Updates pause state display
   */
  public updatePauseState(isPaused: boolean): void {
    // Could add visual indicator for pause state
  }

  /**
   * Updates time scale display
   */
  public updateTimeScale(scale: number): void {
    // Could add visual indicator for time scale
  }
}
