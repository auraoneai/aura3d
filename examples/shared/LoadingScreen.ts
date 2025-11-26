/**
 * G3D 5.0 Examples - Loading Screen Component
 * Displays loading progress with tips and animations
 */

import { getRandomLoadingTip } from './utils';

export interface LoadingScreenConfig {
  backgroundColor?: string;
  logoText?: string;
  showTips?: boolean;
  fadeOutDuration?: number;
}

/**
 * Loading screen with progress tracking and tips
 */
export class LoadingScreen {
  private container: HTMLDivElement;
  private progressBar: HTMLDivElement;
  private progressText: HTMLDivElement;
  private tipText?: HTMLDivElement;
  private config: Required<LoadingScreenConfig>;
  private currentProgress: number = 0;
  private targetProgress: number = 0;
  private isVisible: boolean = true;

  constructor(config: LoadingScreenConfig = {}) {
    this.config = {
      backgroundColor: config.backgroundColor || 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      logoText: config.logoText || 'G3D 5.0',
      showTips: config.showTips !== false,
      fadeOutDuration: config.fadeOutDuration || 500,
    };

    this.container = this.createContainer();
    this.progressBar = this.createProgressBar();
    this.progressText = this.createProgressText();

    if (this.config.showTips) {
      this.tipText = this.createTipText();
      this.updateTip();
    }
  }

  /**
   * Creates the loading screen container
   */
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'loading-screen';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${this.config.backgroundColor};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      transition: opacity ${this.config.fadeOutDuration}ms ease;
    `;

    const content = document.createElement('div');
    content.className = 'loading-content';
    content.style.cssText = `
      text-align: center;
      max-width: 500px;
      padding: 20px;
    `;

    const logo = document.createElement('div');
    logo.className = 'loading-logo';
    logo.textContent = this.config.logoText;
    logo.style.cssText = `
      font-size: 4rem;
      font-weight: 700;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 2rem;
    `;

    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.cssText = `
      width: 60px;
      height: 60px;
      border: 4px solid rgba(102, 126, 234, 0.2);
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 2rem;
    `;

    content.appendChild(logo);
    content.appendChild(spinner);
    container.appendChild(content);
    document.body.appendChild(container);

    // Add keyframe animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    return container;
  }

  /**
   * Creates the progress bar element
   */
  private createProgressBar(): HTMLDivElement {
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      width: 300px;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
      margin: 0 auto 1rem;
    `;

    const progressBar = document.createElement('div');
    progressBar.className = 'loading-progress-bar';
    progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
      border-radius: 3px;
      transition: width 0.3s ease;
      width: 0%;
    `;

    progressContainer.appendChild(progressBar);
    this.container.querySelector('.loading-content')!.appendChild(progressContainer);

    return progressBar;
  }

  /**
   * Creates the progress text element
   */
  private createProgressText(): HTMLDivElement {
    const text = document.createElement('div');
    text.className = 'loading-text';
    text.textContent = 'Loading... 0%';
    text.style.cssText = `
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.95rem;
      margin-top: 0.5rem;
    `;

    this.container.querySelector('.loading-content')!.appendChild(text);
    return text;
  }

  /**
   * Creates the tip text element
   */
  private createTipText(): HTMLDivElement {
    const tip = document.createElement('div');
    tip.className = 'loading-tip';
    tip.style.cssText = `
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.85rem;
      font-style: italic;
      margin-top: 1.5rem;
      max-width: 400px;
    `;

    this.container.querySelector('.loading-content')!.appendChild(tip);
    return tip;
  }

  /**
   * Updates the loading tip
   */
  private updateTip(): void {
    if (this.tipText) {
      this.tipText.textContent = `Tip: ${getRandomLoadingTip()}`;
    }
  }

  /**
   * Sets the loading progress (0-1)
   */
  setProgress(progress: number, message?: string): void {
    this.targetProgress = Math.max(0, Math.min(1, progress));
    this.animateProgress();

    if (message) {
      this.progressText.textContent = message;
    } else {
      const percent = Math.round(this.targetProgress * 100);
      this.progressText.textContent = `Loading... ${percent}%`;
    }

    // Update tip occasionally
    if (this.config.showTips && Math.random() < 0.1) {
      this.updateTip();
    }
  }

  /**
   * Animates progress bar smoothly
   */
  private animateProgress(): void {
    const animate = () => {
      const delta = this.targetProgress - this.currentProgress;
      if (Math.abs(delta) < 0.001) {
        this.currentProgress = this.targetProgress;
      } else {
        this.currentProgress += delta * 0.1;
      }

      this.progressBar.style.width = `${this.currentProgress * 100}%`;

      if (Math.abs(delta) >= 0.001) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  /**
   * Shows a loading message
   */
  showMessage(message: string): void {
    this.progressText.textContent = message;
  }

  /**
   * Completes loading and hides the screen
   */
  async complete(): Promise<void> {
    this.setProgress(1, 'Complete!');

    await new Promise((resolve) => setTimeout(resolve, 300));

    this.container.style.opacity = '0';

    await new Promise((resolve) => setTimeout(resolve, this.config.fadeOutDuration));

    this.hide();
  }

  /**
   * Shows the loading screen
   */
  show(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.container.style.opacity = '1';
  }

  /**
   * Hides the loading screen
   */
  hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
  }

  /**
   * Checks if loading screen is visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Destroys the loading screen
   */
  destroy(): void {
    this.container.remove();
  }
}

/**
 * Creates and manages a loading sequence
 */
export class LoadingSequence {
  private screen: LoadingScreen;
  private tasks: Array<{ name: string; weight: number; fn: () => Promise<void> }> = [];
  private totalWeight: number = 0;
  private completedWeight: number = 0;

  constructor(config?: LoadingScreenConfig) {
    this.screen = new LoadingScreen(config);
  }

  /**
   * Adds a task to the loading sequence
   */
  addTask(name: string, fn: () => Promise<void>, weight: number = 1): void {
    this.tasks.push({ name, weight, fn });
    this.totalWeight += weight;
  }

  /**
   * Executes all loading tasks
   */
  async execute(): Promise<void> {
    this.completedWeight = 0;

    for (const task of this.tasks) {
      this.screen.showMessage(`Loading ${task.name}...`);

      try {
        await task.fn();
        this.completedWeight += task.weight;
        this.screen.setProgress(this.completedWeight / this.totalWeight);
      } catch (error) {
        console.error(`Failed to load ${task.name}:`, error);
        throw error;
      }
    }

    await this.screen.complete();
  }

  /**
   * Gets the loading screen instance
   */
  getScreen(): LoadingScreen {
    return this.screen;
  }

  /**
   * Destroys the loading sequence
   */
  destroy(): void {
    this.screen.destroy();
  }
}
