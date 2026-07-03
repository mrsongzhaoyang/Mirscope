import type { ConnectorManifest } from '@mirscope/shared';

export const codebuddyManifest: ConnectorManifest = {
  id: 'codebuddy',
  name: 'CodeBuddy CN',
  version: '1.0.0',
  description: '从 CodeBuddy CN IDE 本地 SQLite 数据库采集 AI 对话数据',
  supportedPlatforms: ['win32', 'darwin', 'linux'],
};
