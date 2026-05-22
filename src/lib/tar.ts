/**
 * Writes a single file entry into a tar chunks array.
 * Uses GNU ././@LongLink extension for filenames > 100 characters.
 */
function writeTarEntry(chunks: Buffer[], filePath: string, content: Buffer): void {
  const BLOCK = 512;

  // GNU longname extension — needed when path exceeds 100-char POSIX limit
  if (filePath.length > 100) {
    const longData = Buffer.from(filePath + '\0');
    const lnHeader = Buffer.alloc(BLOCK);
    Buffer.from('././@LongLink').copy(lnHeader, 0);
    Buffer.from('0000644\0').copy(lnHeader, 100);
    Buffer.from('0000000\0').copy(lnHeader, 108);
    Buffer.from('0000000\0').copy(lnHeader, 116);
    Buffer.from(longData.length.toString(8).padStart(11, '0') + '\0').copy(lnHeader, 124);
    Buffer.from('00000000000\0').copy(lnHeader, 136);
    Buffer.from('        ').copy(lnHeader, 148);
    lnHeader[156] = 0x4C; // type 'L'
    Buffer.from('ustar\0').copy(lnHeader, 257);
    Buffer.from('00').copy(lnHeader, 263);
    let cs = 0; for (const b of lnHeader) cs += b;
    Buffer.from(cs.toString(8).padStart(6, '0') + '\0 ').copy(lnHeader, 148);
    const lnPad = Buffer.alloc(Math.ceil(longData.length / BLOCK) * BLOCK);
    longData.copy(lnPad);
    chunks.push(lnHeader, lnPad);
  }

  const safeName = filePath.slice(0, 100);
  const header = Buffer.alloc(BLOCK);
  Buffer.from(safeName).copy(header, 0);
  Buffer.from('0100644\0').copy(header, 100);
  Buffer.from('0000000\0').copy(header, 108);
  Buffer.from('0000000\0').copy(header, 116);
  Buffer.from(content.length.toString(8).padStart(11, '0') + '\0').copy(header, 124);
  Buffer.from(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0').copy(header, 136);
  Buffer.from('        ').copy(header, 148);
  header[156] = 0x30;
  Buffer.from('ustar\0').copy(header, 257);
  Buffer.from('00').copy(header, 263);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ').copy(header, 148);
  const paddedContent = Buffer.alloc(Math.ceil(content.length / 512) * 512);
  content.copy(paddedContent);
  chunks.push(header, paddedContent);
}

/**
 * Creates a tar archive buffer containing multiple files.
 * keys = relative file paths, values = file contents.
 */
export function createMultiFileTarBuffer(files: Record<string, Buffer>): Buffer {
  const chunks: Buffer[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    writeTarEntry(chunks, filePath, content);
  }
  chunks.push(Buffer.alloc(512 * 2)); // end-of-archive marker
  return Buffer.concat(chunks);
}

/**
 * Creates a minimal POSIX-compatible single-file tar archive buffer.
 * Used to upload files into Docker containers via container.putArchive().
 * No external dependencies — plain Buffer manipulation only.
 */
export function createTarBuffer(filename: string, content: Buffer): Buffer {
  const BLOCK = 512;
  const safeName = filename.slice(0, 100); // POSIX limit

  const header = Buffer.alloc(BLOCK);

  // name (0-99)
  Buffer.from(safeName).copy(header, 0);
  // mode (100-107): regular file 0644
  Buffer.from('0100644\0').copy(header, 100);
  // uid  (108-115)
  Buffer.from('0000000\0').copy(header, 108);
  // gid  (116-123)
  Buffer.from('0000000\0').copy(header, 116);
  // size (124-135): 11-char octal + NUL
  Buffer.from(content.length.toString(8).padStart(11, '0') + '\0').copy(header, 124);
  // mtime (136-147): 11-char octal + NUL
  Buffer.from(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0').copy(header, 136);
  // checksum placeholder (148-155): 8 spaces
  Buffer.from('        ').copy(header, 148);
  // typeflag (156): '0' = regular file
  header[156] = 0x30;
  // magic (257-262): 'ustar\0'
  Buffer.from('ustar\0').copy(header, 257);
  // version (263-264): '00'
  Buffer.from('00').copy(header, 263);

  // Compute checksum over all header bytes (spaces already in checksum field)
  let checksum = 0;
  for (const byte of header) checksum += byte;
  Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ').copy(header, 148);

  // Pad file content to 512-byte boundary
  const paddedSize = Math.ceil(content.length / BLOCK) * BLOCK;
  const paddedContent = Buffer.alloc(paddedSize);
  content.copy(paddedContent);

  // End-of-archive: two zero blocks
  return Buffer.concat([header, paddedContent, Buffer.alloc(BLOCK * 2)]);
}
