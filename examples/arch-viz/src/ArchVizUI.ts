/**
 * G3D Architectural Visualization - User Interface
 * Professional UI controls for arch-viz tools
 */

import { MaterialLibrary } from './MaterialLibrary';
import { LightingController } from './LightingController';
import { PostProcessing } from './PostProcessing';
import { CameraController } from './CameraController';
import { MeasurementTool } from './MeasurementTool';

/**
 * User interface for architectural visualization
 */
export class ArchVizUI {
  private container: HTMLElement;
  private panels: Map<string, HTMLElement> = new Map();
  private isVisible: boolean = true;

  constructor(
    private materialLibrary: MaterialLibrary,
    private lightingController: LightingController,
    private postProcessing: PostProcessing,
    private cameraController: CameraController,
    private measurementTool: MeasurementTool
  ) {
    this.container = document.getElementById('ui-overlay')!;
    this.createUI();
    this.attachEventListeners();
  }

  /**
   * Create the complete UI
   */
  private createUI(): void {
    this.createControlPanel();
    this.createMaterialPanel();
    this.createLightingPanel();
    this.createPostProcessingPanel();
    this.createCameraPanel();
    this.createMeasurementPanel();
    this.createInfoDisplay();
    this.createHelpOverlay();
  }

  /**
   * Create main control panel
   */
  private createControlPanel(): void {
    const panel = this.createPanel('control-panel', 'Controls', 'top-right');

    const buttons = [
      { label: 'Materials', action: () => this.togglePanel('material-panel') },
      { label: 'Lighting', action: () => this.togglePanel('lighting-panel') },
      { label: 'Post-FX', action: () => this.togglePanel('postfx-panel') },
      { label: 'Camera', action: () => this.togglePanel('camera-panel') },
      { label: 'Measure', action: () => this.togglePanel('measurement-panel') },
      { label: 'Help', action: () => this.togglePanel('help-overlay') },
    ];

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.label;
      button.className = 'ui-button';
      button.onclick = btn.action;
      panel.appendChild(button);
    });

    this.panels.set('control-panel', panel);
  }

  /**
   * Create material selection panel
   */
  private createMaterialPanel(): void {
    const panel = this.createPanel('material-panel', 'Materials', 'left');
    panel.style.display = 'none';

    const categories = this.materialLibrary.getMaterialCategories();

    categories.forEach((materials, categoryName) => {
      const categorySection = document.createElement('div');
      categorySection.className = 'ui-category';

      const categoryTitle = document.createElement('h3');
      categoryTitle.textContent = categoryName;
      categorySection.appendChild(categoryTitle);

      materials.forEach(material => {
        const materialButton = document.createElement('button');
        materialButton.className = 'material-button';
        materialButton.textContent = material.name;
        materialButton.style.background = `rgb(${material.albedo.r * 255}, ${material.albedo.g * 255}, ${material.albedo.b * 255})`;
        materialButton.onclick = () => this.selectMaterial(material.name);
        categorySection.appendChild(materialButton);
      });

      panel.appendChild(categorySection);
    });

    this.panels.set('material-panel', panel);
  }

  /**
   * Create lighting control panel
   */
  private createLightingPanel(): void {
    const panel = this.createPanel('lighting-panel', 'Lighting', 'left');
    panel.style.display = 'none';

    // Time of day slider
    const timeSection = this.createSection('Time of Day');
    const timeSlider = this.createSlider('time-slider', 0, 24, 14, 0.5, (value) => {
      this.lightingController.setTimeOfDay(value);
      this.updateTimeDisplay(value);
    });
    const timeDisplay = document.createElement('span');
    timeDisplay.id = 'time-display';
    timeDisplay.textContent = '14:00';
    timeSection.appendChild(timeDisplay);
    timeSection.appendChild(timeSlider);
    panel.appendChild(timeSection);

    // Lighting presets
    const presetsSection = this.createSection('Presets');
    const presets = this.lightingController.getPresets();
    presets.forEach(preset => {
      const button = document.createElement('button');
      button.className = 'ui-button';
      button.textContent = preset.name;
      button.onclick = () => {
        this.lightingController.applyPreset(preset.name.toLowerCase().replace(' ', '_'));
        timeSlider.value = preset.timeOfDay.toString();
        this.updateTimeDisplay(preset.timeOfDay);
      };
      presetsSection.appendChild(button);
    });
    panel.appendChild(presetsSection);

    // Interior lights toggle
    const lightsSection = this.createSection('Interior Lights');
    const lightsToggle = document.createElement('button');
    lightsToggle.className = 'ui-button toggle-button';
    lightsToggle.textContent = 'Toggle Lights';
    lightsToggle.onclick = () => {
      this.lightingController.toggleInteriorLights();
      lightsToggle.classList.toggle('active');
    };
    lightsSection.appendChild(lightsToggle);
    panel.appendChild(lightsSection);

    this.panels.set('lighting-panel', panel);
  }

  /**
   * Create post-processing panel
   */
  private createPostProcessingPanel(): void {
    const panel = this.createPanel('postfx-panel', 'Post-Processing', 'left');
    panel.style.display = 'none';

    const settings = this.postProcessing.getSettings();

    // Tone mapping
    const toneMappingSection = this.createSection('Tone Mapping');
    const toneMappingSelect = document.createElement('select');
    toneMappingSelect.className = 'ui-select';
    ['linear', 'reinhard', 'aces', 'filmic', 'uncharted2'].forEach(mode => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      option.selected = mode === settings.toneMappingMode;
      toneMappingSelect.appendChild(option);
    });
    toneMappingSelect.onchange = () => {
      this.postProcessing.updateSettings({
        toneMappingMode: toneMappingSelect.value as any,
      });
    };
    toneMappingSection.appendChild(toneMappingSelect);
    panel.appendChild(toneMappingSection);

    // Exposure
    const exposureSlider = this.createSlider('exposure', 0, 3, settings.exposure, 0.1,
      (value) => this.postProcessing.updateSettings({ exposure: value }));
    panel.appendChild(this.createSliderSection('Exposure', exposureSlider));

    // Bloom
    const bloomSection = this.createSection('Bloom');
    const bloomToggle = this.createToggle('bloom-toggle', settings.bloomEnabled,
      (enabled) => this.postProcessing.updateSettings({ bloomEnabled: enabled }));
    bloomSection.appendChild(bloomToggle);

    const bloomIntensity = this.createSlider('bloom-intensity', 0, 1, settings.bloomIntensity, 0.1,
      (value) => this.postProcessing.updateSettings({ bloomIntensity: value }));
    bloomSection.appendChild(this.createLabel('Intensity'));
    bloomSection.appendChild(bloomIntensity);
    panel.appendChild(bloomSection);

    // Vignette
    const vignetteSection = this.createSection('Vignette');
    const vignetteToggle = this.createToggle('vignette-toggle', settings.vignetteEnabled,
      (enabled) => this.postProcessing.updateSettings({ vignetteEnabled: enabled }));
    vignetteSection.appendChild(vignetteToggle);

    const vignetteIntensity = this.createSlider('vignette-intensity', 0, 1, settings.vignetteIntensity, 0.1,
      (value) => this.postProcessing.updateSettings({ vignetteIntensity: value }));
    vignetteSection.appendChild(this.createLabel('Intensity'));
    vignetteSection.appendChild(vignetteIntensity);
    panel.appendChild(vignetteSection);

    // Presets
    const presetsSection = this.createSection('Presets');
    ['realistic', 'dramatic', 'soft', 'neutral'].forEach(preset => {
      const button = document.createElement('button');
      button.className = 'ui-button';
      button.textContent = preset.charAt(0).toUpperCase() + preset.slice(1);
      button.onclick = () => this.postProcessing.loadPreset(preset);
      presetsSection.appendChild(button);
    });
    panel.appendChild(presetsSection);

    this.panels.set('postfx-panel', panel);
  }

  /**
   * Create camera control panel
   */
  private createCameraPanel(): void {
    const panel = this.createPanel('camera-panel', 'Camera', 'left');
    panel.style.display = 'none';

    // Camera mode
    const modeSection = this.createSection('Camera Mode');
    ['orbit', 'flythrough', 'walkthrough', 'cinematic'].forEach(mode => {
      const button = document.createElement('button');
      button.className = 'ui-button';
      button.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      button.onclick = () => this.cameraController.setMode(mode as any);
      modeSection.appendChild(button);
    });
    panel.appendChild(modeSection);

    // Camera presets
    const presetsSection = this.createSection('View Presets');
    const presets = this.cameraController.getPresets();
    presets.forEach(preset => {
      const button = document.createElement('button');
      button.className = 'ui-button preset-button';
      button.textContent = preset.name;
      button.title = preset.description;
      button.onclick = () => this.cameraController.applyPreset(preset.name.toLowerCase().replace(/\s+/g, '_'));
      presetsSection.appendChild(button);
    });
    panel.appendChild(presetsSection);

    // Screenshot
    const screenshotButton = document.createElement('button');
    screenshotButton.className = 'ui-button';
    screenshotButton.textContent = 'Capture Screenshot';
    screenshotButton.onclick = () => this.captureScreenshot();
    panel.appendChild(screenshotButton);

    this.panels.set('camera-panel', panel);
  }

  /**
   * Create measurement panel
   */
  private createMeasurementPanel(): void {
    const panel = this.createPanel('measurement-panel', 'Measurements', 'left');
    panel.style.display = 'none';

    // Measurement type
    const typeSection = this.createSection('Measure');
    ['distance', 'area', 'angle', 'height'].forEach(type => {
      const button = document.createElement('button');
      button.className = 'ui-button';
      button.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      button.onclick = () => this.measurementTool.startMeasurement(type as any);
      typeSection.appendChild(button);
    });
    panel.appendChild(typeSection);

    // Unit selection
    const unitSection = this.createSection('Units');
    const metricButton = document.createElement('button');
    metricButton.className = 'ui-button active';
    metricButton.textContent = 'Metric';
    metricButton.onclick = () => {
      this.measurementTool.setUnit('metric');
      metricButton.classList.add('active');
      imperialButton.classList.remove('active');
    };

    const imperialButton = document.createElement('button');
    imperialButton.className = 'ui-button';
    imperialButton.textContent = 'Imperial';
    imperialButton.onclick = () => {
      this.measurementTool.setUnit('imperial');
      imperialButton.classList.add('active');
      metricButton.classList.remove('active');
    };

    unitSection.appendChild(metricButton);
    unitSection.appendChild(imperialButton);
    panel.appendChild(unitSection);

    // Clear measurements
    const clearButton = document.createElement('button');
    clearButton.className = 'ui-button';
    clearButton.textContent = 'Clear All';
    clearButton.onclick = () => this.measurementTool.clearAllMeasurements();
    panel.appendChild(clearButton);

    this.panels.set('measurement-panel', panel);
  }

  /**
   * Create info display
   */
  private createInfoDisplay(): void {
    const info = document.createElement('div');
    info.id = 'info-display';
    info.className = 'ui-info';
    info.style.cssText = 'position: absolute; bottom: 10px; left: 10px; pointer-events: none;';
    info.innerHTML = `
      <div>G3D 5.0 Architectural Visualization</div>
      <div id="fps-counter">FPS: 60</div>
      <div id="camera-info">Camera: Orbit</div>
    `;
    this.container.appendChild(info);
  }

  /**
   * Create help overlay
   */
  private createHelpOverlay(): void {
    const help = document.createElement('div');
    help.id = 'help-overlay';
    help.className = 'ui-panel';
    help.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: none; pointer-events: all;';

    help.innerHTML = `
      <h2>Controls</h2>
      <div class="help-section">
        <h3>Camera</h3>
        <ul>
          <li><strong>WASD</strong> - Move camera</li>
          <li><strong>Mouse Drag</strong> - Look around</li>
          <li><strong>Scroll</strong> - Zoom in/out</li>
          <li><strong>C</strong> - Toggle camera mode</li>
        </ul>
      </div>
      <div class="help-section">
        <h3>Tools</h3>
        <ul>
          <li><strong>M</strong> - Toggle measurement tool</li>
          <li><strong>L</strong> - Toggle interior lights</li>
          <li><strong>T</strong> - Change time of day</li>
          <li><strong>P</strong> - Capture screenshot</li>
        </ul>
      </div>
      <div class="help-section">
        <h3>UI</h3>
        <ul>
          <li><strong>H</strong> - Toggle this help</li>
          <li><strong>U</strong> - Toggle UI visibility</li>
        </ul>
      </div>
      <button class="ui-button" onclick="document.getElementById('help-overlay').style.display='none'">Close</button>
    `;

    this.container.appendChild(help);
    this.panels.set('help-overlay', help);
  }

  /**
   * Create a panel
   */
  private createPanel(id: string, title: string, position: string): HTMLElement {
    const panel = document.createElement('div');
    panel.id = id;
    panel.className = 'ui-panel';

    let positionStyle = '';
    switch (position) {
      case 'top-right':
        positionStyle = 'top: 10px; right: 10px;';
        break;
      case 'left':
        positionStyle = 'top: 10px; left: 10px; max-height: 90vh; overflow-y: auto;';
        break;
    }

    panel.style.cssText = `position: absolute; ${positionStyle} pointer-events: all;`;

    const titleElement = document.createElement('h2');
    titleElement.textContent = title;
    panel.appendChild(titleElement);

    this.container.appendChild(panel);
    return panel;
  }

  /**
   * Create a section
   */
  private createSection(title: string): HTMLElement {
    const section = document.createElement('div');
    section.className = 'ui-section';

    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    section.appendChild(titleElement);

    return section;
  }

  /**
   * Create a slider
   */
  private createSlider(
    id: string,
    min: number,
    max: number,
    value: number,
    step: number,
    onChange: (value: number) => void
  ): HTMLInputElement {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = id;
    slider.className = 'ui-slider';
    slider.min = min.toString();
    slider.max = max.toString();
    slider.value = value.toString();
    slider.step = step.toString();
    slider.oninput = () => onChange(parseFloat(slider.value));

    return slider;
  }

  /**
   * Create slider with label
   */
  private createSliderSection(label: string, slider: HTMLInputElement): HTMLElement {
    const section = this.createSection(label);
    section.appendChild(slider);
    return section;
  }

  /**
   * Create a toggle button
   */
  private createToggle(id: string, initial: boolean, onChange: (enabled: boolean) => void): HTMLElement {
    const toggle = document.createElement('button');
    toggle.id = id;
    toggle.className = `ui-button toggle-button ${initial ? 'active' : ''}`;
    toggle.textContent = initial ? 'Enabled' : 'Disabled';
    toggle.onclick = () => {
      const enabled = !toggle.classList.contains('active');
      toggle.classList.toggle('active');
      toggle.textContent = enabled ? 'Enabled' : 'Disabled';
      onChange(enabled);
    };

    return toggle;
  }

  /**
   * Create a label
   */
  private createLabel(text: string): HTMLElement {
    const label = document.createElement('label');
    label.textContent = text;
    label.className = 'ui-label';
    return label;
  }

  /**
   * Toggle panel visibility
   */
  private togglePanel(panelId: string): void {
    const panel = this.panels.get(panelId);
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  /**
   * Select material
   */
  private selectMaterial(materialName: string): void {
    console.log('Material selected:', materialName);
    // This would be connected to the scene to change materials
  }

  /**
   * Update time display
   */
  private updateTimeDisplay(hours: number): void {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const timeDisplay = document.getElementById('time-display');
    if (timeDisplay) {
      timeDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Capture screenshot
   */
  private captureScreenshot(): void {
    console.log('Screenshot captured');
    // This would trigger canvas.toDataURL() and download
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyH':
          this.togglePanel('help-overlay');
          break;
        case 'KeyU':
          this.toggleVisibility();
          break;
      }
    });
  }

  /**
   * Toggle UI visibility
   */
  toggleVisibility(): void {
    this.isVisible = !this.isVisible;
    this.container.style.opacity = this.isVisible ? '1' : '0';
  }

  /**
   * Update info display
   */
  updateInfo(fps: number, cameraMode: string): void {
    const fpsCounter = document.getElementById('fps-counter');
    const cameraInfo = document.getElementById('camera-info');

    if (fpsCounter) fpsCounter.textContent = `FPS: ${fps.toFixed(0)}`;
    if (cameraInfo) cameraInfo.textContent = `Camera: ${cameraMode}`;
  }
}
