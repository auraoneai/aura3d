import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngForegroundMetrics(path, crop) {
  return analyzeForegroundPng(readFileSync(path), crop);
}


export function readPngDifferenceMetrics(visiblePath, hiddenPath, cropInput, channelThreshold = 12) {
  const first = decodePng(readFileSync(visiblePath));
  const second = decodePng(readFileSync(hiddenPath));
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
    readabilityScore
  };
}

function analyzeForegroundPng(buffer, cropInput) {
  const image = decodePng(buffer);
  const crop = resolveCrop(image, cropInput);
  const background = averageCornerColor(image, crop);
  const mask = new Uint8Array(crop.width * crop.height);

  for (let y = crop.y; y < crop.y + crop.height; y += 1) {
    for (let x = crop.x; x < crop.x + crop.width; x += 1) {
      const pixel = pixelAt(image, x, y);
      const backgroundDistance = Math.abs(pixel.r - background.r) + Math.abs(pixel.g - background.g) + Math.abs(pixel.b - background.b);
      const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
      if (pixel.a <= 8 || backgroundDistance <= 30 || luma <= 7) continue;
      const localX = x - crop.x;
      const localY = y - crop.y;
      mask[localY * crop.width + localX] = 1;
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
    readabilityScore
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

function averageCornerColor(image, crop) {
  const points = [
    pixelAt(image, crop.x, crop.y),
    pixelAt(image, crop.x + crop.width - 1, crop.y),
    pixelAt(image, crop.x, crop.y + crop.height - 1),
    pixelAt(image, crop.x + crop.width - 1, crop.y + crop.height - 1)
  ];
  return {
    r: Math.round(points.reduce((sum, pixel) => sum + pixel.r, 0) / points.length),
    g: Math.round(points.reduce((sum, pixel) => sum + pixel.g, 0) / points.length),
    b: Math.round(points.reduce((sum, pixel) => sum + pixel.b, 0) / points.length)
  };
}

function ratio(count, total) {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}
