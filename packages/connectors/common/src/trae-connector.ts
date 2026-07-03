import chokidar, { type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import type { ConnectorDetectResult, ConnectorManifest, ParsedConversation, RawPromptRecord } from '@mirscope/shared';
import { BaseConnector, conversationsToRawRecords } from './base.js';
import {
  detectVsCodeFork,
  readWorkspaceMapping,
  resolveVsCodeForkPaths,
} from './vscode-fork-paths.js';
import { parseTraeWorkspaceStorage } from './trae-icube-parser.js';
import { parseTraeEncryptedDatabase } from './trae-database-parser.js';
import { resolveTraeDatabasePath } from './trae-key-scanner.js';

export interface TraeConnectorConfig {
  manifest: ConnectorManifest;
  appDirCandidates: string[];
  envVar?: string;
}

function mergeTraeConversations(
  workspaceConversations: ParsedConversation[],
  databaseConversations: ParsedConversation[]
): ParsedConversation[] {
  const byId = new Map<string, ParsedConversation>();

  for (const conv of workspaceConversations) {
    byId.set(conv.id, conv);
  }

  for (const conv of databaseConversations) {
    const existing = byId.get(conv.id);
    if (!existing || conv.messages.length > existing.messages.length) {
      byId.set(conv.id, conv);
    }
  }

  return [...byId.values()];
}

export class TraeConnector extends BaseConnector {
  readonly manifest: ConnectorManifest;
  private readonly appDirCandidates: string[];
  private readonly envVar?: string;

  constructor(config: TraeConnectorConfig) {
    super();
    this.manifest = config.manifest;
    this.appDirCandidates = config.appDirCandidates;
    this.envVar = config.envVar;
  }

  private getPaths() {
    return resolveVsCodeForkPaths(this.appDirCandidates, { envVar: this.envVar });
  }

  private async loadConversations(): Promise<ParsedConversation[]> {
    const paths = this.getPaths();
    const mapping = paths ? readWorkspaceMapping(paths.workspaceStorage) : new Map<string, string>();
    const workspaceConversations = paths
      ? parseTraeWorkspaceStorage(paths.workspaceStorage, mapping)
      : [];

    const databaseConversations = await parseTraeEncryptedDatabase(this.appDirCandidates);
    return mergeTraeConversations(workspaceConversations, databaseConversations);
  }

  async detect(): Promise<ConnectorDetectResult> {
    const result = await detectVsCodeFork(this.manifest.name, this.appDirCandidates, {
      envVar: this.envVar,
    });
    if (!result.installed) return result;

    const paths = this.getPaths();
    const conversations = await this.loadConversations();
    const sessionCount = conversations.length;
    const dbPath = resolveTraeDatabasePath(this.appDirCandidates);

    return {
      ...result,
      message:
        sessionCount > 0
          ? `检测到 ${this.manifest.name}: ${paths?.userDir ?? ''}（${sessionCount} 个会话${dbPath ? '，含加密库' : ''}）`
          : dbPath
            ? `检测到 ${this.manifest.name}，对话在加密库中（需 Trae 运行时同步）`
            : result.message,
    };
  }

  parse(source: unknown): ParsedConversation[] {
    if (!source || typeof source !== 'object') return [];
    const { workspaceStorage, mapping } = source as {
      workspaceStorage: string;
      mapping?: Map<string, string>;
    };
    return parseTraeWorkspaceStorage(workspaceStorage, mapping);
  }

  async importHistory(since?: Date): Promise<RawPromptRecord[]> {
    const conversations = await this.loadConversations();
    let records = conversationsToRawRecords(conversations, this.manifest.id);

    if (since) {
      records = records.filter((r) => r.timestamp >= since);
    }

    return records;
  }

  async watch(onChange: () => void | Promise<void>): Promise<FSWatcher | null> {
    const paths = this.getPaths();
    if (!paths) return null;

    await this.stopWatch();

    const workspaceDbGlob = join(paths.workspaceStorage, '*', 'state.vscdb').replace(/\\/g, '/');
    const dbPath = resolveTraeDatabasePath(this.appDirCandidates);
    const watchTargets = [workspaceDbGlob];
    if (dbPath) watchTargets.push(dbPath);

    this.watcher = chokidar.watch(watchTargets, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 200 },
      ignorePermissionErrors: true,
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let processing = false;

    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (processing) return;
        processing = true;
        try {
          await onChange();
        } catch (err) {
          console.error(`[${this.manifest.id}Connector] watch sync error:`, err);
        } finally {
          processing = false;
        }
      }, 3000);
    };

    this.watcher.on('change', handleChange);
    this.watcher.on('add', handleChange);

    return this.watcher;
  }
}

export function createTraeConnector(config: TraeConnectorConfig): TraeConnector {
  return new TraeConnector(config);
}
