import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dialog } from 'electron';
import type { NormalizedPrompt } from '@mirscope/shared';
import { getDataPath } from './paths.js';

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function promptsToCsv(prompts: NormalizedPrompt[]): string {
  const header = ['id', 'platform', 'model', 'project', 'score', 'language', 'timestamp', 'prompt'];
  const rows = prompts.map((p) =>
    [
      p.id,
      p.platform,
      p.model ?? '',
      p.project ?? '',
      p.score?.toString() ?? '',
      p.language ?? '',
      p.timestamp.toISOString(),
      p.prompt ?? '',
    ]
      .map(escapeCsv)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export async function exportPromptsToFile(
  prompts: NormalizedPrompt[],
  format: 'json' | 'csv'
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出 Prompt 数据',
    defaultPath: `mirscope-export-${Date.now()}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (canceled || !filePath) return { ok: false };

  try {
    const body =
      format === 'json'
        ? JSON.stringify(
            prompts.map(({ response: _r, responseTokens: _rt, responseStatus: _rs, ...rest }) => rest),
            null,
            2
          )
        : promptsToCsv(prompts);
    // Excel on Windows 需要 UTF-8 BOM 才能正确显示中文
    const content = format === 'csv' ? `\uFEFF${body}` : body;
    writeFileSync(filePath, content, 'utf-8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function backupDatabase(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const src = getDataPath();
  if (!existsSync(src)) return { ok: false, error: '数据库文件不存在' };

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '备份数据库',
    defaultPath: `mirscope-backup-${Date.now()}.db`,
    filters: [{ name: 'SQLite', extensions: ['db'] }],
  });
  if (canceled || !filePath) return { ok: false };

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    copyFileSync(src, filePath);
    const wal = `${src}-wal`;
    const shm = `${src}-shm`;
    if (existsSync(wal)) copyFileSync(wal, `${filePath}-wal`);
    if (existsSync(shm)) copyFileSync(shm, `${filePath}-shm`);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function getBackupDir(): string {
  return join(dirname(getDataPath()), 'backups');
}
