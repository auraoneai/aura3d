import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export interface NativeTemporalContext {
  source: { commit: string; fingerprint: string; [key: string]: unknown };
  now: number;
  bound: (reference: { path: string; sha256: string }) => boolean;
  readBytes: (path: string) => Uint8Array;
}
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Decode only the producer's lossless RGBA8/filter-zero PNG contract. */
export function decodeTemporalPixels(bytes: Uint8Array, width = 256, height = 256): Buffer {
  const png = Buffer.from(bytes);
  if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('PNG signature');
  let offset = 8, header = false, end = false;
  const compressed: Buffer[] = [];
  while (offset < png.length) {
    if (offset + 12 > png.length) throw Error('PNG truncated');
    const size = png.readUInt32BE(offset), finish = offset + 12 + size;
    if (finish > png.length) throw Error('PNG chunk bounds');
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + size);
    let crc = 0xffffffff;
    for (const byte of png.subarray(offset + 4, offset + 8 + size)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    if (((crc ^ 0xffffffff) >>> 0) !== png.readUInt32BE(offset + 8 + size)) throw Error('PNG CRC');
    if (type === 'IHDR') {
      if (header || offset !== 8 || size !== 13 || data.readUInt32BE(0) !== width || data.readUInt32BE(4) !== height || !data.subarray(8).equals(Buffer.from([8,6,0,0,0]))) throw Error('PNG dimensions/format');
      header = true;
    } else if (type === 'IDAT' && header && !end) compressed.push(data);
    else if (type === 'IEND' && header && size === 0 && finish === png.length) end = true;
    else throw Error('PNG unsupported chunk/order');
    offset = finish;
  }
  if (!end || !compressed.length) throw Error('PNG incomplete');
  const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: height * (width * 4 + 1) });
  if (raw.length !== height * (width * 4 + 1)) throw Error('PNG inflated size');
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) { if (raw[y * (width * 4 + 1)] !== 0) throw Error('PNG filter'); raw.copy(rgba, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)); }
  return rgba;
}
function difference(a: Buffer, b: Buffer, roi = false) {
  let sum = 0, count = 0, changed = 0, coverage = 0;
  for (let y = roi ? 70 : 0; y < (roi ? 186 : 256); y++) for (let x = roi ? 20 : 0; x < (roi ? 78 : 256); x++) {
    const i = (y * 256 + x) * 4;
    const d = (Math.abs(a[i]! - b[i]!) + Math.abs(a[i+1]! - b[i+1]!) + Math.abs(a[i+2]! - b[i+2]!)) / 765;
    sum += d; count++; if (d > .02) changed++;
    if ((a[i]! + a[i+1]! + a[i+2]!) / 765 > .5) coverage++;
  }
  return { mean: sum / count, changed, coverage: coverage / count };
}

