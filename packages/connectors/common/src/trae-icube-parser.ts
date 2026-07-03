import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedConversation, ParsedMessage } from '@mirscope/shared';
import { isNoisePrompt } from '@mirscope/shared';

const ICUBE_STORAGE_KEY = 'memento/icube-ai-agent-storage';
const INPUT_HISTORY_KEY = 'icube-ai-agent-storage-input-history';

interface TraeSession {
  sessionId: string;
  createdAt?: number;
  updatedAt?: number;
  messages?: TraeMessage[];
}

interface TraeMessage {
  role?: string;
  content?: string;
  turnIndex?: number;
  timestamp?: number;
  agentMessageId?: string;
  turnId?: string;
  modelInfo?: {
    config_name?: string;
    display_model_name?: string;
  };
}

interface TraeStorage {
  list?: TraeSession[];
  currentSessionId?: string;
}

interface TraeInputHistoryEntry {
  inputText?: string;
  parsedQuery?: string[];
}

function openReadOnlyDb(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function parseJsonValue<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (Buffer.isBuffer(value)) {
    try {
      return JSON.parse(value.toString('utf-8')) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function readTraeStorage(db: Database.Database): TraeStorage | null {
  try {
    const row = db
      .prepare(`SELECT value FROM ItemTable WHERE key = ?`)
      .get(ICUBE_STORAGE_KEY) as { value: unknown } | undefined;
    return parseJsonValue<TraeStorage>(row?.value);
  } catch {
    return null;
  }
}

function readInputHistory(db: Database.Database): TraeInputHistoryEntry[] {
  try {
    const row = db
      .prepare(`SELECT value FROM ItemTable WHERE key = ?`)
      .get(INPUT_HISTORY_KEY) as { value: unknown } | undefined;
    return parseJsonValue<TraeInputHistoryEntry[]>(row?.value) ?? [];
  } catch {
    return [];
  }
}

function parseInputHistoryMessages(
  sessionId: string,
  entries: TraeInputHistoryEntry[]
): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const text = (entry.inputText ?? entry.parsedQuery?.[0] ?? '').trim();
    if (!text || seen.has(text) || isNoisePrompt(text)) continue;
    seen.add(text);

    messages.push({
      id: `${sessionId}-${createHash('sha256').update(text).digest('hex').slice(0, 16)}`,
      role: 'user',
      content: text,
    });
  }

  return messages;
}

function sessionName(session: TraeSession, projectPath?: string): string | undefined {
  const firstUser = session.messages?.find((m) => m.role === 'user' && m.content?.trim());
  if (firstUser?.content) {
    const text = firstUser.content.trim();
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  }
  if (projectPath) {
    const parts = projectPath.split(/[/\\]/).filter(Boolean);
    return parts[parts.length - 1];
  }
  return undefined;
}

function parseSessionMessages(session: TraeSession): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  const sorted = [...(session.messages ?? [])].sort(
    (a, b) => (a.turnIndex ?? 0) - (b.turnIndex ?? 0)
  );

  let orderMs = session.createdAt ?? Date.now();

  for (const msg of sorted) {
    if (msg.role !== 'user') continue;

    const content = (msg.content ?? '').trim();
    if (!content || isNoisePrompt(content)) continue;

    const realTs = msg.timestamp ?? 0;
    const ts = realTs > orderMs ? realTs : orderMs;
    orderMs = ts + 1;

    messages.push({
      id: msg.agentMessageId ?? msg.turnId ?? `${session.sessionId}-${msg.turnIndex ?? messages.length}`,
      role: 'user',
      content,
      timestamp: new Date(ts),
      model: msg.modelInfo?.display_model_name ?? msg.modelInfo?.config_name,
    });
  }

  return messages;
}

export function parseTraeWorkspaceDb(
  dbPath: string,
  projectPath?: string
): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];
  let db: Database.Database | null = null;

  try {
    db = openReadOnlyDb(dbPath);
    const storage = readTraeStorage(db);
    const inputHistory = readInputHistory(db);

    if (!storage?.list?.length && inputHistory.length === 0) return conversations;

    const sessions = storage?.list ?? [];
    if (sessions.length === 0 && inputHistory.length > 0) {
      const sessionId = storage?.currentSessionId ?? `workspace-${hashPath(dbPath)}`;
      const messages = parseInputHistoryMessages(sessionId, inputHistory);
      if (messages.length > 0) {
        conversations.push({
          id: sessionId,
          name: messages[0]?.content.slice(0, 60),
          workspacePath: projectPath,
          projectPath,
          messages,
        });
      }
      return conversations;
    }

    for (const session of sessions) {
      if (!session.sessionId) continue;
      let messages = parseSessionMessages(session);
      if (messages.length === 0 && inputHistory.length > 0) {
        messages = parseInputHistoryMessages(session.sessionId, inputHistory);
      }
      if (messages.length === 0) continue;

      conversations.push({
        id: session.sessionId,
        name: sessionName(session, projectPath),
        workspacePath: projectPath,
        projectPath,
        createdAt: session.createdAt ? new Date(session.createdAt) : undefined,
        updatedAt: session.updatedAt ? new Date(session.updatedAt) : undefined,
        messages,
      });
    }
  } catch {
    // skip unreadable workspace db
  } finally {
    db?.close();
  }

  return conversations;
}

function hashPath(dbPath: string): string {
  let hash = 0;
  for (let i = 0; i < dbPath.length; i++) {
    hash = (hash * 31 + dbPath.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

export function parseTraeWorkspaceStorage(
  workspaceStorageDir: string,
  workspaceMapping?: Map<string, string>
): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];
  if (!existsSync(workspaceStorageDir)) return conversations;

  const dirs = readdirSync(workspaceStorageDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const hash of dirs) {
    const dbPath = join(workspaceStorageDir, hash, 'state.vscdb');
    if (!existsSync(dbPath)) continue;

    const projectPath = workspaceMapping?.get(hash);
    conversations.push(...parseTraeWorkspaceDb(dbPath, projectPath));
  }

  return conversations;
}
