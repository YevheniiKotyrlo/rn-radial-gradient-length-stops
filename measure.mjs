// Reads a screenshot of ReproducerApp, finds the box by its red and blue pixels, and measures how far from the box's
// centre the red turns blue, rightwards along the centre row and downwards along the centre column, in the box's own
// units (the box is 100 wide). CSS places the 40px stop of an ellipse with radii 50 and 150 at 40 rightwards and 120
// downwards; measuring the stop against max(radiusX, radiusY) places it at 13.3 and 40.
// Exit 1 while the stop lands where max(radiusX, radiusY) puts it, 0 once it lands where CSS puts it, 2 otherwise.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const boxWidth = 100;
const tolerance = 3;
const css = { right: 40, down: 120 };
const maxRadius = { right: (40 * 50) / 150, down: 40 };

function decodePng(path) {
  const bytes = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 8;
  const data = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      if ((bitDepth !== 8 && bitDepth !== 16) || (colorType !== 2 && colorType !== 6) || chunk[12] !== 0) {
        throw new Error(`unsupported PNG: bit depth ${bitDepth}, colour type ${colorType}, interlace ${chunk[12]}`);
      }
    } else if (type === 'IDAT') {
      data.push(chunk);
    }
    offset += 12 + length;
  }
  // devicectl writes 16-bit screenshots, adb 8-bit ones; filters work on bytes either way.
  const bytesPerSample = bitDepth / 8;
  const channels = (colorType === 6 ? 4 : 3) * bytesPerSample;
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    const line = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    for (let index = 0; index < stride; index++) {
      const left = index >= channels ? pixels[row * stride + index - channels] : 0;
      const up = row > 0 ? pixels[(row - 1) * stride + index] : 0;
      const upLeft = row > 0 && index >= channels ? pixels[(row - 1) * stride + index - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predicted = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft;
      }
      pixels[row * stride + index] = (line[index] + predicted) & 0xff;
    }
  }
  return {
    width,
    height,
    at: (x, y) => {
      const start = y * stride + x * channels;
      return [0, 1, 2].map(sample => pixels[start + sample * bytesPerSample]);
    },
  };
}

const isRed = ([red, green, blue]) => red > 160 && green < 90 && blue < 90;
const isBlue = ([red, green, blue]) => blue > 160 && red < 90 && green < 90;
const hex = color => `#${color.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;

function verdict(code, summary) {
  console.log(`SUMMARY: ${summary}`);
  process.exit(code);
}

const path = process.argv[2];
let image;
try {
  image = decodePng(path);
} catch (error) {
  verdict(2, `the screenshot could not be read: ${error.message}`);
}

let left = image.width;
let right = -1;
let top = image.height;
let bottom = -1;
for (let y = 0; y < image.height; y++) {
  for (let x = 0; x < image.width; x++) {
    const color = image.at(x, y);
    if (isRed(color) || isBlue(color)) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
}
if (right < 0) verdict(2, 'no red or blue pixel on the screen: the gradient is not painted');

const scale = (right - left + 1) / boxWidth;
const centerX = Math.round((left + right) / 2);
const centerY = Math.round((top + bottom) / 2);
console.log(`screenshot ${image.width}x${image.height}; the box at x ${left}-${right}, y ${top}-${bottom}: ${(right - left + 1) / scale} x ${(bottom - top + 1) / scale}, ${scale} pixels a unit`);
console.log(`the box's centre: ${hex(image.at(centerX, centerY))}`);
if (!isRed(image.at(centerX, centerY))) verdict(2, 'the centre of the box is not red');

function firstBlue(stepX, stepY) {
  for (let distance = 0; ; distance++) {
    const x = centerX + stepX * distance;
    const y = centerY + stepY * distance;
    if (x > right || y > bottom) return null;
    if (isBlue(image.at(x, y))) return distance / scale;
  }
}

const measured = { right: firstBlue(1, 0), down: firstBlue(0, 1) };
for (const axis of ['right', 'down']) {
  console.log(
    `red turns blue ${axis === 'right' ? 'rightwards' : 'downwards'} at ${measured[axis] === null ? 'no point' : measured[axis].toFixed(1)}; CSS puts the 40px stop at ${css[axis]}, max(radiusX, radiusY) at ${maxRadius[axis].toFixed(1)}`,
  );
}
const near = (expected) =>
  ['right', 'down'].every(axis => measured[axis] !== null && Math.abs(measured[axis] - expected[axis]) <= tolerance);
if (near(maxRadius)) {
  verdict(1, `the 40px stop lands at ${measured.right.toFixed(1)} rightwards and ${measured.down.toFixed(1)} downwards, as 40 / max(50, 150) of the radii puts it, where CSS puts it at 40 and 120`);
}
if (near(css)) verdict(0, 'the 40px stop lands at 40 rightwards and 120 downwards, as CSS puts it');
verdict(2, 'the stop lands where neither CSS nor max(radiusX, radiusY) puts it');
