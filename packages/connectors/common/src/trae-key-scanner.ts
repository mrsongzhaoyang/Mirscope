import { execSync } from 'node:child_process';
import { createHmac, pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE_SZ = 4096;
const KEY_SZ = 32;
const SALT_SZ = 16;
const MEM_COMMIT = 0x1000;
const READABLE = new Set([0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]);

type KoffiLib = {
  kernel32: {
    OpenProcess: (access: number, inherit: number, pid: number) => unknown;
    CloseHandle: (handle: unknown) => number;
    ReadProcessMemory: (
      handle: unknown,
      addr: bigint,
      buf: Buffer,
      size: number,
      read: { value: number } | null
    ) => number;
    VirtualQueryEx: (
      handle: unknown,
      addr: bigint,
      mbi: Buffer,
      len: number
    ) => number;
  };
};

let koffiLib: KoffiLib | null = null;

function loadKoffi(): KoffiLib | null {
  if (process.platform !== 'win32') return null;
  if (koffiLib) return koffiLib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as {
      load: (name: string) => {
        func: (name: string, ret: unknown, args: unknown[]) => unknown;
      };
    };
    const lib = koffi.load('kernel32.dll');
    koffiLib = {
      kernel32: {
        OpenProcess: lib.func('OpenProcess', 'void *', ['uint', 'int', 'uint']) as KoffiLib['kernel32']['OpenProcess'],
        CloseHandle: lib.func('CloseHandle', 'int', ['void *']) as KoffiLib['kernel32']['CloseHandle'],
        ReadProcessMemory: lib.func('ReadProcessMemory', 'int', [
          'void *',
          'uint64',
          'void *',
          'size_t',
          'size_t *',
        ]) as KoffiLib['kernel32']['ReadProcessMemory'],
        VirtualQueryEx: lib.func('VirtualQueryEx', 'size_t', [
          'void *',
          'uint64',
          'void *',
          'size_t',
        ]) as KoffiLib['kernel32']['VirtualQueryEx'],
      },
    };
    return koffiLib;
  } catch {
    return null;
  }
}

function deriveMacKey(encKey: Buffer, salt: Buffer): Buffer {
  const macSalt = Buffer.from(salt.map((b) => b ^ 0x3a));
  return pbkdf2Sync(encKey, macSalt, 2, KEY_SZ, 'sha512');
}

function verifyEncKey(encKey: Buffer, page1: Buffer): boolean {
  try {
    const salt = page1.subarray(0, SALT_SZ);
    const macKey = deriveMacKey(encKey, salt);
    const hmacData = page1.subarray(SALT_SZ, PAGE_SZ - 80 + 16);
    const storedHmac = page1.subarray(PAGE_SZ - 64, PAGE_SZ);
    const hm = createHmac('sha512', macKey);
    hm.update(hmacData);
    hm.update(Buffer.from([1, 0, 0, 0]));
    return hm.digest().equals(storedHmac);
  } catch {
    return false;
  }
}

function getTraeAiAgentPid(): number | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Trae CN.exe" /FO CSV /NH', {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const pids: Array<{ pid: number; mem: number }> = [];
    for (const line of out.trim().split('\n')) {
      if (!line.trim()) continue;
      const parts = line.replace(/^"|"$/g, '').split('","');
      if (parts.length < 5) continue;
      const pid = Number.parseInt(parts[1] ?? '', 10);
      const mem = Number.parseInt((parts[4] ?? '0').replace(/[^\d]/g, ''), 10);
      if (!Number.isNaN(pid)) pids.push({ pid, mem });
    }
    pids.sort((a, b) => b.mem - a.mem);

    for (const { pid } of pids) {
      try {
        const modules = execSync(`tasklist /FI "PID eq ${pid}" /M /FO CSV /NH`, {
          encoding: 'utf-8',
          timeout: 5000,
        });
        if (modules.toLowerCase().includes('ai_agent')) return pid;
      } catch {
        // try next pid
      }
    }
  } catch {
    return null;
  }
  return null;
}

