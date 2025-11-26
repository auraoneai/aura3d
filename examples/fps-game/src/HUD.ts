/**
 * Heads-Up Display (HUD)
 *
 * Features:
 * - Health bar with damage flash
 * - Ammo counter with magazine/reserve display
 * - Dynamic crosshair
 * - Damage direction indicators
 * - Kill feed
 * - Score display
 * - Wave counter
 * - Minimap (simplified)
 * - Message notifications
 */

interface Engine {
    // Simplified engine interface for HUD
}

/**
 * HUD data interface
 */
export interface HUDData {
    health: number;
    maxHealth: number;
    ammo: number;
    reserveAmmo: number;
    score: number;
    wave: number;
    enemiesRemaining: number;
}

/**
 * Damage indicator
 */
interface DamageIndicator {
    angle: number;
    intensity: number;
    time: number;
}

/**
 * Kill feed entry
 */
interface KillFeedEntry {
    message: string;
    time: number;
}

/**
 * HUD message
 */
interface HUDMessage {
    text: string;
    duration: number;
    startTime: number;
}

/**
 * HUD class for game UI
 */
export class HUD {
    private engine: Engine;

    // DOM elements
    private container: HTMLElement;
    private healthBar: HTMLElement;
    private healthText: HTMLElement;
    private ammoText: HTMLElement;
    private scoreText: HTMLElement;
    private waveText: HTMLElement;
    private crosshair: HTMLElement;
    private damageOverlay: HTMLElement;
    private killFeedContainer: HTMLElement;
    private messageContainer: HTMLElement;
    private minimapCanvas: HTMLCanvasElement;

    // State
    private damageIndicators: DamageIndicator[] = [];
    private killFeed: KillFeedEntry[] = [];
    private currentMessage: HUDMessage | null = null;
    private lastHealth = 100;

    // Animations
    private healthFlashTime = 0;
    private crosshairHitTime = 0;

    constructor(engine: Engine) {
        this.engine = engine;
    }

    /**
     * Initialize HUD
     */
    init(): void {
        this.createHUDElements();
        console.log('HUD initialized');
    }

    /**
     * Create all HUD DOM elements
     */
    private createHUDElements(): void {
        // Main container
        this.container = document.createElement('div');
        this.container.id = 'hud';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            font-family: 'Courier New', monospace;
            color: white;
            z-index: 100;
        `;

        // Health bar
        const healthContainer = document.createElement('div');
        healthContainer.style.cssText = `
            position: absolute;
            bottom: 30px;
            left: 30px;
        `;

        this.healthText = document.createElement('div');
        this.healthText.style.cssText = `
            font-size: 18px;
            margin-bottom: 5px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        `;
        this.healthText.textContent = 'HEALTH';

        const healthBarBg = document.createElement('div');
        healthBarBg.style.cssText = `
            width: 200px;
            height: 20px;
            background: rgba(0,0,0,0.5);
            border: 2px solid rgba(255,255,255,0.3);
            position: relative;
        `;

        this.healthBar = document.createElement('div');
        this.healthBar.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, #ff4444, #ff0000);
            transition: width 0.3s ease;
        `;

        healthBarBg.appendChild(this.healthBar);
        healthContainer.appendChild(this.healthText);
        healthContainer.appendChild(healthBarBg);

        // Ammo counter
        this.ammoText = document.createElement('div');
        this.ammoText.style.cssText = `
            position: absolute;
            bottom: 30px;
            right: 30px;
            font-size: 36px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        `;
        this.ammoText.textContent = '30 / 120';

        // Score
        this.scoreText = document.createElement('div');
        this.scoreText.style.cssText = `
            position: absolute;
            top: 30px;
            right: 30px;
            font-size: 24px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        `;
        this.scoreText.textContent = 'SCORE: 0';

        // Wave counter
        this.waveText = document.createElement('div');
        this.waveText.style.cssText = `
            position: absolute;
            top: 60px;
            right: 30px;
            font-size: 18px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        `;
        this.waveText.textContent = 'WAVE: 1';

        // Crosshair
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
        `;
        this.crosshair.innerHTML = `
            <div style="position: absolute; top: 50%; left: 0; width: 100%; height: 2px; background: rgba(255,255,255,0.8); transform: translateY(-50%);"></div>
            <div style="position: absolute; left: 50%; top: 0; height: 100%; width: 2px; background: rgba(255,255,255,0.8); transform: translateX(-50%);"></div>
        `;

        // Damage overlay
        this.damageOverlay = document.createElement('div');
        this.damageOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, transparent 30%, rgba(255,0,0,0.3));
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        `;

        // Kill feed
        this.killFeedContainer = document.createElement('div');
        this.killFeedContainer.style.cssText = `
            position: absolute;
            top: 100px;
            right: 30px;
            font-size: 14px;
            text-align: right;
        `;

        // Message container
        this.messageContainer = document.createElement('div');
        this.messageContainer.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            margin-top: -100px;
            font-size: 32px;
            font-weight: bold;
            text-shadow: 3px 3px 6px rgba(0,0,0,0.9);
            text-align: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        // Minimap
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.width = 150;
        this.minimapCanvas.height = 150;
        this.minimapCanvas.style.cssText = `
            position: absolute;
            top: 30px;
            left: 30px;
            border: 2px solid rgba(255,255,255,0.3);
            background: rgba(0,0,0,0.5);
        `;

        // Add all elements to container
        this.container.appendChild(healthContainer);
        this.container.appendChild(this.ammoText);
        this.container.appendChild(this.scoreText);
        this.container.appendChild(this.waveText);
        this.container.appendChild(this.crosshair);
        this.container.appendChild(this.damageOverlay);
        this.container.appendChild(this.killFeedContainer);
        this.container.appendChild(this.messageContainer);
        this.container.appendChild(this.minimapCanvas);

        // Add to document
        document.body.appendChild(this.container);
    }

