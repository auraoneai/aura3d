import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Content-keyed memo for PNG analysis.
 *
 * ## Why this is keyed on bytes rather than on path
 *
 * Release and visual-QA tooling analyses the *same* retained frames repeatedly: `validateGameVisualQa` reads the
 * composed frame twice with two different analyses plus desktop and mobile, and callers invoke it several times in
 * one process while walking progressive certification states. That is 1.3M pixels per frame per pass, and it made
 * `showcase-game-release-gates` fail on a 5s timeout under full-suite load -- a load-only failure, which the brief
 * requires be diagnosed rather than retried.
 *
 * Keying on `path` + `mtime` would reintroduce exactly the staleness class this repository exists to prevent: a
 * producer that rewrites a frame within the same millisecond would serve a stale measurement. The key is therefore
 * the SHA-256 of the actual bytes plus the analysis name and crop. Hashing 1.1MB costs a few milliseconds against
 * ~100ms to decode and scan it, and it is impossible for identical bytes with an identical crop to have a different
 * correct answer.
 */
const analysisCache = new Map();
const ANALYSIS_CACHE_LIMIT = 64;

function memoizeAnalysis(name, buffer, crop, compute) {
  const key = `${name}|${createHash("sha256").update(buffer).digest("hex")}|${crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : "full"}`;
  const cached = analysisCache.get(key);
  // Return a copy: callers spread and extend these records, and a shared mutable object would leak between them.
  if (cached) return { ...cached, crop: { ...cached.crop } };
  const value = compute();
  if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) analysisCache.delete(analysisCache.keys().next().value);
  analysisCache.set(key, value);
  return { ...value, crop: { ...value.crop } };
}

export function readPngForegroundMetrics(path, crop) {
  const buffer = readFileSync(path);
  return memoizeAnalysis("foreground", buffer, crop, () => analyzeForegroundPng(buffer, crop));
}

export function readPngVisualCompositionMetrics(path, crop) {
  const buffer = readFileSync(path);
  return memoizeAnalysis("visual-composition", buffer, crop, () => analyzeVisualCompositionPng(buffer, crop));
}

/**
 * Measure flat, unbroken colour dominance in a retained frame.
 *
 * ## Why this is a separate check rather than part of composition metrics
 *
 * `analyzeVisualCompositionPng` measures the frame relative to its *background colour*: it answers "how
 * much of this frame is not-background". That cannot see the defect Skyline actually has. An expanse of
 * flat sky is background by definition, so a frame can pass every coverage, edge and balance budget while
 * still being mostly two flat washes -- which is precisely how "excessive empty sky" survived a green
 * visual-QA report.
 *
 * This measures the opposite property: how concentrated the frame is into its largest quantised colour
 * buckets. `dominantBucketFraction` is the single largest wash (typically sky), and `flatFraction` the two
 * largest (sky plus ground). Both are independent of what the tool considers "background", so an
 * empty-sky regression is detectable.
 *
 * Quantisation matches `measureFlatRegionFraction` in `@aura3d/engine`'s composition layer (4-bit shift
 * per channel) so a route can plan against the same measure the gate enforces.
 */
export function readPngFlatRegionMetrics(path, crop, quantiseBits = 4) {
  const image = decodePng(readFileSync(path));
  const resolved = resolveCrop(image, crop);
  const shift = Math.max(0, Math.min(7, quantiseBits));
  // Dense histogram over the quantised space; see the note on `flatCounts` in analyzeVisualCompositionPng.
  const perChannel = 1 << (8 - shift);
  const counts = new Uint32Array(perChannel * perChannel * perChannel);
  for (let y = resolved.y; y < resolved.y + resolved.height; y += 1) {
    for (let x = resolved.x; x < resolved.x + resolved.width; x += 1) {
      const pixel = pixelAt(image, x, y);
      counts[((pixel.r >> shift) * perChannel + (pixel.g >> shift)) * perChannel + (pixel.b >> shift)] += 1;
    }
  }
  let top = 0;
  let second = 0;
  let distinct = 0;
  for (const count of counts) {
    if (count === 0) continue;
    distinct += 1;
    if (count > top) {
      second = top;
      top = count;
    } else if (count > second) {
      second = count;
    }
  }
  const total = Math.max(1, resolved.width * resolved.height);
  return {
    width: image.width,
    height: image.height,
    crop: resolved,
    quantiseBits: shift,
    dominantBucketFraction: ratio(top, total),
    flatFraction: ratio(top + second, total),
    distinctBuckets: distinct
  };
}