function enumRegions(handle: unknown, lib: KoffiLib): Array<{ base: bigint; size: number }> {
  const regions: Array<{ base: bigint; size: number }> = [];
  const mbi = Buffer.alloc(48);
  let addr = 0n;
  while (addr < 0x7fffffffffn) {
    const ret = lib.kernel32.VirtualQueryEx(handle, addr, mbi, mbi.length);
    if (!ret) break;
    const base = mbi.readBigUInt64LE(0);
    const regionSize = Number(mbi.readBigUInt64LE(24));
    const state = mbi.readUInt32LE(32);
    const protect = mbi.readUInt32LE(36);
    if (state === MEM_COMMIT && READABLE.has(protect) && regionSize > 0 && regionSize < 500 * 1024 * 1024) {
      regions.push({ base, size: regionSize });
    }
    const next = base + BigInt(regionSize);
    if (next <= addr) break;
    addr = next;
  }
  return regions;
}

function readMem(handle: unknown, lib: KoffiLib, addr: bigint, size: number): Buffer | null {
  const buf = Buffer.alloc(size);
  const read = { value: 0 };
  const ok = lib.kernel32.ReadProcessMemory(handle, addr, buf, size, read);
  if (!ok || read.value === 0) return null;
  return buf.subarray(0, read.value);
}

const HEX_CHARS = new Set('0123456789abcdefABCDEF');

function isHex64(data: Buffer, offset: number): boolean {
  for (let j = 0; j < 64; j++) {
    if (!HEX_CHARS.has(String.fromCharCode(data[offset + j]!))) return false;
  }
  return true;
}

function findHexKeysInBuffer(data: Buffer): string[] {
  const keys: string[] = [];
  for (let i = 0; i <= data.length - 64; i++) {
    if (isHex64(data, i)) {
      keys.push(data.subarray(i, i + 64).toString('ascii'));
      i += 63;
    }
  }
  return keys;
}

export function scanTraeDatabaseKey(dbPath: string): string | null {
  if (process.platform !== 'win32') return null;

  const envKey = process.env.MIRSCOPE_TRAE_DB_KEY?.trim();
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    const page1 = readFileSync(dbPath).subarray(0, PAGE_SZ);
    if (verifyEncKey(Buffer.from(envKey, 'hex'), page1)) return envKey;
  }

  const lib = loadKoffi();
  if (!lib) return envKey && /^[0-9a-fA-F]{64}$/.test(envKey) ? envKey : null;

  const pid = getTraeAiAgentPid();
  if (!pid) return null;

  const page1 = readFileSync(dbPath).subarray(0, PAGE_SZ);
  const handle = lib.kernel32.OpenProcess(0x0010 | 0x0400, 0, pid);
  if (!handle) return null;

  try {
    const regions = enumRegions(handle, lib);
    for (const { base, size } of regions) {
      const data = readMem(handle, lib, base, size);
      if (!data) continue;

      for (const hex of findHexKeysInBuffer(data)) {
        const encKey = Buffer.from(hex, 'hex');
        if (verifyEncKey(encKey, page1)) return hex;
      }
    }
  } finally {
    lib.kernel32.CloseHandle(handle);
  }

  return null;
}

export function resolveTraeDatabasePath(appDirCandidates: string[]): string | null {
  const dirs: string[] = [];
  if (process.env.MIRSCOPE_TRAE_DB_PATH?.trim()) {
    dirs.push(process.env.MIRSCOPE_TRAE_DB_PATH.trim());
  }
  for (const name of appDirCandidates) {
    dirs.push(join(process.env.APPDATA ?? '', name, 'ModularData', 'ai-agent', 'database.db'));
  }
  for (const p of dirs) {
    try {
      readFileSync(p);
      return p;
    } catch {
      // continue
    }
  }
  return null;
}