    /**
     * Update HUD with game data
     */
    update(data: HUDData): void {
        // Update health
        const healthPercent = (data.health / data.maxHealth) * 100;
        this.healthBar.style.width = `${healthPercent}%`;
        this.healthText.textContent = `HEALTH: ${Math.ceil(data.health)}`;

        // Flash on damage
        if (data.health < this.lastHealth) {
            this.onDamageTaken();
        }
        this.lastHealth = data.health;

        // Change health bar color based on health
        if (healthPercent > 60) {
            this.healthBar.style.background = 'linear-gradient(90deg, #44ff44, #00ff00)';
        } else if (healthPercent > 30) {
            this.healthBar.style.background = 'linear-gradient(90deg, #ffff44, #ffaa00)';
        } else {
            this.healthBar.style.background = 'linear-gradient(90deg, #ff4444, #ff0000)';
        }

        // Update ammo
        this.ammoText.textContent = `${data.ammo} / ${data.reserveAmmo}`;

        // Low ammo warning
        if (data.ammo === 0) {
            this.ammoText.style.color = '#ff0000';
        } else if (data.ammo < 10) {
            this.ammoText.style.color = '#ffaa00';
        } else {
            this.ammoText.style.color = '#ffffff';
        }

        // Update score and wave
        this.scoreText.textContent = `SCORE: ${data.score}`;
        this.waveText.textContent = `WAVE: ${data.wave} | ENEMIES: ${data.enemiesRemaining}`;

        // Update damage indicators
        this.updateDamageIndicators();

        // Update kill feed
        this.updateKillFeed();

        // Update message
        this.updateMessage();

        // Update minimap
        this.updateMinimap();
    }

    /**
     * Handle damage taken
     */
    private onDamageTaken(): void {
        this.healthFlashTime = 0.3;
        this.damageOverlay.style.opacity = '1';

        setTimeout(() => {
            this.damageOverlay.style.opacity = '0';
        }, 200);
    }

    /**
     * Update damage direction indicators
     */
    private updateDamageIndicators(): void {
        // Update and remove old indicators
        this.damageIndicators = this.damageIndicators.filter(indicator => {
            indicator.time -= 0.016; // Assume ~60 FPS
            indicator.intensity *= 0.95;
            return indicator.time > 0;
        });
    }

    /**
     * Add damage indicator
     */
    addDamageIndicator(angle: number): void {
        this.damageIndicators.push({
            angle,
            intensity: 1.0,
            time: 1.0
        });
    }

    /**
     * Update kill feed
     */
    private updateKillFeed(): void {
        const now = Date.now();

        // Remove old entries
        this.killFeed = this.killFeed.filter(entry => now - entry.time < 5000);

        // Update display
        this.killFeedContainer.innerHTML = this.killFeed
            .slice(-5) // Show last 5 kills
            .map(entry => `<div style="margin: 5px 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${entry.message}</div>`)
            .join('');
    }

    /**
     * Add kill to feed
     */
    addKill(message: string): void {
        this.killFeed.push({
            message,
            time: Date.now()
        });
    }

    /**
     * Update message display
     */
    private updateMessage(): void {
        if (!this.currentMessage) return;

        const elapsed = Date.now() - this.currentMessage.startTime;

        if (elapsed >= this.currentMessage.duration) {
            this.currentMessage = null;
            this.messageContainer.style.opacity = '0';
        }
    }

    /**
     * Show message on screen
     */
    showMessage(text: string, duration: number): void {
        this.currentMessage = {
            text,
            duration,
            startTime: Date.now()
        };

        this.messageContainer.textContent = text;
        this.messageContainer.style.opacity = '1';

        // Fade out near the end
        setTimeout(() => {
            if (this.currentMessage && this.currentMessage.text === text) {
                this.messageContainer.style.opacity = '0';
            }
        }, duration - 300);
    }

    /**
     * Update minimap
     */
    private updateMinimap(): void {
        const ctx = this.minimapCanvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, 150, 150);

        // Draw player (center)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath();
        ctx.arc(75, 75, 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw player direction
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(75, 75);
        ctx.lineTo(75, 65);
        ctx.stroke();

        // Minimap shows player position and orientation
        // Enemy and objective markers can be added by extending this method
    }

    /**
     * Flash crosshair on hit
     */
    flashCrosshairHit(): void {
        this.crosshairHitTime = 0.2;
        this.crosshair.style.color = '#ff0000';

        setTimeout(() => {
            this.crosshair.style.color = '#ffffff';
        }, 200);
    }

    /**
     * Show reloading indicator
     */
    showReloading(): void {
        this.ammoText.textContent = 'RELOADING...';
    }

    /**
     * Hide HUD
     */
    hide(): void {
        this.container.style.display = 'none';
    }

    /**
     * Show HUD
     */
    show(): void {
        this.container.style.display = 'block';
    }
}
