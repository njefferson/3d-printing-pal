// A real PNG, built from the spec rather than committed as a fixture.
//
// ONE COPY, IMPORTED BY BOTH WALKS. It began in the data-safety walk, and the
// accessibility gate then needed a picture too — at which point the choice was a
// second copy or this file. A second copy of twenty lines of the PNG spec is the
// kind of duplicate nobody notices diverging, and this repo already refuses that
// for its gates; the same rule applies to their fixtures.
//
// A checked-in binary would work and would be a file nobody can read in a diff
// and nobody would notice going stale. This says exactly what it produces.

import { deflateSync } from 'node:zlib';

export function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // Scanlines with a leading filter byte. A gradient rather than a flat fill, so
  // the encoder has something to do and the result is not trivially compressible
  // into a size that would pass any budget by accident.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;
    for (let x = 0; x < width; x += 1) {
      raw[at] = (x * 255) / width;
      raw[at + 1] = (y * 255) / height;
      raw[at + 2] = ((x + y) * 255) / (width + height);
      at += 3;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
