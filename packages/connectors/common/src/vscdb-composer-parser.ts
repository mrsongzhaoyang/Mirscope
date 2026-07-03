import Database from 'better-sqlite3';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ParsedConversation, ParsedMessage, PromptRole } from '@mirscope/shared';
import { isNoisePrompt } from '@mirscope/shared';

interface ComposerHeader {
  composerId: string;
  name?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  unifiedMode?: string;
  workspaceIdentifier?: {
    id?: string;
    uri?: { fsPath?: string; external?: string };
  };
}

interface ComposerData {
  composerId?: string;
  name?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  conversation?: Array<{
    bubbleId?: string;
    type?: number;
    text?: string;
    richText?: unknown;
    createdAt?: number;
    model?: string;
  }>;
  fullConversationHeadersOnly?: Array<{
    bubbleId?: string;
    type?: number;
    createdAt?: number;
  }>;
  allComposers?: ComposerHeader[];
}

interface BubbleData {
  type?: number;
  text?: string;
  richText?: unknown;
  createdAt?: number;
  model?: string;
  bubbleId?: string;
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

function extractText(data: BubbleData): string {
  if (data.text) return data.text;
  if (data.richText) return extractRichText(data.richText);
  return '';
}

function extractRichText(richText: unknown): string {
  if (typeof richText === 'string') return richText;
  if (!richText || typeof richText !== 'object') return '';

  const obj = richText as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text;

  if (Array.isArray((obj.root as Record<string, unknown> | undefined)?.children)) {
    return extractLexicalNodes((obj.root as { children: unknown[] }).children);
  }

  return JSON.stringify(richText);
}

function extractLexicalNodes(nodes: unknown[]): string {
  let text = '';
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const n = node as Record<string, unknown>;
    if (typeof n.text === 'string') text += n.text;
    if (Array.isArray(n.children)) text += extractLexicalNodes(n.children);
  }
  return text;
}

function bubbleTypeToRole(type?: number): PromptRole {
  if (type === 1) return 'user';
  if (type === 2) return 'assistant';
  return 'assistant';
}

export function parseGlobalDb(
  globalDbPath: string,
  workspaceMapping: Map<string, string>
): ParsedConversation[] {
  const db = openReadOnlyDb(globalDbPath);
  const conversations: ParsedConversation[] = [];

  try {
    const composerIds = discoverComposerIds(db, workspaceMapping);

    for (const { composerId, name, workspacePath, createdAt, updatedAt } of composerIds) {
      const messages = parseComposerMessages(db, composerId);
      if (messages.length === 0) continue;

      conversations.push({
        id: composerId,
        name,
        workspacePath,
        projectPath: workspacePath,
        createdAt: createdAt ? new Date(createdAt) : undefined,
        updatedAt: updatedAt ? new Date(updatedAt) : undefined,
        messages,
      });
    }
  } finally {
    db.close();
  }

  return conversations;
}

