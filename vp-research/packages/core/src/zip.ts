/**
 * Minimal ZIP central-directory reader used to vet uploads before any
 * full parser runs. It reads entry names and declared sizes only; it never
 * inflates data, so it is safe against decompression bombs.
 */

export interface ZipEntryInfo {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

export class ZipFormatError extends Error {}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const MAX_COMMENT = 0xffff;

export function readZipEntries(bytes: Uint8Array): ZipEntryInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = Math.max(0, bytes.length - EOCD_MIN_SIZE - MAX_COMMENT);
  let eocd = -1;
  for (let i = bytes.length - EOCD_MIN_SIZE; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipFormatError("ZIP end-of-central-directory record not found");

  const count = view.getUint16(eocd + 10, true);
  const dirSize = view.getUint32(eocd + 12, true);
  const dirOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || dirOffset === 0xffffffff) {
    throw new ZipFormatError("ZIP64 archives are not supported");
  }
  if (dirOffset + dirSize > eocd) throw new ZipFormatError("ZIP central directory is out of bounds");

  const decoder = new TextDecoder();
  const entries: ZipEntryInfo[] = [];
  let p = dirOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > eocd || view.getUint32(p, true) !== CENTRAL_SIGNATURE) {
      throw new ZipFormatError("ZIP central directory entry is corrupt");
    }
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    if (p + 46 + nameLength > eocd) throw new ZipFormatError("ZIP entry name is out of bounds");
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.push({ name, compressedSize, uncompressedSize });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
