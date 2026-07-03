import type { FSWatcher } from 'chokidar';
import type {
  ConnectorDetectResult,
  ConnectorManifest,
  ParsedConversation,
  RawPromptRecord,
} from '@mirscope/shared';

export interface PromptConnector {
  readonly manifest: ConnectorManifest;
  detect(): Promise<ConnectorDetectResult>;
  importHistory(since?: Date): Promise<RawPromptRecord[]>;
  watch(onChange: () => void | Promise<void>): Promise<FSWatcher | null>;
  parse(source: unknown): ParsedConversation[];
  stopWatch(): Promise<void>;
}

export abstract class BaseConnector implements PromptConnector {
  abstract readonly manifest: ConnectorManifest;
  protected watcher: FSWatcher | null = null;

  abstract detect(): Promise<ConnectorDetectResult>;
  abstract importHistory(since?: Date): Promise<RawPromptRecord[]>;
  abstract watch(onChange: () => void | Promise<void>): Promise<FSWatcher | null>;
  abstract parse(source: unknown): ParsedConversation[];

  async stopWatch(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}

export function conversationsToRawRecords(
  conversations: ParsedConversation[],
  platform: string
): RawPromptRecord[] {
  const records: RawPromptRecord[] = [];
  const seen = new Set<string>();

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== 'user') continue;
      if (!msg.content?.trim()) continue;

      const dedupeKey = `${platform}|${conv.id}|${msg.content.trim()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      records.push({
        conversationId: conv.id,
        platform,
        workspace: conv.workspacePath,
        project: conv.projectPath ? conv.projectPath.split(/[/\\]/).pop() : undefined,
        projectPath: conv.projectPath,
        role: 'user',
        prompt: msg.content,
        model: msg.model,
        timestamp: msg.timestamp ?? conv.updatedAt ?? conv.createdAt ?? new Date(0),
        sourceId: msg.id,
        metadata: msg.metadata,
      });
    }
  }

  return records;
}
