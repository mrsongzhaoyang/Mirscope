import { BrowserWindow } from 'electron';
import type { PromptConnector } from '@mirscope/connectors-common';
import { createCursorConnector } from '@mirscope/connector-cursor';
import { createTraeConnector } from '@mirscope/connector-trae';
import { createCodeBuddyConnector } from '@mirscope/connector-codebuddy';
import { createClaudeCodeConnector } from '@mirscope/connector-claude-code';
import { SyncEngine } from '@mirscope/sync-engine';
import type { SyncProgress } from '@mirscope/shared';

export class ConnectorManager {
  private connectors: Map<string, PromptConnector> = new Map();
  private syncEngine = new SyncEngine();
  private onDataChange?: () => void;
  private syncing = false;
  private cancelRequested = false;

  constructor() {
    this.registerConnector(createCursorConnector());
    this.registerConnector(createTraeConnector());
    this.registerConnector(createCodeBuddyConnector());
    this.registerConnector(createClaudeCodeConnector());
  }

  registerConnector(connector: PromptConnector): void {
    this.connectors.set(connector.manifest.id, connector);
  }

  setOnDataChange(callback: () => void): void {
    this.onDataChange = callback;
  }

  cancelSync(): void {
    this.cancelRequested = true;
  }

  private emitProgress(progress: SyncProgress): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sync:progress', progress);
    }
  }

  private syncOptions() {
    return {
      onProgress: (progress: SyncProgress) => this.emitProgress(progress),
      isCancelled: () => this.cancelRequested,
    };
  }

  async initialize(): Promise<void> {
    await this.runSyncAll();

    for (const connector of this.connectors.values()) {
      await connector.watch(async () => {
        await this.runSyncConnector(connector);
      });
    }
  }

  private async runSyncAll(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    this.cancelRequested = false;
    try {
      await this.syncEngine.syncAll([...this.connectors.values()], this.syncOptions());
    } finally {
      this.syncing = false;
      this.cancelRequested = false;
    }
  }

  private async runSyncConnector(connector: PromptConnector): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    this.cancelRequested = false;
    try {
      const result = await this.syncEngine.syncConnector(connector, this.syncOptions());
      if (result.imported > 0) {
        this.onDataChange?.();
      }
    } finally {
      this.syncing = false;
      this.cancelRequested = false;
    }
  }

  async shutdown(): Promise<void> {
    this.cancelRequested = true;
    for (const connector of this.connectors.values()) {
      await connector.stopWatch();
    }
  }

  listConnectors() {
    return [...this.connectors.values()].map((c) => ({
      ...c.manifest,
      enabled: true,
    }));
  }

  getConnector(id: string): PromptConnector | undefined {
    return this.connectors.get(id);
  }

  async detectAll() {
    const results = [];
    for (const connector of this.connectors.values()) {
      const detection = await connector.detect();
      results.push({
        id: connector.manifest.id,
        name: connector.manifest.name,
        ...detection,
      });
    }
    return results;
  }

  async syncAll() {
    if (this.syncing) return [];
    this.syncing = true;
    this.cancelRequested = false;
    try {
      const results = await this.syncEngine.syncAll(
        [...this.connectors.values()],
        this.syncOptions()
      );
      this.onDataChange?.();
      return results;
    } finally {
      this.syncing = false;
      this.cancelRequested = false;
    }
  }

  async syncOne(id: string) {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`Connector not found: ${id}`);
    if (this.syncing) throw new Error('Sync already in progress');
    this.syncing = true;
    this.cancelRequested = false;
    try {
      const result = await this.syncEngine.syncConnector(connector, this.syncOptions());
      if (result.imported > 0) this.onDataChange?.();
      return result;
    } finally {
      this.syncing = false;
      this.cancelRequested = false;
    }
  }
}