export function readPngRenderedProbeMetrics(path) {
  const decoded = decodePng(readFileSync(path));
  let nonBlankPixels = 0;
  const colorBuckets = new Set();
  for (let offset = 0; offset < decoded.pixels.length; offset += decoded.channels) {
    const red = decoded.pixels[offset] ?? 0;
    const green = decoded.pixels[offset + 1] ?? 0;
    const blue = decoded.pixels[offset + 2] ?? 0;
    const alpha = decoded.channels === 4 ? decoded.pixels[offset + 3] ?? 255 : 255;
    if (alpha > 8 && (red > 8 || green > 8 || blue > 8)) {
      nonBlankPixels += 1;
      colorBuckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
    }
  }
  return {
    width: decoded.width,
    height: decoded.height,
    nonBlankPixels,
    colorBuckets: colorBuckets.size
  };
}


export function readPngDifferenceMetrics(visiblePath, hiddenPath, cropInput, channelThreshold = 12) {
  const visibleBytes = readFileSync(visiblePath);
  const hiddenBytes = readFileSync(hiddenPath);
  return memoizeAnalysis(
    `difference:${channelThreshold}:${createHash("sha256").update(hiddenBytes).digest("hex")}`,
    visibleBytes,
    cropInput,
    () => computePngDifferenceMetrics(visibleBytes, hiddenBytes, cropInput, channelThreshold)
  );
}

