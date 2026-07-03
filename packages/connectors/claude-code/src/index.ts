import chokidar, { type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import {
  BaseConnector,
  conversationsToRawRecords,
  type PromptConnector,
} from '@mirscope/connectors-common';
import type { ConnectorDetectResult, ParsedConversation, RawPromptRecord } from '@mirscope/shared';
import { detectClaudeCode } from './detect.js';
import { claudeCodeManifest } from './manifest.js';
import { getClaudeProjectsDir, parseClaudeProjectsDirSync } from './parser.js';

export class ClaudeCodeConnector extends BaseConnector implements PromptConnector {
  readonly manifest = claudeCodeManifest;

  private getProjectsDir(): string {
    return process.env.MIRSCOPE_CLAUDE_PROJECTS_DIR?.trim() || getClaudeProjectsDir();
  }

  async detect(): Promise<ConnectorDetectResult> {
    return detectClaudeCode();
  }

  parse(source: unknown): ParsedConversation[] {
    const dir = typeof source === 'string' ? source : this.getProjectsDir();
    return parseClaudeProjectsDirSync(dir);
  }

  async importHistory(since?: Date): Promise<RawPromptRecord[]> {
    const detection = await this.detect();
    if (!detection.installed) return [];

    const conversations = parseClaudeProjectsDirSync(this.getProjectsDir());
    let records = conversationsToRawRecords(conversations, this.manifest.id);

    if (since) {
      records = records.filter((r) => r.timestamp >= since);
    }

    return records;
  }

  async watch(onChange: () => void | Promise<void>): Promise<FSWatcher | null> {
    const detection = await this.detect();
    if (!detection.installed) return null;

    await this.stopWatch();

    const projectsDir = this.getProjectsDir();
    const glob = join(projectsDir, '**', '*.jsonl').replace(/\\/g, '/');

    this.watcher = chokidar.watch(glob, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 200 },
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
          console.error('[ClaudeCodeConnector] watch sync error:', err);
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

export function createClaudeCodeConnector(): ClaudeCodeConnector {
  return new ClaudeCodeConnector();
}
