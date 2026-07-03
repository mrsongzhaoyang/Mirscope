import Database from 'better-sqlite3';
import { join } from 'node:path';
import { homedir } from 'node:os';

const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
const dbPath = join(appData, 'Trae CN', 'User', 'globalStorage', 'state.vscdb');
console.log('DB:', dbPath);

const db = new Database(dbPath, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('TABLES:', tables.map((t) => t.name));

for (const t of tables) {
  const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
  console.log(`  ${t.name}: ${cnt.c} rows`);
}

try {
  const keys = db
    .prepare(
      `SELECT key FROM ItemTable WHERE key LIKE '%composer%' OR key LIKE '%chat%' OR key LIKE '%icube%' OR key LIKE '%ai%' OR key LIKE '%conversation%' OR key LIKE '%prompt%' LIMIT 40`
    )
    .all();
  console.log('\nItemTable keys:', keys.map((k) => k.key));
} catch (e) {
  console.log('ItemTable err', e.message);
}

for (const table of ['cursorDiskKV', 'ItemTable']) {
  try {
    const prefixRows = db
      .prepare(`SELECT DISTINCT substr(key, 1, 30) as p, COUNT(*) as c FROM ${table} GROUP BY p ORDER BY c DESC LIMIT 15`)
      .all();
    console.log(`\n${table} key prefixes:`, prefixRows);
  } catch (e) {
    console.log(`${table} prefix err`, e.message);
  }
}

try {
  const c = db.prepare("SELECT COUNT(*) as c FROM cursorDiskKV WHERE key LIKE 'composerData:%'").get();
  console.log('\ncomposerData count:', c.c);
} catch (e) {
  console.log('composerData err', e.message);
}

db.close();
