import type { ConnectorManifest } from '@mirscope/shared';

export const cursorManifest: ConnectorManifest = {
  id: 'cursor',
  name: 'Cursor',
  version: '1.0.0',
  description: '从 Cursor IDE 本地 SQLite 数据库采集 AI 对话数据',
  supportedPlatforms: ['win32', 'darwin', 'linux'],
};