function resolveWorkspacePath(
  header: ComposerHeader,
  workspaceMapping: Map<string, string>
): string | undefined {
  const wsId = header.workspaceIdentifier?.id;
  if (wsId && workspaceMapping.has(wsId)) {
    return workspaceMapping.get(wsId);
  }
  const uri = header.workspaceIdentifier?.uri;
  if (uri?.fsPath) return uri.fsPath;
  if (uri?.external) {
    return decodeURIComponent(uri.external.replace(/^file:\/\//, ''));
  }
  return undefined;
}

function discoverComposerIds(
  db: Database.Database,
  workspaceMapping: Map<string, string>
): Array<{
  composerId: string;
  name?: string;
  workspacePath?: string;
  createdAt?: number;
  updatedAt?: number;
}> {
  const results = new Map<
    string,
    {
      composerId: string;
      name?: string;
      workspacePath?: string;
      createdAt?: number;
      updatedAt?: number;
    }
  >();

  try {
    const headersRow = db
      .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerHeaders'`)
      .get() as { value: unknown } | undefined;

    const headers = parseJsonValue<{ allComposers?: ComposerHeader[] }>(headersRow?.value);
    for (const header of headers?.allComposers ?? []) {
      if (!header.composerId) continue;
      results.set(header.composerId, {
        composerId: header.composerId,
        name: header.name,
        workspacePath: resolveWorkspacePath(header, workspaceMapping),
        createdAt: header.createdAt,
        updatedAt: header.lastUpdatedAt,
      });
    }
  } catch {
    // ItemTable may not exist
  }

  try {
    const rows = db
      .prepare(`SELECT key FROM cursorDiskKV WHERE key LIKE 'composerData:%'`)
      .all() as Array<{ key: string }>;

    for (const row of rows) {
      const composerId = row.key.replace('composerData:', '');
      if (results.has(composerId)) continue;

      const dataRow = db
        .prepare(`SELECT value FROM cursorDiskKV WHERE key = ?`)
        .get(`composerData:${composerId}`) as { value: unknown } | undefined;

      const data = parseJsonValue<ComposerData>(dataRow?.value);
      results.set(composerId, {
        composerId,
        name: data?.name,
        createdAt: data?.createdAt,
        updatedAt: data?.lastUpdatedAt,
      });
    }
  } catch {
    // cursorDiskKV may not exist
  }

  return [...results.values()];
}

function parseComposerMessages(db: Database.Database, composerId: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  const dataRow = db
    .prepare(`SELECT value FROM cursorDiskKV WHERE key = ?`)
    .get(`composerData:${composerId}`) as { value: unknown } | undefined;

  const composerData = parseJsonValue<ComposerData>(dataRow?.value);

  const headers = composerData?.fullConversationHeadersOnly;
  if (headers?.length) {
    for (const header of headers) {
      if (!header.bubbleId) continue;

      const bubbleRow = db
        .prepare(`SELECT value FROM cursorDiskKV WHERE key = ?`)
        .get(`bubbleId:${composerId}:${header.bubbleId}`) as { value: unknown } | undefined;

      const bubble = parseJsonValue<BubbleData>(bubbleRow?.value);
      const content = extractText(bubble ?? {});
      if (!content.trim() || isNoisePrompt(content)) continue;

      messages.push({
        id: header.bubbleId,
        role: bubbleTypeToRole(header.type ?? bubble?.type),
        content,
        timestamp: bubble?.createdAt ? new Date(bubble.createdAt) : undefined,
        model: bubble?.model,
      });
    }
    if (messages.length > 0) return messages;
  }

  if (composerData?.conversation?.length) {
    for (const bubble of composerData.conversation) {
      const content = extractText(bubble);
      if (!content.trim() || isNoisePrompt(content)) continue;
      messages.push({
        id: bubble.bubbleId ?? `${composerId}-${messages.length}`,
        role: bubbleTypeToRole(bubble.type),
        content,
        timestamp: bubble.createdAt ? new Date(bubble.createdAt) : undefined,
        model: bubble.model,
      });
    }
    return messages;
  }

  try {
    const bubbleRows = db
      .prepare(`SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key`)
      .all(`bubbleId:${composerId}:%`) as Array<{ key: string; value: unknown }>;

    for (const row of bubbleRows) {
      const bubble = parseJsonValue<BubbleData>(row.value);
      if (!bubble) continue;
      const content = extractText(bubble);
      if (!content.trim() || isNoisePrompt(content)) continue;
      messages.push({
        id: row.key,
        role: bubbleTypeToRole(bubble.type),
        content,
        timestamp: bubble.createdAt ? new Date(bubble.createdAt) : undefined,
        model: bubble.model,
      });
    }
  } catch {
    // ignore
  }

  return messages;
}

export function parseWorkspaceDbs(
  workspaceStorageDir: string,
  workspaceMapping: Map<string, string>
): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];
  if (!existsSync(workspaceStorageDir)) return conversations;

  const dirs = readdirSync(workspaceStorageDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const hash of dirs) {
    const dbPath = join(workspaceStorageDir, hash, 'state.vscdb');
    if (!existsSync(dbPath)) continue;

    const projectPath = workspaceMapping.get(hash);
    let db: Database.Database | null = null;

    try {
      db = openReadOnlyDb(dbPath);
      const row = db
        .prepare(`SELECT value FROM ItemTable WHERE key = 'composer.composerData'`)
        .get() as { value: unknown } | undefined;

      const data = parseJsonValue<ComposerData>(row?.value);
      for (const composer of data?.allComposers ?? []) {
        if (!composer.composerId) continue;
        conversations.push({
          id: composer.composerId,
          name: composer.name,
          workspacePath: projectPath,
          projectPath,
          createdAt: composer.createdAt ? new Date(composer.createdAt) : undefined,
          updatedAt: composer.lastUpdatedAt ? new Date(composer.lastUpdatedAt) : undefined,
          messages: [],
        });
      }
    } catch {
      // skip unreadable workspace db
    } finally {
      db?.close();
    }
  }

  return conversations;
}

export function parseVsCodeForkData(
  globalDbPath: string,
  workspaceStorageDir: string,
  workspaceMapping: Map<string, string>
): ParsedConversation[] {
  if (!existsSync(globalDbPath)) return [];

  const globalConversations = parseGlobalDb(globalDbPath, workspaceMapping);
  const workspaceMeta = parseWorkspaceDbs(workspaceStorageDir, workspaceMapping);

  const metaById = new Map(workspaceMeta.map((c) => [c.id, c]));
  return globalConversations.map((conv) => {
    const meta = metaById.get(conv.id);
    if (!meta) return conv;
    return {
      ...conv,
      workspacePath: conv.workspacePath ?? meta.workspacePath,
      projectPath: conv.projectPath ?? meta.projectPath,
      name: conv.name ?? meta.name,
    };
  });
}
