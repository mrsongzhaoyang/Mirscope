import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as schema from './schema.js';

export type MirscopeDatabase = BetterSQLite3Database<typeof schema>;

let dbInstance: MirscopeDatabase | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDataDir(basePath?: string): string {
  return basePath ?? join(process.cwd(), 'data');
}

export function initDatabase(dbPath?: string): MirscopeDatabase {
  if (dbInstance) return dbInstance;

  const dataDir = dbPath ? dirname(dbPath) : getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const resolvedPath = dbPath ?? join(dataDir, 'prompts.db');
  sqliteInstance = new Database(resolvedPath);
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('foreign_keys = ON');

  dbInstance = drizzle(sqliteInstance, { schema });

  initFts5(sqliteInstance);
  runMigrations(dbInstance);

  return dbInstance;
}

function initFts5(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
      prompt_id UNINDEXED,
      prompt,
      response,
      project,
      platform,
      tokenize = 'unicode61'
    );
  `);
}

function runMigrations(db: MirscopeDatabase): void {
  const migrationsFolder = join(__dirname, '../migrations');
  if (existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  } else if (sqliteInstance) {
    sqliteInstance.exec(`
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        workspace TEXT,
        project TEXT,
        project_path TEXT,
        file_path TEXT,
        provider TEXT,
        model TEXT,
        role TEXT NOT NULL,
        prompt TEXT,
        response TEXT,
        prompt_tokens INTEGER,
        response_tokens INTEGER,
        latency INTEGER,
        response_status TEXT,
        timestamp INTEGER NOT NULL,
        session_duration INTEGER,
        language TEXT,
        cost_estimate REAL,
        reuse_count INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        score INTEGER,
        optimized_version TEXT,
        optimization_notes TEXT,
        tags TEXT DEFAULT '[]',
        hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_prompts_platform ON prompts(platform);
      CREATE INDEX IF NOT EXISTS idx_prompts_timestamp ON prompts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_prompts_conversation ON prompts(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_prompts_model ON prompts(model);

      CREATE TABLE IF NOT EXISTS connector_sync (
        platform TEXT PRIMARY KEY,
        last_record_id TEXT,
        last_sync_time INTEGER,
        last_hash TEXT,
        version TEXT NOT NULL DEFAULT '1.0'
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
}

export function getDatabase(): MirscopeDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export function getSqlite(): Database.Database {
  if (!sqliteInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return sqliteInstance;
}

export function closeDatabase(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
    dbInstance = null;
  }
}

export * from './schema.js';
export * from './repository.js';
