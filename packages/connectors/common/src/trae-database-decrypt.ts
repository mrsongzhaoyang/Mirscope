import { createDecipheriv, createHmac, pbkdf2Sync } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const PAGE_SZ = 4096;
const KEY_SZ = 32;
const SALT_SZ = 16;
const IV_SZ = 16;
const HMAC_SZ = 64;
const RESERVE_SZ = 80;
const SQLITE_HDR = Buffer.from('SQLite format 3\0');

function deriveMacKey(encKey: Buffer, salt: Buffer): Buffer {
  const macSalt = Buffer.from(salt.map((b) => b ^ 0x3a));
  return pbkdf2Sync(encKey, macSalt, 2, KEY_SZ, 'sha512');
}

export function verifyTraeDatabaseKey(encKeyHex: string, dbPath: string): boolean {
  try {
    const encKey = Buffer.from(encKeyHex, 'hex');
    if (encKey.length !== KEY_SZ) return false;
    const page1 = readFileSync(dbPath).subarray(0, PAGE_SZ);
    const salt = page1.subarray(0, SALT_SZ);
    const macKey = deriveMacKey(encKey, salt);
    const hmacData = page1.subarray(SALT_SZ, PAGE_SZ - RESERVE_SZ + IV_SZ);
    const storedHmac = page1.subarray(PAGE_SZ - HMAC_SZ, PAGE_SZ);
    const hm = createHmac('sha512', macKey);
    hm.update(hmacData);
    hm.update(Buffer.from([1, 0, 0, 0]));
    return hm.digest().equals(storedHmac);
  } catch {
    return false;
  }
}

function decryptPage(encKey: Buffer, pageData: Buffer, pgno: number): Buffer {
  const iv = pageData.subarray(PAGE_SZ - RESERVE_SZ, PAGE_SZ - RESERVE_SZ + IV_SZ);
  if (pgno === 1) {
    const encrypted = pageData.subarray(SALT_SZ, PAGE_SZ - RESERVE_SZ);
    const decipher = createDecipheriv('aes-256-cbc', encKey, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return Buffer.concat([SQLITE_HDR, decrypted, Buffer.alloc(RESERVE_SZ)]);
  }
  const encrypted = pageData.subarray(0, PAGE_SZ - RESERVE_SZ);
  const decipher = createDecipheriv('aes-256-cbc', encKey, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return Buffer.concat([decrypted, Buffer.alloc(RESERVE_SZ)]);
}

export async function decryptTraeDatabase(
  dbPath: string,
  encKeyHex: string,
  outputPath: string
): Promise<void> {
  const encKey = Buffer.from(encKeyHex, 'hex');
  if (!verifyTraeDatabaseKey(encKeyHex, dbPath)) {
    throw new Error('Trae database key verification failed');
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(dbPath, { highWaterMark: PAGE_SZ });
    const output = createWriteStream(outputPath);
    let pgno = 0;
    let pending = Buffer.alloc(0);

    input.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      pending = Buffer.concat([pending, buf]);

      while (pending.length >= PAGE_SZ) {
        pgno += 1;
        const page = pending.subarray(0, PAGE_SZ);
        pending = pending.subarray(PAGE_SZ);
        const decrypted = decryptPage(encKey, page, pgno);
        if (!output.write(decrypted)) {
          input.pause();
          output.once('drain', () => input.resume());
        }
      }
    });

    input.on('end', () => {
      if (pending.length > 0) {
        pgno += 1;
        const page = Buffer.concat([pending, Buffer.alloc(PAGE_SZ - pending.length)]);
        output.write(decryptPage(encKey, page, pgno));
      }
      output.end();
    });

    input.on('error', reject);
    output.on('error', reject);
    output.on('finish', resolve);
  });
}

export function getTraeDatabaseCachePath(dbPath: string): string {
  const hash = Buffer.from(dbPath).toString('base64url').slice(0, 24);
  return join(homedir(), '.mirscope', 'cache', `trae-db-${hash}.sqlite`);
}

export async function ensureDecryptedTraeDatabase(
  dbPath: string,
  encKeyHex: string
): Promise<string> {
  const cachePath = getTraeDatabaseCachePath(dbPath);
  const srcMtime = statSync(dbPath).mtimeMs;

  if (existsSync(cachePath)) {
    try {
      const cacheMtime = statSync(cachePath).mtimeMs;
      if (cacheMtime >= srcMtime) return cachePath;
    } catch {
      // re-decrypt
    }
  }

  await decryptTraeDatabase(dbPath, encKeyHex, cachePath);
  return cachePath;
}
