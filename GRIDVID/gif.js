/* =============================================================================
 * gif.js — minimal animated GIF89a encoder for indexed grid videos.
 *
 * Purpose-built for 2dgridvid: frames are int grids of palette indices (0..N-1,
 * N<=256), so we skip quantization entirely and write the palette as the GIF
 * Global Color Table. Each cell is scaled to a `cell`xcell pixel block.
 * Rendered previews draw a very light 1px grid by default, matching ARC-AGI style.
 *
 * UMD: window.GIFENC in the browser, require('./gif.js') in Node.
 * Returns a Uint8Array of GIF bytes.  encodeGif({frames, palette, cell, delay}).
 * ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GIFENC = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // variable-width LZW compression as specified by the GIF spec.
  function lzwEncode(indices, minCodeSize) {
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    let codeSize = minCodeSize + 1;
    let next = eoi + 1;
    let dict = new Map();
    const resetDict = () => {
      dict = new Map();
      for (let i = 0; i < clear; i++) dict.set(String(i), i);
      next = eoi + 1; codeSize = minCodeSize + 1;
    };

    const out = [];
    let cur = 0, curBits = 0;
    const emit = (code) => {
      cur |= code << curBits; curBits += codeSize;
      while (curBits >= 8) { out.push(cur & 0xff); cur >>= 8; curBits -= 8; }
    };

    resetDict();
    emit(clear);
    let prefix = String(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const combined = prefix + "," + k;
      if (dict.has(combined)) {
        prefix = combined;
      } else {
        emit(dict.get(prefix));
        dict.set(combined, next++);
        if (next > (1 << codeSize) && codeSize < 12) codeSize++;
        if (next > 4095) { emit(clear); resetDict(); }
        prefix = String(k);
      }
    }
    emit(dict.get(prefix));
    emit(eoi);
    if (curBits > 0) out.push(cur & 0xff);
    return out;
  }

  function encodeGif(opts) {
    const { frames } = opts;
    const palette = opts.palette.slice();
    const cell = opts.cell || 12;
    const delay = Math.max(2, Math.round((opts.delayMs || 140) / 10)); // GIF delay = 1/100s
    const grid = opts.grid !== false && cell >= 4;
    const gridColor = opts.gridColor == null ? palette.length : opts.gridColor;
    if (grid && opts.gridColor == null) palette.push("#2b2b2f");
    const H = frames[0].length, W = frames[0][0].length;
    const pw = W * cell, ph = H * cell;

    // color table size must be a power of two >= palette length, min 2.
    let tableSize = 2, gctBits = 1;
    while (tableSize < palette.length) { tableSize <<= 1; gctBits++; }
    const minCodeSize = Math.max(2, gctBits);

    const bytes = [];
    const u8 = (b) => bytes.push(b & 0xff);
    const u16 = (v) => { bytes.push(v & 0xff); bytes.push((v >> 8) & 0xff); };
    const str = (s) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };

    str("GIF89a");
    u16(pw); u16(ph);
    u8(0xf0 | (gctBits - 1)); // GCT present, color res, GCT size
    u8(0); u8(0);            // bg color index, aspect ratio

    // Global Color Table
    for (let i = 0; i < tableSize; i++) {
      const [r, g, b] = i < palette.length ? hexToRgb(palette[i]) : [0, 0, 0];
      u8(r); u8(g); u8(b);
    }

    // NETSCAPE looping extension
    u8(0x21); u8(0xff); u8(0x0b); str("NETSCAPE2.0");
    u8(0x03); u8(0x01); u16(0); u8(0); // loop forever

    for (const frame of frames) {
      // Graphic Control Extension (per-frame delay)
      u8(0x21); u8(0xf9); u8(0x04); u8(0x00); u16(delay); u8(0x00); u8(0x00);

      // Image Descriptor
      u8(0x2c); u16(0); u16(0); u16(pw); u16(ph); u8(0x00);

      // upscale grid -> pixel indices (row-major)
      const px = new Array(pw * ph);
      for (let y = 0; y < ph; y++) {
        const gy = (y / cell) | 0;
        for (let x = 0; x < pw; x++) {
          const gx = (x / cell) | 0;
          const isGrid = grid && (x % cell === 0 || y % cell === 0 || x === pw - 1 || y === ph - 1);
          px[y * pw + x] = isGrid ? gridColor : frame[gy][gx];
        }
      }

      u8(minCodeSize);
      const data = lzwEncode(px, minCodeSize);
      for (let i = 0; i < data.length; i += 255) {
        const chunk = data.slice(i, i + 255);
        u8(chunk.length);
        for (const b of chunk) u8(b);
      }
      u8(0x00); // block terminator
    }

    u8(0x3b); // trailer
    return new Uint8Array(bytes);
  }

  return { encodeGif };
});