/** Replays retained pixels and native execution metadata; booleans never establish quality. */
export function validateNativeTemporal(raw: unknown, context: NativeTemporalContext): string[] {
  const errors: string[] = [];
  const d = raw as any;
  if (!d || typeof d !== 'object') return ['missing R03 retained report'];
  const r = d.result, c = r?.checks;
  if (r?.status !== 'ready' || r.backend !== 'webgpu' || typeof r.adapter !== 'string' || !r.adapter.trim() || /swiftshader|llvmpipe|lavapipe|software|fallback|unknown|null/i.test(r.adapter) || r.error || !Array.isArray(r.postErrors) || r.postErrors.length || !Array.isArray(d.errors) || d.errors.length) return ['R03 native hardware result unavailable or errored'];
  if (!c || typeof c !== 'object') return ['missing R03 native counters'];
  for (const identity of [d.sourceStart, d.sourceEnd]) if (!identity || Object.entries(context.source).some(([key, value]) => JSON.stringify(identity[key]) !== JSON.stringify(value))) errors.push('R03 source identity mismatch');
  const start = Date.parse(d.startedAt), end = Date.parse(d.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end > context.now || context.now - start > 30 * 60 * 1000) errors.push('R03 capture timestamps invalid or stale');
  const command = d.command;
  if (!command || hash(JSON.stringify(command)) !== d.commandSha256 || !command.worker?.executable || !command.worker?.cwd || !Array.isArray(command.worker?.argv) || !Array.isArray(command.ancestors) || !command.ancestors.some((a: any) => a && integer(a.pid) && integer(a.parentPid) && typeof a.commandLine === 'string' && /playwright/.test(a.commandLine) && /webgpu-post-j2/.test(a.commandLine))) errors.push('R03 command ancestry missing or invalid');
  if (command?.invocationReceipt) {
    try { if (!context.bound(command.invocationReceipt) || hash(context.readBytes(command.invocationReceipt.path)) !== command.invocationReceipt.sha256) errors.push('R03 invocation receipt unbound'); } catch { errors.push('R03 invocation receipt unreadable'); }
  }
  if (!Array.isArray(d.frames) || d.frames.length !== 175) return [...errors, 'R03 requires all 175 retained sequence frames'];
  if (!['frames','nativeTaaPasses','nativeFxaaPasses','nativeTemporalBindings','nativeSubmissions','nativeRenderPipelinesCreated','nativeTextureReadbacks','hotPathReadbacks'].every(k => integer(c[k])) || c.frames !== 175 || c.nativeTaaPasses <= 100 || c.nativeFxaaPasses !== 32 || c.nativeTemporalBindings <= 150 || c.nativeSubmissions <= 175 || c.nativeRenderPipelinesCreated < 1 || c.nativeTextureReadbacks < 175 || c.hotPathReadbacks !== 0) errors.push('R03 native execution counters invalid');
  const images: Buffer[] = [];
  const paths = new Set<string>();
  for (let i = 0; i < 175; i++) {
    const f = d.frames[i], ref = f?.artifact;
    const expectedMode = i < 32 || i === 136 || i === 146 ? 'off' : i < 64 ? 'fxaa' : 'taa';
    const expectedX = i < 128 ? (i % 2 ? .3 : -.3) * 2 / 256 : [145,146,155,156,165,174].includes(i) ? .55 : -.55;
    if (!f || f.frame !== i + 1 || f.mode !== expectedMode || f.x !== expectedX || f.reset !== (i >= 96 && i < 128) || f.sceneKey !== (i === 165 ? 'r03-replacement' : 'r03-stable') || f.width !== 256 || f.height !== 256 || !integer(f.nativeSubmissions) || !integer(f.nativeTemporalBindings) || (i > 0 && (f.nativeSubmissions <= d.frames[i-1]?.nativeSubmissions || f.nativeTemporalBindings < d.frames[i-1]?.nativeTemporalBindings)) || (expectedMode === 'taa' && i > 0 && f.nativeTemporalBindings <= d.frames[i-1]?.nativeTemporalBindings)) errors.push(`R03 frame ${i+1} sequence/counters invalid`);
    try {
      if (!ref || ref.width !== 256 || ref.height !== 256 || ref.format !== 'rgba8' || ref.readbackOrigin !== 'top-left' || ref.pngOrigin !== 'top-left' || paths.has(ref.path) || !context.bound(ref)) throw Error('unbound or malformed reference');
      paths.add(ref.path);
      const bytes = context.readBytes(ref.path);
      if (hash(bytes) !== ref.sha256) throw Error('PNG hash');
      const rgba = decodeTemporalPixels(bytes);
      if (hash(rgba) !== ref.readbackSha256) throw Error('readback hash');
      images.push(rgba);
    } catch (e) { errors.push(`R03 frame ${i+1} invalid: ${String(e)}`); }
  }
  if (d.frames[174]?.nativeSubmissions !== c.nativeSubmissions || d.frames[174]?.nativeTemporalBindings !== c.nativeTemporalBindings) errors.push('R03 final counters disagree');
  if (images.length !== 175) return errors;
  const flicker = (offset: number) => { let total = 0; for (let i = 8; i < 32; i++) total += difference(images[offset+i-1]!, images[offset+i]!).mean; return total / 24; };
  const metrics: Record<string, number> = {
    offFlicker: flicker(0), fxaaFlicker: flicker(32), taaFlicker: flicker(64), resetFlicker: flicker(96),
    taaVsFxaaPixels: difference(images[63]!,images[95]!).changed,
    ghostMeanError: difference(images[145]!,images[146]!,true).mean,
    staleHistoryGhostMeanError: difference(images[144]!,images[146]!,true).mean,
    oldSilhouetteRoiCoverage: difference(images[136]!,images[136]!,true).coverage,
    newSilhouetteRoiCoverage: difference(images[146]!,images[146]!,true).coverage,
    cutMeanError: difference(images[156]!,images[155]!).mean,
    sceneReplacementMeanError: difference(images[156]!,images[165]!).mean,
    resizeMeanError: difference(images[156]!,images[174]!).mean,
  };
  for (const [key,value] of Object.entries(metrics)) if (typeof c[key] !== 'number' || !Number.isFinite(c[key]) || Math.abs(value-c[key]) > 1e-10) errors.push(`R03 retained pixels disagree with ${key}`);
  if (!(metrics.offFlicker! > .0001 && metrics.taaFlicker! < metrics.offFlicker! * .9 && metrics.taaFlicker! < metrics.resetFlicker! * .9 && metrics.taaVsFxaaPixels! > 20 && metrics.oldSilhouetteRoiCoverage! > .25 && metrics.newSilhouetteRoiCoverage! < .01 && metrics.staleHistoryGhostMeanError! > .1 && metrics.ghostMeanError! < .01 && metrics.cutMeanError! < 1/255 && metrics.sceneReplacementMeanError! < 1/255 && metrics.resizeMeanError! < 1/255)) errors.push('R03 recomputed native temporal pixel quality failed');
  return errors;
}
