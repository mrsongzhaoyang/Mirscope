import chokidar, { type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import type { ConnectorDetectResult, ConnectorManifest, ParsedConversation, RawPromptRecord } from '@mirscope/shared';
import { BaseConnector, conversationsToRawRecords } from './base.js';
import {
  detectVsCodeFork,
  readWorkspaceMapping,
  resolveVsCodeForkPaths,
  type VsCodeForkPaths,
} from './vscode-fork-paths.js';
import { parseVsCodeForkData } from './vscdb-composer-parser.js';

export interface VsCodeForkConnectorConfig {
  manifest: ConnectorManifest;
  appDirCandidates: string[];
  envVar?: string;
}

export class VsCodeForkConnector extends BaseConnector {
  readonly manifest: ConnectorManifest;
  private readonly appDirCandidates: string[];
  private readonly envVar?: string;

  constructor(config: VsCodeForkConnectorConfig) {
    super();
    this.manifest = config.manifest;
    this.appDirCandidates = config.appDirCandidates;
    this.envVar = config.envVar;
  }

  private getPaths(): VsCodeForkPaths | null {
    return resolveVsCodeForkPaths(this.appDirCandidates, { envVar: this.envVar });
  }

  async detect(): Promise<ConnectorDetectResult> {
    return detectVsCodeFork(this.manifest.name, this.appDirCandidates, { envVar: this.envVar });
  }

  parse(source: unknown): ParsedConversation[] {
    if (!source || typeof source !== 'object') return [];
    const { globalDb, workspaceStorage, mapping } = source as {
      globalDb: string;
      workspaceStorage: string;
      mapping: Map<string, string>;
    };
    return parseVsCodeForkData(globalDb, workspaceStorage, mapping);
  }

  async importHistory(since?: Date): Promise<RawPromptRecord[]> {
    const paths = this.getPaths();
    if (!paths) return [];

    const mapping = readWorkspaceMapping(paths.workspaceStorage);
    const conversations = parseVsCodeForkData(paths.globalDb, paths.workspaceStorage, mapping);
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

    this.watcher = chokidar.watch([paths.globalDb, workspaceDbGlob], {
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

export function createVsCodeForkConnector(config: VsCodeForkConnectorConfig): VsCodeForkConnector {
  return new VsCodeForkConnector(config);
}
