import type { ConnectorManifest } from '@mirscope/shared';

export const traeManifest: ConnectorManifest = {
  id: 'trae',
  name: 'Trae CN',
  version: '1.0.0',
  description: '从 Trae CN IDE 本地 SQLite 数据库采集 AI 对话数据',
  supportedPlatforms: ['win32', 'darwin', 'linux'],
};