function computePngDifferenceMetrics(visibleBytes, hiddenBytes, cropInput, channelThreshold) {
  const first = decodePng(visibleBytes);
  const second = decodePng(hiddenBytes);
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error("PNG dimensions must match for subject difference metrics.");
  }
  const crop = resolveCrop(first, cropInput);
  let nonBlankPixels = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  const colorBuckets = new Set();
  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    for (let x = crop.x; x < crop.x + crop.width; x += 1) {
      const a = pixelAt(first, x, y);
      const b = pixelAt(second, x, y);
      const delta = (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 3;
      if (delta < channelThreshold) continue;
      nonBlankPixels += 1;
      colorBuckets.add(`${a.r >> 4}:${a.g >> 4}:${a.b >> 4}`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const foregroundBounds = nonBlankPixels > 0
    ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : undefined;
  const clipped = foregroundBounds ? isBoundsClipped(foregroundBounds, crop) : false;
  const nonBackgroundRatio = ratio(nonBlankPixels, crop.width * crop.height);
  const foregroundAreaRatio = foregroundBounds
    ? ratio(foregroundBounds.width * foregroundBounds.height, crop.width * crop.height)
    : 0;
  const readabilityScore = Math.round(
    Math.min(35, nonBackgroundRatio * 700) +
    Math.min(25, colorBuckets.size) +
    Math.min(25, foregroundAreaRatio * 500) +
    (clipped ? 0 : 15)
  );
  return {
    width: first.width,
    height: first.height,
    crop,
    nonBlankPixels,
    colorBuckets: colorBuckets.size,
    ...(foregroundBounds ? { foregroundBounds } : {}),
    clipped,
    nonBackgroundRatio,
    foregroundAreaRatio,
    readabilityScore
  };
}

function analyzeForegroundPng(buffer, cropInput) {
  const image = decodePng(buffer);
  const crop = resolveCrop(image, cropInput);
  const rowBackground = perRowBackgroundColors(image, crop);
  const mask = new Uint8Array(crop.width * crop.height);

  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    const localY = y - crop.y;
    const backgroundR = rowBackground[localY * 3];
    const backgroundG = rowBackground[localY * 3 + 1];
    const backgroundB = rowBackground[localY * 3 + 2];
    for (let x = crop.x; x < crop.x + crop.width; x += 1) {
      const pixel = pixelAt(image, x, y);
      const backgroundDistance = Math.abs(pixel.r - backgroundR) + Math.abs(pixel.g - backgroundG) + Math.abs(pixel.b - backgroundB);
      const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
      if (pixel.a <= 8 || backgroundDistance <= 30 || luma <= 7) continue;
      mask[localY * crop.width + (x - crop.x)] = 1;
    }
  }

  const component = selectForegroundComponent(image, crop, mask);
  const foregroundBounds = component?.foregroundBounds;
  const nonBlankPixels = component?.nonBlankPixels ?? 0;
  const colorBuckets = component?.colorBuckets ?? 0;
  const clipped = component?.clipped ?? false;
  const nonBackgroundRatio = ratio(nonBlankPixels, crop.width * crop.height);
  const foregroundAreaRatio = foregroundBounds
    ? ratio(foregroundBounds.width * foregroundBounds.height, crop.width * crop.height)
    : 0;
  const readabilityScore = Math.round(
    Math.min(35, nonBackgroundRatio * 700) +
    Math.min(25, colorBuckets) +
    Math.min(25, foregroundAreaRatio * 500) +
    (clipped ? 0 : 15)
  );

  return {
    width: image.width,
    height: image.height,
    crop,
    nonBlankPixels,
    colorBuckets,
    ...(foregroundBounds ? { foregroundBounds } : {}),
    clipped,
    nonBackgroundRatio,
    foregroundAreaRatio,
    readabilityScore
  };
}

function analyzeVisualCompositionPng(buffer, cropInput) {
  const image = decodePng(buffer);
  const crop = resolveCrop(image, cropInput);
  const rowBackground = perRowBackgroundColors(image, crop);
  const mask = new Uint8Array(crop.width * crop.height);
  let foregroundPixels = 0;
  let edgeForegroundPixels = 0;
  const edgeWidth = Math.max(4, Math.floor(Math.min(crop.width, crop.height) * 0.06));
  /*
   * Flat-region buckets are accumulated in this same pass.
   *
   * Measuring them via a separate `readPngFlatRegionMetrics` call decoded and re-scanned every frame a
   * second time. On the visual-QA path that is three frames per route (composed, desktop, mobile) and
   * pushed `showcase-route-gates` past its 20s timeout. The two measurements need the same pixels, so
   * they share the traversal.
   */
  /*
   * Fixed 4096-entry histogram rather than a Map.
   *
   * 4-bit-per-channel quantisation has exactly 2^12 possible buckets, so the histogram is small and dense.
   * A per-pixel `Map.set` over 1.3M pixels x 3 frames per route was measurably slow enough to push
   * `showcase-game-release-gates` past its 5s timeout under full-suite load -- a load-only failure, which is
   * the class that must be diagnosed rather than retried.
   */
  const flatCounts = new Uint32Array(4096);
  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    const localRow = y - crop.y;
    const backgroundR = rowBackground[localRow * 3];
    const backgroundG = rowBackground[localRow * 3 + 1];
    const backgroundB = rowBackground[localRow * 3 + 2];
    for (let x = crop.x; x < crop.x + crop.width; x += 1) {
      const pixel = pixelAt(image, x, y);
      flatCounts[(((pixel.r >> 4) << 8) | ((pixel.g >> 4) << 4) | (pixel.b >> 4)) & 0xfff] += 1;
      const distance = Math.abs(pixel.r - backgroundR) +
        Math.abs(pixel.g - backgroundG) +
        Math.abs(pixel.b - backgroundB);
      const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
      if (pixel.a <= 8 || distance <= 30 || luma <= 7) continue;
      const localX = x - crop.x;
      const localY = y - crop.y;
      mask[localY * crop.width + localX] = 1;
      foregroundPixels += 1;
      if (localX < edgeWidth || localY < edgeWidth ||
          localX >= crop.width - edgeWidth || localY >= crop.height - edgeWidth) {
        edgeForegroundPixels += 1;
      }
    }
  }
  // Only the two largest buckets and the occupied-bucket count are needed, so scan rather than sort.
  let flatTop = 0;
  let flatSecond = 0;
  let flatDistinct = 0;
  for (const count of flatCounts) {
    if (count === 0) continue;
    flatDistinct += 1;
    if (count > flatTop) {
      flatSecond = flatTop;
      flatTop = count;
    } else if (count > flatSecond) {
      flatSecond = count;
    }
  }
  const flatTotal = Math.max(1, crop.width * crop.height);
  const component = selectForegroundComponent(image, crop, mask);
  const cropArea = crop.width * crop.height;
  const largestComponentAreaRatio = component
    ? ratio(component.foregroundBounds.width * component.foregroundBounds.height, cropArea)
    : 0;
  const foregroundCoverageRatio = ratio(foregroundPixels, cropArea);
  return {
    width: image.width,
    height: image.height,
    crop,
    foregroundPixels,
    foregroundCoverageRatio,
    backgroundCoverageRatio: Number((1 - foregroundCoverageRatio).toFixed(4)),
    edgeOccupancyRatio: ratio(edgeForegroundPixels, Math.max(1, foregroundPixels)),
    largestComponentAreaRatio,
    foregroundBounds: component?.foregroundBounds,
    clipped: component?.clipped ?? false,
    // Same-pass flat-region measurement; see the comment on `flatCounts` above.
    quantiseBits: 4,
    dominantBucketFraction: ratio(flatTop, flatTotal),
    flatFraction: ratio(flatTop + flatSecond, flatTotal),
    distinctBuckets: flatDistinct
  };
}

