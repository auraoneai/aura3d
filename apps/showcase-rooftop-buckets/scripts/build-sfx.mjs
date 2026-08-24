/**
 * Synthesizes CC0 WAV audio cues for Rooftop Buckets showcase.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SFX_DIR = resolve(__dirname, "../assets/sfx");
mkdirSync(SFX_DIR, { recursive: true });

const SAMPLE_RATE = 44100;
let noiseSeed = 0x524f4f46;
function deterministicNoise() {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0;
  return (noiseSeed / 0xffffffff) * 2 - 1;
}

function createWavHeader(numSamples, sampleRate = SAMPLE_RATE, channels = 1) {
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // "RIFF" chunk descriptor
  view.setUint8(0, "R".charCodeAt(0));
  view.setUint8(1, "I".charCodeAt(0));
  view.setUint8(2, "F".charCodeAt(0));
  view.setUint8(3, "F".charCodeAt(0));
  view.setUint32(4, 36 + dataSize, true);
  view.setUint8(8, "W".charCodeAt(0));
  view.setUint8(9, "A".charCodeAt(0));
  view.setUint8(10, "V".charCodeAt(0));
  view.setUint8(11, "E".charCodeAt(0));

  // "fmt " sub-chunk
  view.setUint8(12, "f".charCodeAt(0));
  view.setUint8(13, "m".charCodeAt(0));
  view.setUint8(14, "t".charCodeAt(0));
  view.setUint8(15, " ".charCodeAt(0));
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // BitsPerSample

  // "data" sub-chunk
  view.setUint8(36, "d".charCodeAt(0));
  view.setUint8(37, "a".charCodeAt(0));
  view.setUint8(38, "t".charCodeAt(0));
  view.setUint8(39, "a".charCodeAt(0));
  view.setUint32(40, dataSize, true);

  return buffer;
}

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const header = createWavHeader(numSamples);
  const data = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const fullBuffer = Buffer.concat([Buffer.from(header), Buffer.from(data.buffer)]);
  const outPath = resolve(SFX_DIR, filename);
  writeFileSync(outPath, fullBuffer);
  console.log(`Wrote ${filename} (${fullBuffer.length} bytes)`);
}

// 1. chargeTick.wav - 20ms quick crisp click
{
  const duration = 0.02;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 250);
    samples[i] = Math.sin(2 * Math.PI * 880 * t) * env * 0.4;
  }
  writeWav("chargeTick.wav", samples);
}

// 2. rimClank.wav - 250ms metallic rim resonance
{
  const duration = 0.25;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 18);
    const wave =
      0.5 * Math.sin(2 * Math.PI * 520 * t) +
      0.3 * Math.sin(2 * Math.PI * 1040 * t) +
      0.2 * Math.sin(2 * Math.PI * 1560 * t);
    samples[i] = wave * env * 0.8;
  }
  writeWav("rimClank.wav", samples);
}

// 3. boardThud.wav - 150ms backboard thud
{
  const duration = 0.15;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 30);
    const wave = 0.7 * Math.sin(2 * Math.PI * 95 * t) + 0.3 * Math.sin(2 * Math.PI * 190 * t);
    samples[i] = wave * env * 0.9;
  }
  writeWav("boardThud.wav", samples);
}

// 4. swish.wav - 200ms clean net swish noise
{
  const duration = 0.2;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin((t / duration) * Math.PI) * Math.exp(-t * 6);
    const noise = deterministicNoise();
    samples[i] = noise * env * 0.7;
  }
  writeWav("swish.wav", samples);
}

// 5. brickMiss.wav - 200ms dull clunk miss
{
  const duration = 0.2;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 25);
    const wave = 0.6 * Math.sin(2 * Math.PI * 220 * t) + 0.4 * deterministicNoise();
    samples[i] = wave * env * 0.7;
  }
  writeWav("brickMiss.wav", samples);
}

// 6. fireIgnite.wav - 600ms whoosh flare
{
  const duration = 0.6;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin((t / duration) * Math.PI);
    const freq = 120 + 380 * (t / duration);
    const synth = Math.sin(2 * Math.PI * freq * t);
    const noise = deterministicNoise();
    samples[i] = (synth * 0.5 + noise * 0.5) * env * 0.8;
  }
  writeWav("fireIgnite.wav", samples);
}

// 7. goldBall.wav - 500ms sparkle chime
{
  const duration = 0.5;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 8);
    const chimes =
      0.3 * Math.sin(2 * Math.PI * 1046.5 * t) + // C6
      0.3 * Math.sin(2 * Math.PI * 1318.5 * t) + // E6
      0.3 * Math.sin(2 * Math.PI * 1567.98 * t); // G6
    samples[i] = chimes * env * 0.75;
  }
  writeWav("goldBall.wav", samples);
}

// 8. heatAdvance.wav - 700ms triumphant fanfare
{
  const duration = 0.7;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const step = Math.floor(t / 0.15);
    const freqs = [440, 554.37, 659.25, 880]; // A major
    const f = freqs[Math.min(step, freqs.length - 1)];
    const env = Math.exp(-((t % 0.15) * 12));
    samples[i] = Math.sin(2 * Math.PI * f * t) * env * 0.7;
  }
  writeWav("heatAdvance.wav", samples);
}

// 9. buzzerFail.wav - 500ms retro buzzer
{
  const duration = 0.5;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.min(1, t / 0.02) * Math.max(0, 1 - t / duration);
    const s1 = Math.sin(2 * Math.PI * 164.81 * t);
    const s2 = Math.sin(2 * Math.PI * 174.61 * t);
    samples[i] = (s1 * 0.5 + s2 * 0.5) * env * 0.6;
  }
  writeWav("buzzerFail.wav", samples);
}

// 10. ambientRooftop.wav - 3.0s seamless dusk city ambiance pad (D-minor warm chord)
{
  const duration = 3.0;
  const N = Math.floor(duration * SAMPLE_RATE);
  const samples = new Float32Array(N);
  const chord = [146.83, 220.0, 293.66, 349.23]; // D3, A3, D4, F4
  for (let i = 0; i < N; i++) {
    const t = i / SAMPLE_RATE;
    let wave = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c];
      const lfo = 0.85 + 0.15 * Math.sin((2 * Math.PI * (t / duration) * 2) + c);
      wave += Math.sin(2 * Math.PI * f * t) * lfo * 0.22;
    }
    samples[i] = wave;
  }
  // Crossfade edges for click-free loop
  const fade = Math.floor(0.08 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    const factor = i / fade;
    samples[i] *= factor;
    samples[N - 1 - i] *= factor;
  }
  writeWav("ambientRooftop.wav", samples);
}
console.log("Rooftop Buckets audio cues generated successfully.");
