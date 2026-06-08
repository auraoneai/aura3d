import { buildProductConfiguratorScene } from '../../../apps/v9-advanced-examples-gallery/src/productConfiguratorScene';
import { productConfiguratorPolicy } from '../../../apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy';
const scene = buildProductConfiguratorScene();
const canvas = document.getElementById('product-canvas');
const ctx = canvas.getContext('2d');
const swatches = document.getElementById('paint-swatches');
const materials = document.getElementById('materials');
const status = document.getElementById('status');
const explodeToggle = document.getElementById('explode-toggle');
const lightingToggle = document.getElementById('lighting-toggle');
const paintOptions = [
    { name: 'Redline', body: '#bb1218', shadow: '#72070d', highlight: '#ff6b5b' },
    { name: 'Graphite', body: '#414852', shadow: '#20242a', highlight: '#9aa3ad' },
    { name: 'Arctic', body: '#d9e2ea', shadow: '#7c8792', highlight: '#ffffff' },
    { name: 'Cobalt', body: '#1554b7', shadow: '#082a66', highlight: '#66a2ff' },
    { name: 'Solar', body: '#e6a21a', shadow: '#83540b', highlight: '#ffd978' },
];
let activePaint = paintOptions[0];
let exploded = false;
let rimLighting = true;
let lastTime = 0;
function resize() {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    ctx?.setTransform(scale, 0, 0, scale, 0, 0);
}
function drawRoundedRect(x, y, width, height, radius, fill) {
    if (!ctx)
        return;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
}
function drawWheel(x, y, radius) {
    if (!ctx)
        return;
    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.fillStyle = '#15171c';
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ccd2da';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.64, radius * 0.64, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b313a';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.28, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = Math.max(1, radius * 0.055);
    for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8 + lastTime * 0.0004;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * radius * 0.57, y + Math.sin(angle) * radius * 0.57);
        ctx.stroke();
    }
}
function polygon(points, fill, stroke) {
    if (!ctx)
        return;
    ctx.beginPath();
    points.forEach(([x, y], index) => {
        if (index === 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
function drawCar(width, height) {
    if (!ctx)
        return;
    const centerX = width * 0.5;
    const baseY = height * 0.64;
    const carW = Math.min(width * 0.72, height * 1.45);
    const carH = carW * 0.34;
    const left = centerX - carW / 2;
    const right = centerX + carW / 2;
    const top = baseY - carH;
    const explodeOffset = exploded ? carH * 0.16 : 0;
    const bodyGradient = ctx.createLinearGradient(0, top, 0, baseY);
    bodyGradient.addColorStop(0, activePaint.highlight);
    bodyGradient.addColorStop(0.25, activePaint.body);
    bodyGradient.addColorStop(1, activePaint.shadow);
    ctx.save();
    ctx.shadowBlur = 28;
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(centerX, baseY + carH * 0.32, carW * 0.43, carH * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    polygon([
        [left + carW * 0.03, baseY - carH * 0.20],
        [left + carW * 0.16, baseY - carH * 0.47],
        [left + carW * 0.33, baseY - carH * 0.58],
        [right - carW * 0.19, baseY - carH * 0.53],
        [right - carW * 0.07, baseY - carH * 0.31],
        [right, baseY - carH * 0.07],
        [right - carW * 0.10, baseY],
        [left + carW * 0.11, baseY],
    ], bodyGradient, activePaint.shadow);
    polygon([
        [left + carW * 0.28, top + explodeOffset],
        [left + carW * 0.41, top - carH * 0.30 + explodeOffset],
        [left + carW * 0.62, top - carH * 0.32 + explodeOffset],
        [left + carW * 0.76, top + explodeOffset],
    ], activePaint.body, activePaint.shadow);
    const glassGradient = ctx.createLinearGradient(0, top - carH * 0.25, 0, top + carH * 0.04);
    glassGradient.addColorStop(0, '#7fd4f6');
    glassGradient.addColorStop(1, '#123247');
    polygon([
        [left + carW * 0.37, top - carH * 0.02 + explodeOffset],
        [left + carW * 0.44, top - carH * 0.22 + explodeOffset],
        [left + carW * 0.58, top - carH * 0.23 + explodeOffset],
        [left + carW * 0.69, top - carH * 0.02 + explodeOffset],
    ], glassGradient, '#08121f');
    polygon([
        [left + carW * 0.53, top - carH * 0.23 + explodeOffset],
        [left + carW * 0.61, top - carH * 0.23 + explodeOffset],
        [left + carW * 0.69, top - carH * 0.02 + explodeOffset],
        [left + carW * 0.55, top - carH * 0.02 + explodeOffset],
    ], '#0c1722');
    ctx.strokeStyle = rimLighting ? '#ffd98c' : '#cbd5e1';
    ctx.lineWidth = Math.max(2, carW * 0.006);
    ctx.beginPath();
    ctx.moveTo(left + carW * 0.18, baseY - carH * 0.40);
    ctx.lineTo(right - carW * 0.12, baseY - carH * 0.36);
    ctx.stroke();
    ctx.strokeStyle = '#d8d2bb';
    ctx.beginPath();
    ctx.moveTo(left + carW * 0.12, baseY - carH * 0.02);
    ctx.lineTo(right - carW * 0.11, baseY - carH * 0.02);
    ctx.stroke();
    drawWheel(left + carW * 0.30, baseY, carH * 0.18);
    drawWheel(left + carW * 0.75, baseY, carH * 0.18);
    ctx.fillStyle = '#ffe59a';
    drawRoundedRect(right - carW * 0.15, baseY - carH * 0.36, carW * 0.045, carH * 0.075, 2, '#ffe59a');
    drawRoundedRect(left + carW * 0.03, baseY - carH * 0.32, carW * 0.035, carH * 0.058, 2, '#ff7060');
    if (exploded) {
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.54)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1;
        for (const role of scene.materialRoles) {
            const index = scene.materialRoles.indexOf(role);
            const y = top + index * 17 - 30;
            ctx.beginPath();
            ctx.moveTo(left - 32, y);
            ctx.lineTo(left + carW * 0.16, baseY - carH * 0.42 + index * 3);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
}
function drawStudio(width, height) {
    if (!ctx)
        return;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#20252e');
    gradient.addColorStop(0.58, '#151922');
    gradient.addColorStop(1, '#0e1117');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const floor = ctx.createLinearGradient(0, height * 0.68, 0, height);
    floor.addColorStop(0, '#2e333b');
    floor.addColorStop(1, '#161a20');
    ctx.fillStyle = floor;
    ctx.fillRect(0, height * 0.68, width, height * 0.32);
    if (rimLighting) {
        const beam = ctx.createRadialGradient(width * 0.52, height * 0.42, 20, width * 0.52, height * 0.42, width * 0.42);
        beam.addColorStop(0, 'rgba(255,255,255,0.11)');
        beam.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = beam;
        ctx.fillRect(0, 0, width, height);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    for (let i = 0; i < 9; i += 1) {
        drawRoundedRect(width * 0.08, height * (0.13 + i * 0.033), Math.max(18, width * 0.027), Math.max(4, height * 0.008), 1, 'rgba(255,255,255,0.42)');
    }
}
function render(time) {
    if (!ctx)
        return;
    lastTime = time;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawStudio(rect.width, rect.height);
    drawCar(rect.width, rect.height);
    requestAnimationFrame(render);
}
function renderControls() {
    swatches.innerHTML = '';
    for (const paint of paintOptions) {
        const button = document.createElement('button');
        button.className = `swatch${paint === activePaint ? ' active' : ''}`;
        button.style.background = `linear-gradient(135deg, ${paint.highlight}, ${paint.body} 55%, ${paint.shadow})`;
        button.type = 'button';
        button.title = paint.name;
        button.addEventListener('click', () => {
            activePaint = paint;
            renderControls();
        });
        swatches.appendChild(button);
    }
    materials.innerHTML = '';
    for (const role of productConfiguratorPolicy.allowedControlTargets) {
        const item = document.createElement('div');
        item.className = 'material';
        item.innerHTML = `<strong>${role.control}</strong><small>${role.sourceMaterial}</small>`;
        materials.appendChild(item);
    }
    const roleCount = scene.materialRoles.filter((role) => role.currentSource === 'original-car-glb-fixture').length;
    status.textContent = `${scene.heroAsset.id} | ${roleCount} material roles | hero-only stage`;
}
explodeToggle.addEventListener('click', () => {
    exploded = !exploded;
    explodeToggle.dataset.active = String(exploded);
});
lightingToggle.addEventListener('click', () => {
    rimLighting = !rimLighting;
    lightingToggle.dataset.active = String(rimLighting);
});
window.addEventListener('resize', resize);
resize();
renderControls();
requestAnimationFrame(render);
//# sourceMappingURL=main.js.map