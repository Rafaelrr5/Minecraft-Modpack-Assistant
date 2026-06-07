/**
 * A tiny, dependency-free **store-only** (uncompressed) ZIP writer + reader (spec 0015, FR-7/FR-9).
 *
 * Why hand-rolled: the project stays native and near-zero-dependency (native packwiz TOML — ADR
 * 0006; native NVIDIA HTTP — spec 0009), and — decisively — we **zero the embedded DOS timestamps**
 * so the same input yields byte-identical bytes (Constitution P7 / spec 0015 AC-8). Off-the-shelf
 * zip libraries stamp wall-clock mtimes and would break that guarantee. Both `.mrpack` and a
 * CurseForge pack are ZIPs, so one writer serves both.
 *
 * `readStoreZip` exists so the produced archive can be **validated by reading it back** (CRC-32
 * verified) in tests (Constitution P3). Store method only — no deflate.
 */

/** One archive member. A `path` ending in `/` is a directory entry (zero-length). */
export interface ZipEntry {
  readonly path: string;
  readonly contents: string;
}

// The canonical "zero" DOS timestamp: 1980-01-01 00:00:00 (valid, and fixed → reproducible).
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021;
const UTF8_FLAG = 0x0800; // general-purpose bit 11: file name is UTF-8
const VERSION = 20; // 2.0 — minimum for the store method

// ── CRC-32 (IEEE, reflected polynomial 0xEDB88320) ─────────────────────────────────────────────

const CRC_TABLE: readonly number[] = (() => {
  const table = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

/** Build a deterministic store-only ZIP from `entries` (in order). */
export function createStoreZip(entries: readonly ZipEntry[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, 'utf8');
    const isDir = entry.path.endsWith('/');
    const data = isDir ? Buffer.alloc(0) : Buffer.from(entry.contents, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size (== uncompressed for store)
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    localChunks.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(VERSION, 4); // version made by
    central.writeUInt16LE(VERSION, 6); // version needed
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(0, 10); // method: store
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(isDir ? 0x10 : 0, 38); // external attrs (0x10 = directory)
    central.writeUInt32LE(offset, 42); // local header offset
    centralChunks.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const localPart = Buffer.concat(localChunks);
  const centralPart = Buffer.concat(centralChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localPart, centralPart, eocd]);
}

/** Read a store-only ZIP produced by {@link createStoreZip}, verifying each entry's CRC-32. */
export function readStoreZip(bytes: Buffer): ZipEntry[] {
  // Locate the End-of-Central-Directory record (no archive comment → scan from the tail).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: End-of-Central-Directory record not found');

  const count = bytes.readUInt16LE(eocd + 10);
  let p = bytes.readUInt32LE(eocd + 16); // central directory offset

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(p) !== CENTRAL_SIG) throw new Error('zip: bad central directory signature');
    const method = bytes.readUInt16LE(p + 10);
    if (method !== 0) throw new Error(`zip: unsupported compression method ${method} (store only)`);
    const crc = bytes.readUInt32LE(p + 16);
    const size = bytes.readUInt32LE(p + 24); // uncompressed size
    const nameLen = bytes.readUInt16LE(p + 28);
    const extraLen = bytes.readUInt16LE(p + 30);
    const commentLen = bytes.readUInt16LE(p + 32);
    const localOffset = bytes.readUInt32LE(p + 42);
    const path = bytes.toString('utf8', p + 46, p + 46 + nameLen);

    // Jump to the local header to find the data start (local extra length can differ from central).
    const localNameLen = bytes.readUInt16LE(localOffset + 26);
    const localExtraLen = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataStart, dataStart + size);
    if (crc32(data) !== crc) throw new Error(`zip: CRC mismatch for ${path}`);

    entries.push({ path, contents: data.toString('utf8') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
