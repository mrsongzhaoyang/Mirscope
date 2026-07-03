import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import type { ParsedConversation, ParsedMessage } from '@mirscope/shared';
import { isNoisePrompt } from '@mirscope/shared';
import { ensureDecryptedTraeDatabase } from './trae-database-decrypt.js';
import { resolveTraeDatabasePath, scanTraeDatabaseKey } from './trae-key-scanner.js';

interface HistoryMessage {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface HistoryPayload {
  raw_messages?: HistoryMessage[];
}

function extractTextContent(content: HistoryMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((p) => p?.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n');
}

function extractUserPrompt(content: string): string {
  const userInput = content.match(/<user_input>\s*([\s\S]*?)\s*<\/user_input>/i);
  if (userInput?.[1]?.trim()) return userInput[1].trim();

  if (!content.includes('<system-reminder>') && content.trim().length > 2) {
    return content.trim();
  }
  return '';
}

function stableMessageId(sessionId: string, text: string): string {
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return `${sessionId}-${digest}`;
}

function parseHistoryMessages(
  sessionId: string,
  messagesJson: string,
  createdAt?: number
): ParsedMessage[] {
  const messages: ParsedMessage[] = [];
  let payload: HistoryPayload;
  try {
    payload = JSON.parse(messagesJson) as HistoryPayload;
  } catch {
    return messages;
  }

  for (const raw of payload.raw_messages ?? []) {
    if (raw.role !== 'user') continue;
    const text = extractUserPrompt(extractTextContent(raw.content));
    if (!text || isNoisePrompt(text)) continue;

    messages.push({
      id: stableMessageId(sessionId, text),
      role: 'user',
      content: text,
      timestamp: createdAt ? new Date(createdAt * 1000) : undefined,
    });
  }

  return messages;
}

export async function parseTraeEncryptedDatabase(
  appDirCandidates: string[]
): Promise<ParsedConversation[]> {
  const dbPath = resolveTraeDatabasePath(appDirCandidates);
  if (!dbPath) return [];

  const encKey = scanTraeDatabaseKey(dbPath);
  if (!encKey) return [];

  let decryptedPath: string;
  try {
    decryptedPath = await ensureDecryptedTraeDatabase(dbPath, encKey);
  } catch {
    return [];
  }

  const conversations: ParsedConversation[] = [];
  const db = new Database(decryptedPath, { readonly: true });

  try {
    const projectPaths = new Map<string, string>();
    try {
      const rows = db
        .prepare(
          `SELECT sp.session_id, m.path
           FROM session_project sp
           LEFT JOIN multi_root_path m ON sp.project_id = m.project_id
           WHERE m.path IS NOT NULL`
        )
        .all() as Array<{ session_id: string; path: string }>;
      for (const row of rows) {
        projectPaths.set(row.session_id, row.path);
      }
    } catch {
      // optional tables
    }

    const sessions = db
      .prepare(
        `SELECT session_id, session_title, created_at, updated_at
         FROM chat_session
         ORDER BY updated_at DESC`
      )
      .all() as Array<{
      session_id: string;
      session_title?: string;
      created_at?: number;
      updated_at?: number;
    }>;

    const historyStmt = db.prepare(
      `SELECT messages, created_at, message_id, history_v2_id
       FROM history_v2
       WHERE session_id = ? AND messages IS NOT NULL
       ORDER BY created_at ASC`
    );

    for (const session of sessions) {
      const historyRows = historyStmt.all(session.session_id) as Array<{
        messages: string;
        created_at?: number;
        message_id?: string;
        history_v2_id?: string;
      }>;

      const messages: ParsedMessage[] = [];
      const seenContent = new Set<string>();
      for (const row of historyRows) {
        for (const msg of parseHistoryMessages(
          session.session_id,
          row.messages,
          row.created_at
        )) {
          const contentKey = msg.content.trim();
          if (seenContent.has(contentKey)) continue;
          seenContent.add(contentKey);
          messages.push(msg);
        }
      }

      if (messages.length === 0) continue;

      const projectPath = projectPaths.get(session.session_id);
      conversations.push({
        id: session.session_id,
        name: session.session_title,
        workspacePath: projectPath,
        projectPath,
        createdAt: session.created_at ? new Date(session.created_at * 1000) : undefined,
        updatedAt: session.updated_at ? new Date(session.updated_at * 1000) : undefined,
        messages,
      });
    }
  } finally {
    db.close();
  }

  return conversations;
}