function selectForegroundComponent(image, crop, mask) {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components = [];
  const minComponentPixels = Math.max(40, Math.floor(mask.length * 0.00004));

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue;
    let stackLength = 1;
    stack[0] = start;
    visited[start] = 1;
    let nonBlankPixels = 0;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = -1;
    let maxY = -1;
    const buckets = new Set();

    while (stackLength > 0) {
      const index = stack[--stackLength] ?? 0;
      const localX = index % crop.width;
      const localY = Math.floor(index / crop.width);
      const x = crop.x + localX;
      const y = crop.y + localY;
      const pixel = pixelAt(image, x, y);

      nonBlankPixels += 1;
      buckets.add(`${pixel.r >> 4}:${pixel.g >> 4}:${pixel.b >> 4}`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (localX > 0) stackLength = pushMaskNeighbor(index - 1, mask, visited, stack, stackLength);
      if (localX + 1 < crop.width) stackLength = pushMaskNeighbor(index + 1, mask, visited, stack, stackLength);
      if (localY > 0) stackLength = pushMaskNeighbor(index - crop.width, mask, visited, stack, stackLength);
      if (localY + 1 < crop.height) stackLength = pushMaskNeighbor(index + crop.width, mask, visited, stack, stackLength);
    }

    if (nonBlankPixels < minComponentPixels) continue;
    const foregroundBounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    components.push({
      nonBlankPixels,
      colorBuckets: buckets.size,
      foregroundBounds,
      clipped: isBoundsClipped(foregroundBounds, crop)
    });
  }

  if (components.length === 0) return undefined;
  const prominentThreshold = Math.max(500, Math.floor(mask.length * 0.0005));
  const nonClipped = components.filter((component) => !component.clipped && component.nonBlankPixels >= prominentThreshold);
  const pool = nonClipped.length > 0 ? nonClipped : components;
  return pool.sort((left, right) => componentScore(right, crop) - componentScore(left, crop))[0];
}

function pushMaskNeighbor(index, mask, visited, stack, stackLength) {
  if (mask[index] === 1 && visited[index] !== 1) {
    visited[index] = 1;
    stack[stackLength] = index;
    return stackLength + 1;
  }
  return stackLength;
}

function isBoundsClipped(bounds, crop) {
  return bounds.x <= crop.x + 2 ||
    bounds.y <= crop.y + 2 ||
    bounds.x + bounds.width >= crop.x + crop.width - 2 ||
    bounds.y + bounds.height >= crop.y + crop.height - 2;
}

function componentScore(component, crop) {
  const cropArea = Math.max(1, crop.width * crop.height);
  const bounds = component.foregroundBounds;
  const boundsArea = Math.max(1, bounds.width * bounds.height);
  const cropCenterX = crop.x + crop.width / 2;
  const cropCenterY = crop.y + crop.height / 2;
  const componentCenterX = bounds.x + bounds.width / 2;
  const componentCenterY = bounds.y + bounds.height / 2;
  const maxDistance = Math.max(1, Math.hypot(crop.width / 2, crop.height / 2));
  const distance = Math.hypot(componentCenterX - cropCenterX, componentCenterY - cropCenterY);
  const centrality = 1 - Math.min(1, distance / maxDistance);
  const size = Math.min(1, component.nonBlankPixels / Math.max(2500, cropArea * 0.05));
  const color = Math.min(1, component.colorBuckets / 32);
  const boundsPresence = Math.min(1, (boundsArea / cropArea) * 12);
  const compactness = Math.min(1, component.nonBlankPixels / boundsArea);
  return size * 3 + color + centrality * 2 + boundsPresence + compactness * 0.5 - (component.clipped ? 2 : 0);
}

