import { eq } from 'drizzle-orm';
import type { PromptConnector } from '@mirscope/connectors-common';
import { connectorSync, getDatabase, insertPrompts, purgeNoisePrompts, purgePromptResponses, dedupePrompts } from '@mirscope/database';
import { NormalizationEngine } from '@mirscope/normalization';
import type { ConnectorSyncState, SyncProgress } from '@mirscope/shared';

export interface SyncResult {
  platform: string;
  imported: number;
  skipped: number;
  syncTime: Date;
  cancelled?: boolean;
}

export interface SyncOptions {
  onProgress?: (progress: SyncProgress) => void;
  isCancelled?: () => boolean;
}

export class SyncEngine {
  private normalizer = new NormalizationEngine();

  async getSyncState(platform: string): Promise<ConnectorSyncState | null> {
    const db = getDatabase();
    const rows = await db
      .select()
      .from(connectorSync)
      .where(eq(connectorSync.platform, platform))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      platform: row.platform,
      lastRecordId: row.lastRecordId,
      lastSyncTime: row.lastSyncTime,
      lastHash: row.lastHash,
      version: row.version,
    };
  }

  async syncConnector(connector: PromptConnector, options?: SyncOptions): Promise<SyncResult> {
    const platform = connector.manifest.id;
    const emit = (progress: SyncProgress) => options?.onProgress?.(progress);

    if (options?.isCancelled?.()) {
      emit({ stage: 'cancelled', platform, progress: 0, message: '已取消' });
      return { platform, imported: 0, skipped: 0, syncTime: new Date(), cancelled: true };
    }

    const detection = await connector.detect();
    if (!detection.installed) {
      return { platform, imported: 0, skipped: 0, syncTime: new Date() };
    }

    emit({ stage: 'fetch', platform, progress: 10, message: `读取 ${connector.manifest.name} 数据...` });
    const state = await this.getSyncState(platform);
    const since = state?.lastSyncTime ?? undefined;
    const rawRecords = await connector.importHistory(since);

    if (options?.isCancelled?.()) {
      emit({ stage: 'cancelled', platform, progress: 0, message: '已取消' });
      return { platform, imported: 0, skipped: 0, syncTime: new Date(), cancelled: true };
    }

    emit({ stage: 'normalize', platform, progress: 40, message: `标准化 ${rawRecords.length} 条...` });
    const normalized = this.normalizer.normalize(rawRecords);

    if (options?.isCancelled?.()) {
      emit({ stage: 'cancelled', platform, progress: 0, message: '已取消' });
      return { platform, imported: 0, skipped: 0, syncTime: new Date(), cancelled: true };
    }

    emit({ stage: 'save', platform, progress: 70, message: '写入数据库...' });
    const imported = await insertPrompts(normalized);
    const skipped = normalized.length - imported;

    const syncTime = new Date();
    const lastRecord = rawRecords[rawRecords.length - 1];
    const lastHash = lastRecord
      ? `${lastRecord.sourceId}:${lastRecord.timestamp.getTime()}`
      : state?.lastHash ?? null;

    await this.updateSyncState({
      platform,
      lastRecordId: lastRecord?.sourceId ?? state?.lastRecordId ?? null,
      lastSyncTime: syncTime,
      lastHash,
      version: connector.manifest.version,
    });

    emit({
      stage: 'done',
      platform,
      progress: 100,
      message: `完成：新增 ${imported} 条`,
    });

    await dedupePrompts();

    return { platform, imported, skipped, syncTime };
  }

  async syncAll(connectors: PromptConnector[], options?: SyncOptions): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const connector of connectors) {
      if (options?.isCancelled?.()) break;
      try {
        const result = await this.syncConnector(connector, options);
        results.push(result);
        if (result.cancelled) break;
      } catch (err) {
        console.error(`[SyncEngine] Failed to sync ${connector.manifest.id}:`, err);
        results.push({
          platform: connector.manifest.id,
          imported: 0,
          skipped: 0,
          syncTime: new Date(),
        });
      }
    }
    const purged = await purgeNoisePrompts();
    await purgePromptResponses();
    const deduped = await dedupePrompts();
    if (purged > 0) {
      options?.onProgress?.({
        stage: 'done',
        platform: 'mirscope',
        progress: 100,
        message: `已清理 ${purged} 条系统通知`,
      });
    }
    if (deduped > 0) {
      options?.onProgress?.({
        stage: 'done',
        platform: 'mirscope',
        progress: 100,
        message: `已去重 ${deduped} 条重复 Prompt`,
      });
    }
    return results;
  }

  private async updateSyncState(state: ConnectorSyncState): Promise<void> {
    const db = getDatabase();
    await db
      .insert(connectorSync)
      .values({
        platform: state.platform,
        lastRecordId: state.lastRecordId,
        lastSyncTime: state.lastSyncTime,
        lastHash: state.lastHash,
        version: state.version,
      })
      .onConflictDoUpdate({
        target: connectorSync.platform,
        set: {
          lastRecordId: state.lastRecordId,
          lastSyncTime: state.lastSyncTime,
          lastHash: state.lastHash,
          version: state.version,
        },
      });
  }
}
