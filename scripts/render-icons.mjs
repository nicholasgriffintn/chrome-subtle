import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const sizes = [16, 32, 48, 128];
const scale = 4;

for (const size of sizes) {
  const width = size * scale;
  const pixels = Buffer.alloc(width * width * 4);
  drawRoundedRect(pixels, width, 8 / 128 * width, 8 / 128 * width, 112 / 128 * width, 112 / 128 * width, 31 / 128 * width, [16, 22, 25, 255]);
  drawLine(pixels, width, 35 / 128 * width, 42 / 128 * width, 93 / 128 * width, 42 / 128 * width, 11 / 128 * width, [255, 250, 240, 255]);
  drawLine(pixels, width, 27 / 128 * width, 66 / 128 * width, 101 / 128 * width, 66 / 128 * width, 11 / 128 * width, [255, 250, 240, 255]);
  drawLine(pixels, width, 42 / 128 * width, 91 / 128 * width, 86 / 128 * width, 91 / 128 * width, 11 / 128 * width, [242, 184, 75, 255]);
  drawCircle(pixels, width, 105 / 128 * width, 23 / 128 * width, 6 / 128 * width, [134, 216, 193, 255]);
  writeFileSync(`icons/icon-${size}.png`, encodePng(downsample(pixels, width, scale), size, size));
}

function drawRoundedRect(pixels, width, x, y, rectWidth, rectHeight, radius, colour) {
  for (let py = Math.floor(y); py < Math.ceil(y + rectHeight); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + rectWidth); px += 1) {
      const closestX = Math.max(x + radius, Math.min(px, x + rectWidth - radius));
      const closestY = Math.max(y + radius, Math.min(py, y + rectHeight - radius));
      if (Math.hypot(px - closestX, py - closestY) <= radius) setPixel(pixels, width, px, py, colour);
    }
  }
}

function drawLine(pixels, width, x1, y1, x2, y2, thickness, colour) {
  const radius = thickness / 2;
  const minimumX = Math.floor(Math.min(x1, x2) - radius);
  const maximumX = Math.ceil(Math.max(x1, x2) + radius);
  const minimumY = Math.floor(Math.min(y1, y2) - radius);
  const maximumY = Math.ceil(Math.max(y1, y2) + radius);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      if (distanceToSegment(x, y, x1, y1, x2, y2) <= radius) setPixel(pixels, width, x, y, colour);
    }
  }
}

function drawCircle(pixels, width, centreX, centreY, radius, colour) {
  for (let y = Math.floor(centreY - radius); y <= Math.ceil(centreY + radius); y += 1) {
    for (let x = Math.floor(centreX - radius); x <= Math.ceil(centreX + radius); x += 1) {
      if (Math.hypot(x - centreX, y - centreY) <= radius) setPixel(pixels, width, x, y, colour);
    }
  }
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const lengthSquared = ((x2 - x1) ** 2) + ((y2 - y1) ** 2);
  const t = Math.max(0, Math.min(1, (((px - x1) * (x2 - x1)) + ((py - y1) * (y2 - y1))) / lengthSquared));
  return Math.hypot(px - (x1 + (t * (x2 - x1))), py - (y1 + (t * (y2 - y1))));
}

function setPixel(pixels, width, x, y, colour) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  pixels.set(colour, ((y * width) + x) * 4);
}

function downsample(source, sourceWidth, factor) {
  const targetWidth = sourceWidth / factor;
  const target = Buffer.alloc(targetWidth * targetWidth * 4);
  for (let y = 0; y < targetWidth; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const offset = ((((y * factor) + sy) * sourceWidth) + ((x * factor) + sx)) * 4;
          for (let channel = 0; channel < 4; channel += 1) sums[channel] += source[offset + channel];
        }
      }
      const targetOffset = ((y * targetWidth) + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) target[targetOffset + channel] = Math.round(sums[channel] / (factor ** 2));
    }
  }
  return target;
}

function encodePng(pixels, width, height) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([integer(width), integer(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(scanlines)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const name = Buffer.from(type);
  return Buffer.concat([integer(data.length), name, data, integer(crc32(Buffer.concat([name, data])))]);
}

function integer(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
