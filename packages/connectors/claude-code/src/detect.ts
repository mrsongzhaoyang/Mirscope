import type { ConnectorDetectResult } from '@mirscope/shared';
import {
  claudeProjectsDirExists,
  countClaudeJsonlFiles,
  getClaudeProjectsDir,
} from './parser.js';

export async function detectClaudeCode(): Promise<ConnectorDetectResult> {
  const customDir = process.env.MIRSCOPE_CLAUDE_PROJECTS_DIR?.trim();
  const projectsDir = customDir || getClaudeProjectsDir();

  if (!claudeProjectsDirExists(projectsDir)) {
    return {
      installed: false,
      dataPaths: [],
      message: '未检测到 Claude Code 项目数据（~/.claude/projects）',
    };
  }

  const fileCount = countClaudeJsonlFiles(projectsDir);
  if (fileCount === 0) {
    return {
      installed: false,
      dataPaths: [projectsDir],
      message: `找到目录但无会话文件: ${projectsDir}`,
    };
  }

  return {
    installed: true,
    dataPaths: [projectsDir],
    message: `检测到 Claude Code: ${projectsDir}（${fileCount} 个会话）`,
  };
}
