export const MAX_ZIP_EXPORT_BYTES = 80 * 1024 * 1024;

type ZipEntry = { name: string; data: Uint8Array };

function crc32(data: Uint8Array): number {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ -1) >>> 0;
}

/** Build a ZIP32 archive without compression and reject inputs that could create excessive memory pressure. */
export function zipStore(entries: ZipEntry[], maxBytes = MAX_ZIP_EXPORT_BYTES): Blob {
  if (entries.length > 0xffff) throw new Error("ZIP export supports at most 65,535 entries.");
  const totalBytes = entries.reduce((total, entry) => total + entry.data.byteLength, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > maxBytes) {
    throw new Error("ZIP export is limited to " + Math.floor(maxBytes / 1024 / 1024) + " MB to protect browser memory. Export individual reports or reduce the font package size.");
  }

  const encoder = new TextEncoder();
  const local: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const put16 = (view: DataView, position: number, value: number) => view.setUint16(position, value, true);
  const put32 = (view: DataView, position: number, value: number) => view.setUint32(position, value, true);

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.data;
    if (name.length > 0xffff || data.byteLength > 0xffffffff || offset > 0xffffffff) {
      throw new Error("This handoff exceeds the ZIP32 format limits.");
    }
    const checksum = crc32(data);
    const header = new Uint8Array(30 + name.length);
    const headerView = new DataView(header.buffer);
    put32(headerView, 0, 0x04034b50);
    put16(headerView, 4, 20);
    put16(headerView, 6, 0x800);
    put16(headerView, 8, 0);
    put16(headerView, 10, 0);
    put16(headerView, 12, 0);
    put32(headerView, 14, checksum);
    put32(headerView, 18, data.byteLength);
    put32(headerView, 22, data.byteLength);
    put16(headerView, 26, name.length);
    put16(headerView, 28, 0);
    header.set(name, 30);
    local.push(header, data);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    put32(directoryView, 0, 0x02014b50);
    put16(directoryView, 4, 20);
    put16(directoryView, 6, 20);
    put16(directoryView, 8, 0x800);
    put16(directoryView, 10, 0);
    put16(directoryView, 12, 0);
    put16(directoryView, 14, 0);
    put32(directoryView, 16, checksum);
    put32(directoryView, 20, data.byteLength);
    put32(directoryView, 24, data.byteLength);
    put16(directoryView, 28, name.length);
    put16(directoryView, 30, 0);
    put16(directoryView, 32, 0);
    put16(directoryView, 34, 0);
    put16(directoryView, 36, 0);
    put32(directoryView, 38, 0);
    put32(directoryView, 42, offset);
    directory.set(name, 46);
    central.push(directory);
    offset += header.byteLength + data.byteLength;
  }

  const centralSize = central.reduce((total, item) => total + item.byteLength, 0);
  if (offset + centralSize + 22 > 0xffffffff) throw new Error("This handoff exceeds the ZIP32 archive size limit.");
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  put32(endView, 0, 0x06054b50);
  put16(endView, 4, 0);
  put16(endView, 6, 0);
  put16(endView, 8, entries.length);
  put16(endView, 10, entries.length);
  put32(endView, 12, centralSize);
  put32(endView, 16, offset);
  put16(endView, 20, 0);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}
