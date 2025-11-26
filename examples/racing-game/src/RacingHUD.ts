/**
 * RacingHUD.ts - Racing HUD
 *
 * Complete racing HUD with:
 * - Speedometer (analog + digital)
 * - Tachometer with redline
 * - Lap counter and timer
 * - Position indicator
 * - Lap times display
 * - Minimap with racer positions
 * - Nitro meter
 * - Race countdown
 */

import { RaceManager, RaceState, RacerData } from './RaceManager';
import { Vehicle } from './Vehicle';

export class RacingHUD {
  private container: HTMLElement;
  private raceManager: RaceManager;
  private playerVehicle: Vehicle;

  // HUD elements
  private speedometer: HTMLElement;
  private tachometer: HTMLElement;
  private lapCounter: HTMLElement;
  private positionDisplay: HTMLElement;
  private lapTimeDisplay: HTMLElement;
  private minimap: HTMLCanvasElement;
  private nitroMeter: HTMLElement;
  private countdownDisplay: HTMLElement;
  private leaderboard: HTMLElement;

  // Canvas context for minimap
  private minimapCtx: CanvasRenderingContext2D;

  constructor(containerId: string, raceManager: RaceManager, playerVehicle: Vehicle) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container #${containerId} not found`);
    }

    this.container = container;
    this.raceManager = raceManager;
    this.playerVehicle = playerVehicle;

    // Create HUD elements
    this.createHUD();

    // Initialize minimap
    this.minimap = document.getElementById('minimap') as HTMLCanvasElement;
    this.minimapCtx = this.minimap.getContext('2d')!;
  }

  /**
   * Create all HUD elements
   */
  private createHUD(): void {
    this.container.innerHTML = `
      <!-- Speedometer (Bottom Left) -->
      <div id="speed-display" style="
        position: absolute;
        bottom: 40px;
        left: 40px;
        width: 200px;
        height: 200px;
      ">
        <canvas id="speedometer" width="200" height="200" style="
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          border: 3px solid rgba(0, 212, 255, 0.5);
        "></canvas>
        <div id="speed-text" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 36px;
          font-weight: bold;
          color: #00d4ff;
          text-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
        ">0</div>
        <div style="
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
        ">KM/H</div>
      </div>

      <!-- Tachometer (Bottom Left, smaller) -->
      <div id="rpm-display" style="
        position: absolute;
        bottom: 50px;
        left: 260px;
        width: 120px;
        height: 120px;
      ">
        <canvas id="tachometer" width="120" height="120" style="
          background: rgba(0, 0, 0, 0.5);
          border-radius: 50%;
          border: 2px solid rgba(255, 100, 100, 0.5);
        "></canvas>
        <div id="rpm-text" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 20px;
          font-weight: bold;
          color: #ff6464;
        ">1000</div>
        <div style="
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          color: rgba(255, 255, 255, 0.7);
        ">RPM</div>
      </div>

      <!-- Nitro Meter (Bottom Center) -->
      <div id="nitro-container" style="
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
        width: 200px;
      ">
        <div style="font-size: 14px; color: #00d4ff; margin-bottom: 5px; text-align: center;">
          NITRO
        </div>
        <div style="
          width: 100%;
          height: 20px;
          background: rgba(0, 0, 0, 0.7);
          border: 2px solid rgba(0, 212, 255, 0.5);
          border-radius: 10px;
          overflow: hidden;
        ">
          <div id="nitro-bar" style="
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, #00d4ff, #00ffff);
            transition: width 0.1s;
            box-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
          "></div>
        </div>
      </div>

      <!-- Position & Lap (Top Left) -->
      <div style="
        position: absolute;
        top: 40px;
        left: 40px;
        background: rgba(0, 0, 0, 0.7);
        padding: 20px;
        border-radius: 10px;
        border: 2px solid rgba(0, 212, 255, 0.5);
        min-width: 200px;
      ">
        <div id="position-display" style="
          font-size: 48px;
          font-weight: bold;
          color: #00d4ff;
          text-shadow: 0 0 10px rgba(0, 212, 255, 0.8);
          margin-bottom: 10px;
        ">1st</div>
        <div id="lap-counter" style="
          font-size: 24px;
          color: white;
          margin-bottom: 10px;
        ">Lap 1/3</div>
        <div id="lap-time" style="
          font-size: 18px;
          color: rgba(255, 255, 255, 0.8);
        ">0:00.000</div>
        <div id="best-lap" style="
          font-size: 14px;
          color: #ffd700;
          margin-top: 5px;
        ">Best: --:--:---</div>
      </div>

      <!-- Minimap (Top Right) -->
      <div style="
        position: absolute;
        top: 40px;
        right: 40px;
      ">
        <canvas id="minimap" width="200" height="200" style="
          background: rgba(0, 0, 0, 0.7);
          border: 2px solid rgba(0, 212, 255, 0.5);
          border-radius: 10px;
        "></canvas>
      </div>

      <!-- Leaderboard (Right Side) -->
      <div id="leaderboard" style="
        position: absolute;
        top: 260px;
        right: 40px;
        background: rgba(0, 0, 0, 0.7);
        padding: 15px;
        border-radius: 10px;
        border: 2px solid rgba(0, 212, 255, 0.5);
        min-width: 250px;
        max-height: 300px;
        overflow-y: auto;
      ">
        <div style="
          font-size: 18px;
          font-weight: bold;
          color: #00d4ff;
          margin-bottom: 10px;
          text-align: center;
        ">LEADERBOARD</div>
        <div id="leaderboard-content"></div>
      </div>

      <!-- Countdown Display (Center) -->
      <div id="countdown-display" style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 120px;
        font-weight: bold;
        color: #00d4ff;
        text-shadow: 0 0 20px rgba(0, 212, 255, 1);
        display: none;
        animation: pulse 0.5s ease-in-out;
      ">3</div>
    `;

    // Get references
    this.speedometer = document.getElementById('speed-text')!;
    this.tachometer = document.getElementById('rpm-text')!;
    this.lapCounter = document.getElementById('lap-counter')!;
    this.positionDisplay = document.getElementById('position-display')!;
    this.lapTimeDisplay = document.getElementById('lap-time')!;
    this.nitroMeter = document.getElementById('nitro-bar')!;
    this.countdownDisplay = document.getElementById('countdown-display')!;
    this.leaderboard = document.getElementById('leaderboard-content')!;

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.2); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update HUD every frame
   */
  public update(deltaTime: number): void {
    const state = this.raceManager.getState();

    // Update based on race state
    if (state === RaceState.Countdown) {
      this.updateCountdown();
    } else if (state === RaceState.Racing) {
      this.hideCountdown();
      this.updateRacingHUD();
    }
  }

  /**
   * Update countdown display
   */
  private updateCountdown(): void {
    const countdown = this.raceManager.getCountdown();
    this.countdownDisplay.style.display = 'block';

    if (countdown > 0) {
      this.countdownDisplay.textContent = countdown.toString();
      this.countdownDisplay.style.color = '#ff6464';
    } else {
      this.countdownDisplay.textContent = 'GO!';
      this.countdownDisplay.style.color = '#00ff00';

      setTimeout(() => this.hideCountdown(), 1000);
    }
  }

  /**
   * Hide countdown display
   */
  private hideCountdown(): void {
    this.countdownDisplay.style.display = 'none';
  }

  /**
   * Update racing HUD elements
   */
  private updateRacingHUD(): void {
    const stats = this.playerVehicle.getStats();
    const playerRacer = this.raceManager.getPlayerRacer();

    if (!playerRacer) return;

    // Update speedometer
    this.updateSpeedometer(stats.speed);

    // Update tachometer
    this.updateTachometer(stats.rpm);

    // Update nitro meter
    this.updateNitroMeter(stats.nitro);

    // Update position
    this.updatePosition(playerRacer.position);

    // Update lap counter
    this.updateLapCounter(playerRacer);

    // Update lap time
    this.updateLapTime(playerRacer);

    // Update minimap
    this.updateMinimap();

    // Update leaderboard
    this.updateLeaderboard();
  }

  /**
   * Update speedometer display
   */
  private updateSpeedometer(speed: number): void {
    const speedValue = Math.round(speed);
    this.speedometer.textContent = speedValue.toString();

    // Draw analog gauge
    const canvas = document.getElementById('speedometer') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw gauge arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Draw speed arc
    const maxSpeed = 250;
    const speedAngle = 0.75 * Math.PI + (speed / maxSpeed) * 1.5 * Math.PI;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, speedAngle);
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Draw needle
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(speedAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius - 10, 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Update tachometer display
   */
  private updateTachometer(rpm: number): void {
    const rpmValue = Math.round(rpm);
    this.tachometer.textContent = rpmValue.toString();

    // Draw analog gauge
    const canvas = document.getElementById('tachometer') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 50;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw gauge arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Draw RPM arc
    const maxRPM = 8000;
    const redlineRPM = 7000;
    const rpmAngle = 0.75 * Math.PI + (rpm / maxRPM) * 1.5 * Math.PI;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, rpmAngle);
    ctx.strokeStyle = rpm > redlineRPM ? '#ff6464' : '#ffd700';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Draw redline marker
    const redlineAngle = 0.75 * Math.PI + (redlineRPM / maxRPM) * 1.5 * Math.PI;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(redlineAngle);
    ctx.beginPath();
    ctx.moveTo(radius - 15, 0);
    ctx.lineTo(radius + 5, 0);
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Update nitro meter
   */
  private updateNitroMeter(nitro: number): void {
    const percentage = Math.max(0, Math.min(100, nitro));
    this.nitroMeter.style.width = `${percentage}%`;

    // Change color when low
    if (percentage < 20) {
      this.nitroMeter.style.background = 'linear-gradient(90deg, #ff6464, #ff0000)';
    } else {
      this.nitroMeter.style.background = 'linear-gradient(90deg, #00d4ff, #00ffff)';
    }
  }

  /**
   * Update position display
   */
  private updatePosition(position: number): void {
    const suffix = ['st', 'nd', 'rd'][position - 1] || 'th';
    this.positionDisplay.textContent = `${position}${suffix}`;

    // Color based on position
    if (position === 1) {
      this.positionDisplay.style.color = '#ffd700'; // Gold
    } else if (position === 2) {
      this.positionDisplay.style.color = '#c0c0c0'; // Silver
    } else if (position === 3) {
      this.positionDisplay.style.color = '#cd7f32'; // Bronze
    } else {
      this.positionDisplay.style.color = '#00d4ff';
    }
  }

  /**
   * Update lap counter
   */
  private updateLapCounter(racer: RacerData): void {
    const trackInfo = this.raceManager['track'].getInfo();
    this.lapCounter.textContent = `Lap ${racer.currentLap}/${trackInfo.lapCount}`;
  }

  /**
   * Update lap time
   */
  private updateLapTime(racer: RacerData): void {
    const currentLapTime = racer.totalTime - racer.lapTimes.reduce((a, b) => a + b, 0);
    this.lapTimeDisplay.textContent = RaceManager.formatTime(currentLapTime);

    // Update best lap
    const bestLapElement = document.getElementById('best-lap')!;
    if (racer.bestLapTime < Infinity) {
      bestLapElement.textContent = `Best: ${RaceManager.formatTime(racer.bestLapTime)}`;
    }
  }

  /**
   * Update minimap
   */
  private updateMinimap(): void {
    const ctx = this.minimapCtx;
    const width = this.minimap.width;
    const height = this.minimap.height;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw track outline (simplified)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    // Draw racers
    const racers = this.raceManager.getRacers();
    racers.forEach(racer => {
      const pos = racer.vehicle.getStats().position;

      // Simple projection (you'd want proper track projection in real game)
      const x = width / 2 + (pos.x / 200) * 70;
      const y = height / 2 + (pos.z / 200) * 70;

      ctx.beginPath();
      ctx.arc(x, y, racer.isPlayer ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = racer.isPlayer ? '#00d4ff' : '#ff6464';
      ctx.fill();

      // Draw player arrow
      if (racer.isPlayer) {
        const rot = racer.vehicle.getStats().rotation;
        // Simple arrow
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x, y + 7);
        ctx.stroke();
      }
    });
  }

  /**
   * Update leaderboard
   */
  private updateLeaderboard(): void {
    const leaderboard = this.raceManager.getLeaderboard();
    let html = '';

    leaderboard.forEach((racer, index) => {
      const isPlayer = racer.isPlayer;
      const bgColor = isPlayer ? 'rgba(0, 212, 255, 0.2)' : 'transparent';

      html += `
        <div style="
          display: flex;
          justify-content: space-between;
          padding: 8px;
          margin-bottom: 5px;
          background: ${bgColor};
          border-radius: 5px;
          font-size: 14px;
        ">
          <span style="color: ${index === 0 ? '#ffd700' : 'white'}; font-weight: bold;">
            ${racer.position}. ${racer.name}
          </span>
          <span style="color: rgba(255, 255, 255, 0.7);">
            Lap ${racer.currentLap}
          </span>
        </div>
      `;
    });

    this.leaderboard.innerHTML = html;
  }

  /**
   * Show race results
   */
  public showResults(results: RacerData[]): void {
    // Create results overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 3000;
    `;

    let resultsHTML = '<div style="text-align: center; color: white;">';
    resultsHTML += '<h1 style="font-size: 48px; color: #00d4ff; margin-bottom: 30px;">RACE RESULTS</h1>';

    results.forEach((racer, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
      resultsHTML += `
        <div style="
          font-size: 24px;
          margin: 15px 0;
          padding: 15px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          ${racer.isPlayer ? 'border: 2px solid #00d4ff;' : ''}
        ">
          ${medal} ${racer.position}. ${racer.name} - ${RaceManager.formatTime(racer.totalTime)}
        </div>
      `;
    });

    resultsHTML += '<button id="restart-btn" style="margin-top: 30px; padding: 15px 40px; font-size: 20px; background: #00d4ff; border: none; border-radius: 10px; cursor: pointer;">RESTART</button>';
    resultsHTML += '</div>';

    overlay.innerHTML = resultsHTML;
    document.body.appendChild(overlay);

    // Add restart handler
    document.getElementById('restart-btn')!.addEventListener('click', () => {
      document.body.removeChild(overlay);
      location.reload();
    });
  }
}
