// Phone/voice-recorder MP4 (and .m4a/.mov-family) exports almost always write
// `moov` (the metadata/sample-offset index) as the LAST top-level box, after
// `mdat` (the raw media bytes) — the device streams samples straight to disk
// and only knows the full index once recording stops. That layout is spec-valid
// and macOS/AVFoundation (afinfo, QuickTime) read it fine, but Chrome's
// <audio>/<video> progressive-playback pipeline needs `moov` reachable up front;
// with it trailing a multi-hundred-KB `mdat`, playback can hang at
// readyState 0 or fail outright, even though the exact same bytes decode fine
// via AudioContext.decodeAudioData (a different, whole-buffer decode path).
// This relocates `moov` to right after `ftyp` ("faststart") and patches the
// chunk-offset tables (`stco`/`co64`) it contains so sample offsets still point
// at the right bytes in `mdat`, which shifts forward by exactly moov's size.
//
// Only handles the simple, single-track case these voice notes actually have
// (top-level boxes are exactly ftyp, mdat, moov, in that order) — anything
// else (fragmented mp4, multiple mdat, unexpected top-level boxes) is left
// untouched rather than risk producing a corrupt file. Non-MP4-family files
// (mp3/wav — no `ftyp` box) are also left untouched.

interface TopBox {
  type: string;
  start: number;
  headerSize: number;
  size: number;
}

const CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts', 'mvex']);

function parseTopBoxes(buf: Buffer): TopBox[] | null {
  const boxes: TopBox[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size32 = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (offset + 16 > buf.length) return null;
      const hi = buf.readUInt32BE(offset + 8);
      const lo = buf.readUInt32BE(offset + 12);
      size = hi * 4294967296 + lo;
      headerSize = 16;
    } else if (size32 === 0) {
      size = buf.length - offset;
    }
    if (size < headerSize || offset + size > buf.length) return null;
    boxes.push({ type, start: offset, headerSize, size });
    offset += size;
  }
  return boxes;
}

function patchStco(buf: Buffer, contentStart: number, shift: number): void {
  const entryCount = buf.readUInt32BE(contentStart + 4);
  let p = contentStart + 8;
  for (let i = 0; i < entryCount; i++) {
    buf.writeUInt32BE(buf.readUInt32BE(p) + shift, p);
    p += 4;
  }
}

function patchCo64(buf: Buffer, contentStart: number, shift: number): void {
  const entryCount = buf.readUInt32BE(contentStart + 4);
  let p = contentStart + 8;
  for (let i = 0; i < entryCount; i++) {
    const hi = buf.readUInt32BE(p);
    const lo = buf.readUInt32BE(p + 4);
    const newVal = hi * 4294967296 + lo + shift;
    buf.writeUInt32BE(Math.floor(newVal / 4294967296), p);
    buf.writeUInt32BE(newVal % 4294967296, p + 4);
    p += 8;
  }
}

function patchOffsetsInPlace(buf: Buffer, start: number, end: number, shift: number): void {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
      const hi = buf.readUInt32BE(offset + 8);
      const lo = buf.readUInt32BE(offset + 12);
      size = hi * 4294967296 + lo;
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) return;

    if (type === 'stco') {
      patchStco(buf, offset + headerSize, shift);
    } else if (type === 'co64') {
      patchCo64(buf, offset + headerSize, shift);
    } else if (CONTAINER_TYPES.has(type)) {
      patchOffsetsInPlace(buf, offset + headerSize, offset + size, shift);
    }
    offset += size;
  }
}

export function faststartMp4(input: Buffer): Buffer {
  const topBoxes = parseTopBoxes(input);
  if (!topBoxes || topBoxes.length !== 3) return input;

  const [ftyp, mdat, moov] = topBoxes;
  if (ftyp.type !== 'ftyp' || mdat.type !== 'mdat' || moov.type !== 'moov') return input;
  if (moov.start < mdat.start) return input; // already faststart

  const moovBuf = Buffer.from(input.subarray(moov.start, moov.start + moov.size));
  const shift = moov.size;
  patchOffsetsInPlace(moovBuf, 0, moovBuf.length, shift);

  const ftypBuf = input.subarray(ftyp.start, ftyp.start + ftyp.size);
  const mdatBuf = input.subarray(mdat.start, mdat.start + mdat.size);
  return Buffer.concat([ftypBuf, moovBuf, mdatBuf]);
}
