import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ParsedConversation, ParsedMessage } from '@mirscope/shared';
import { isNoisePrompt } from '@mirscope/shared';

interface ClaudeJsonlEntry {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  uuid?: string;
  cwd?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }> | string;
  };
}

const SKIP_USER_TEXT = /^\[Request interrupted by user\]$/i;

/** Claude Code 项目目录名解码，如 d--traexmgl-Mirscope → d:\traexmgl\Mirscope */
export function decodeClaudeProjectDir(dirname: string): string {
  const driveMatch = dirname.match(/^([a-zA-Z])--(.+)$/);
  if (driveMatch) {
    const drive = driveMatch[1].toUpperCase();
    const segments = driveMatch[2].split('-');
    return `${drive}:\\${segments.join('\\')}`;
  }
  return dirname;
}

function extractUserText(entry: ClaudeJsonlEntry): string {
  if (entry.type !== 'user' || !entry.message) return '';
  const content = entry.message.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!.trim())
    .join('\n')
    .trim();
}

async function parseJsonlFile(
  filePath: string,
  projectPath: string,
  sessionId: string
): Promise<ParsedConversation | null> {
  const messages: ParsedMessage[] = [];
  let latestTs: Date | undefined;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry: ClaudeJsonlEntry;
    try {
      entry = JSON.parse(line) as ClaudeJsonlEntry;
    } catch {
      continue;
    }

    if (entry.type !== 'user') continue;

    const text = extractUserText(entry);
    if (!text || SKIP_USER_TEXT.test(text) || isNoisePrompt(text)) continue;

    const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
    if (!latestTs || ts > latestTs) latestTs = ts;

    messages.push({
      id: entry.uuid ?? `${sessionId}-${messages.length}`,
      role: 'user',
      content: text,
      timestamp: ts,
      metadata: { entrypoint: (entry as Record<string, unknown>).entrypoint },
    });
  }

  if (messages.length === 0) return null;

  return {
    id: sessionId,
    name: basename(filePath, '.jsonl'),
    workspacePath: projectPath,
    projectPath,
    updatedAt: latestTs,
    messages,
  };
}

export async function parseClaudeProjectsDir(projectsDir: string): Promise<ParsedConversation[]> {
  const conversations: ParsedConversation[] = [];
  if (!existsSync(projectsDir)) return conversations;

  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dirName of projectDirs) {
    const projectPath = decodeClaudeProjectDir(dirName);
    const projectDir = join(projectsDir, dirName);

    const jsonlFiles = readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(projectDir, f));

    for (const filePath of jsonlFiles) {
      const sessionId = basename(filePath, '.jsonl');
      const conv = await parseJsonlFile(filePath, projectPath, sessionId);
      if (conv) conversations.push(conv);
    }
  }

  return conversations;
}

/** 同步读取（小文件 fallback） */
export function parseClaudeProjectsDirSync(projectsDir: string): ParsedConversation[] {
  const conversations: ParsedConversation[] = [];
  if (!existsSync(projectsDir)) return conversations;

  for (const dirName of readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)) {
    const projectPath = decodeClaudeProjectDir(dirName);
    const projectDir = join(projectsDir, dirName);

    for (const file of readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))) {
      const filePath = join(projectDir, file);
      const sessionId = basename(file, '.jsonl');
      const messages: ParsedMessage[] = [];
      let latestTs: Date | undefined;

      const lines = readFileSync(filePath, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        let entry: ClaudeJsonlEntry;
        try {
          entry = JSON.parse(line) as ClaudeJsonlEntry;
        } catch {
          continue;
        }
        if (entry.type !== 'user') continue;
        const text = extractUserText(entry);
        if (!text || SKIP_USER_TEXT.test(text) || isNoisePrompt(text)) continue;
        const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
        if (!latestTs || ts > latestTs) latestTs = ts;
        messages.push({
          id: entry.uuid ?? `${sessionId}-${messages.length}`,
          role: 'user',
          content: text,
          timestamp: ts,
        });
      }

      if (messages.length > 0) {
        conversations.push({
          id: sessionId,
          workspacePath: projectPath,
          projectPath,
          updatedAt: latestTs,
          messages,
        });
      }
    }
  }

  return conversations;
}

export function getClaudeProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

export function claudeProjectsDirExists(dir?: string): boolean {
  const projectsDir = dir ?? getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return false;
  try {
    const entries = readdirSync(projectsDir, { withFileTypes: true });
    return entries.some((e) => e.isDirectory());
  } catch {
    return false;
  }
}

export function countClaudeJsonlFiles(projectsDir: string): number {
  if (!existsSync(projectsDir)) return 0;
  let count = 0;
  for (const dir of readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    count += readdirSync(join(projectsDir, dir.name)).filter((f) => f.endsWith('.jsonl')).length;
  }
  return count;
}

export function getLatestJsonlMtime(projectsDir: string): number {
  if (!existsSync(projectsDir)) return 0;
  let latest = 0;
  for (const dir of readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of readdirSync(join(projectsDir, dir.name)).filter((f) => f.endsWith('.jsonl'))) {
      const mtime = statSync(join(projectsDir, dir.name, file)).mtimeMs;
      if (mtime > latest) latest = mtime;
    }
  }
  return latest;
}
