import type { ConnectorManifest } from '@mirscope/shared';

export const claudeCodeManifest: ConnectorManifest = {
  id: 'claude-code',
  name: 'Claude Code',
  version: '1.0.0',
  description: '从 Claude Code CLI / VS Code 插件的 JSONL 会话文件采集 Prompt',
  supportedPlatforms: ['win32', 'darwin', 'linux'],
};
