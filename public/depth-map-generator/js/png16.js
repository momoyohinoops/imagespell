// png16.js — encode a true 16-bit grayscale PNG in the browser.
// Canvas.toBlob only emits 8-bit, so Pro 16-bit export is encoded by hand.
// IDAT uses the Compression Streams API: CompressionStream("deflate") emits a
// zlib (RFC-1950) stream, which is exactly what PNG IDAT requires.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = data.length;
  const out = new Uint8Array(12 + len);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcRegion = out.subarray(4, 8 + len);
  dv.setUint32(8 + len, crc32(crcRegion));
  return out;
}

async function zlibDeflate(bytes) {
  const cs = new CompressionStream("deflate"); // zlib-wrapped
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// samples16: Uint16Array of length w*h, grayscale (big-endian written here).
export async function encodeGray16PNG(samples16, w, h) {
  // Raw scanlines: 1 filter byte (0) + w*2 bytes per row (big-endian samples).
  const rowBytes = w * 2;
  const raw = new Uint8Array(h * (1 + rowBytes));
  for (let y = 0; y < h; y++) {
    const ro = y * (1 + rowBytes);
    raw[ro] = 0; // filter type: None
    let o = ro + 1;
    for (let x = 0; x < w; x++) {
      const s = samples16[y * w + x];
      raw[o++] = (s >>> 8) & 0xff; // high byte
      raw[o++] = s & 0xff;         // low byte
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 16;  // bit depth
  ihdr[9] = 0;   // color type: grayscale
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const idatData = await zlibDeflate(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idatData), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return new Blob([png], { type: "image/png" });
}

// Build 16-bit samples from a normalized field (0..1, 1=near), honoring invert.
export function fieldToGray16(field, invert) {
  const n = field.length;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    let v = field[i];
    if (invert) v = 1 - v;
    out[i] = Math.round(v * 65535);
  }
  return out;
}
