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