function resolveCrop(image, crop) {
  if (!crop || typeof crop !== "object") {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }
  const x = clampInteger(crop.x, 0, image.width - 1);
  const y = clampInteger(crop.y, 0, image.height - 1);
  return {
    x,
    y,
    width: clampInteger(crop.width, 1, image.width - x),
    height: clampInteger(crop.height, 1, image.height - y)
  };
}

function clampInteger(value, min, max) {
  return Math.min(max, Math.max(min, Number.isInteger(value) ? value : min));
}

function decodePng(buffer) {
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("Expected a PNG buffer.");
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      const interlace = data[12] ?? 0;
      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
      if (interlace !== 0) throw new Error("Interlaced PNG screenshots are not supported.");
      if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG color type ${colorType}.`);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || idatChunks.length === 0) {
    throw new Error("PNG is missing IHDR or IDAT data.");
  }

  const channels = colorType === 6 ? 4 : 3;
  const scanlineBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * channels);
  const previous = new Uint8Array(scanlineBytes);
  let inputOffset = 0;
  let outputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset] ?? 0;
    inputOffset += 1;
    const current = new Uint8Array(scanlineBytes);
    for (let x = 0; x < scanlineBytes; x += 1) {
      const raw = inflated[inputOffset + x] ?? 0;
      const left = x >= channels ? current[x - channels] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;
      current[x] = unfilterByte(filter, raw, left, up, upLeft);
    }
    inputOffset += scanlineBytes;
    pixels.set(current, outputOffset);
    previous.set(current);
    outputOffset += scanlineBytes;
  }

  return { width, height, channels, pixels };
}

function unfilterByte(filter, raw, left, up, upLeft) {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 0xff;
  if (filter === 2) return (raw + up) & 0xff;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 0xff;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 0xff;
  throw new Error(`Unsupported PNG filter ${filter}.`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function pixelAt(image, x, y) {
  const index = (y * image.width + x) * image.channels;
  return {
    r: image.pixels[index] ?? 0,
    g: image.pixels[index + 1] ?? 0,
    b: image.pixels[index + 2] ?? 0,
    a: image.channels === 4 ? image.pixels[index + 3] ?? 255 : 255
  };
}

/**
 * Per-row background reference, for frames whose backdrop is a vertical gradient.
 *
 * ## Why a single colour is not enough
 *
 * The previous corner-average reference assumed the backdrop is one flat colour, which was true of every frame in this
 * repository until Skyline Runner replaced its flat sky plane with a graded one. With a gradient, no single
 * colour represents the backdrop: sampling Skyline's four corners yields rgb(119,175,194), and the sky bands
 * measure 23-98 away from it down a backdrop-only column. Everything past the 30 threshold is classified as
 * *foreground*, so 89% of the frame counted as subject, `largestComponentAreaRatio` reached 0.8644 against a
 * 0.72 budget, and the component touched the frame edge and reported as clipped.
 *
 * That is the measurement being wrong, not the frame: those pixels are unambiguously backdrop. Fixing it by
 * loosening the 0.72 budget would have hidden a broken classifier and weakened the check for every route.
 *
 * ## How this works
 *
 * The left and right margins of a game frame are backdrop in any composition where the subject is not
 * clipped -- which the probe independently gates. Sampling both margins **per row** tracks a vertical
 * gradient exactly, and taking the median of a small sample makes it robust to a prop that intrudes into one
 * margin. When the backdrop is flat this returns the same colour for every row, so existing behaviour is
 * preserved; there is a test asserting that on a real flat-sky frame.
 */
function perRowBackgroundColors(image, crop) {
  const margin = Math.max(2, Math.min(24, Math.floor(crop.width * 0.02)));
  const rows = new Uint8Array(crop.height * 3);
  const samples = [];
  for (let localY = 0; localY < crop.height; localY += 1) {
    const y = crop.y + localY;
    samples.length = 0;
    for (let offset = 0; offset < margin; offset += 1) {
      samples.push(pixelAt(image, crop.x + offset, y));
      samples.push(pixelAt(image, crop.x + crop.width - 1 - offset, y));
    }
    // Median per channel: robust to a prop or HUD edge intruding into one margin.
    rows[localY * 3] = medianChannel(samples, "r");
    rows[localY * 3 + 1] = medianChannel(samples, "g");
    rows[localY * 3 + 2] = medianChannel(samples, "b");
  }
  return rows;
}

function medianChannel(samples, channel) {
  const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right);
  const middle = values.length >> 1;
  return values.length % 2 === 0
    ? Math.round((values[middle - 1] + values[middle]) / 2)
    : values[middle];
}

function ratio(count, total) {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

/**
 * Perceptual signature of a rendered frame, stable across GPU rounding noise.
 *
 * ## Why byte hashing is the wrong binding for visual approval
 *
 * The human visual-review gate binds approval to `sha256` of a screenshot. That is only sound if the
 * producer is deterministic, and it is not: re-rendering the *same settled frame* on the same machine
 * produces slightly different pixels, because WebGL rasterisation, filtering and float precision are
 * not bit-reproducible across contexts.
 *
 * Measured on `showcase-smart-city-control` at 1440x900, with every app paused and advanced by an
 * identical 30 fixed steps: **55 of 3,888,000 colour channels differed (0.0014%)**, max channel delta
 * 27/255, mean 5/255 — roughly 18 pixels of a 1.3-megapixel frame. Visually identical, byte-different.
 *
 * The consequence was a gate nobody could satisfy: every regeneration invalidated a still-correct
 * signature, so the only way to keep it green was never to re-run the screenshot spec. It went red
 * before 1.5.2 and stayed there.
 *
 * ## What this computes instead
 *
 * A coarse grid of quantised average colours. Two frames that a reviewer would call identical produce
 * the same signature; a frame where something actually moved, changed colour, or disappeared produces
 * a different one. Deliberately *coarse* — this is an approval binding, not a regression differ. The
 * strict pixel gates (`readPngDifferenceMetrics`, the visual-composition checks) remain the place for
 * fine-grained comparison.
 *
 * Defaults: an 8x8 grid with 5-bit-per-channel quantisation. At 1440x900 each cell averages ~20k
 * pixels, so isolated rounding noise cannot move a cell across a quantisation boundary, while a
 * genuinely changed region shifts several cells.
 */
export function readPngPerceptualSignature(path, options = {}) {
  const buffer = readFileSync(path);
  const grid = Math.max(2, Math.min(64, Math.trunc(options.grid ?? 8)));
  const bits = Math.max(2, Math.min(8, Math.trunc(options.bits ?? 5)));
  return memoizeAnalysis(
    `perceptual:${grid}:${bits}`,
    buffer,
    options.crop,
    () => computePngPerceptualSignature(buffer, options.crop, grid, bits)
  );
}

function computePngPerceptualSignature(bytes, cropInput, grid, bits) {
  const image = decodePng(bytes);
  const crop = resolveCrop(image, cropInput);
  const shift = 8 - bits;
  const cells = [];
  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const x0 = crop.x + Math.floor((column * crop.width) / grid);
      const x1 = crop.x + Math.floor(((column + 1) * crop.width) / grid);
      const y0 = crop.y + Math.floor((row * crop.height) / grid);
      const y1 = crop.y + Math.floor(((row + 1) * crop.height) / grid);
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const pixel = pixelAt(image, x, y);
          r += pixel.r;
          g += pixel.g;
          b += pixel.b;
          count += 1;
        }
      }
      if (count === 0) {
        cells.push("0.0.0");
        continue;
      }
      // Average first, then quantise: averaging over ~20k pixels already suppresses isolated noise,
      // and quantising the average keeps a real shift in region brightness or hue visible.
      cells.push([
        Math.round(r / count) >> shift,
        Math.round(g / count) >> shift,
        Math.round(b / count) >> shift
      ].join("."));
    }
  }
  const signature = `perceptual-${grid}x${grid}-${bits}bit-${createHash("sha256").update(cells.join("|")).digest("hex")}`;
  return { signature, grid, bits, width: crop.width, height: crop.height, cells: cells.length };
}
