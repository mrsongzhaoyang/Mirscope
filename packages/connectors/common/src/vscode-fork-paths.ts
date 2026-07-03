import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ConnectorDetectResult } from '@mirscope/shared';

export interface VsCodeForkPaths {
  userDir: string;
  globalDb: string;
  workspaceStorage: string;
}

function platformUserDirs(appName: string): string[] {
  const platform = process.platform;
  if (platform === 'win32') {
    return [join(process.env.APPDATA ?? homedir(), appName, 'User')];
  }
  if (platform === 'darwin') {
    return [join(homedir(), 'Library', 'Application Support', appName, 'User')];
  }
  return [join(homedir(), '.config', appName, 'User')];
}

export function resolveVsCodeForkPaths(
  appDirCandidates: string[],
  options?: { envVar?: string; customUserDir?: string }
): VsCodeForkPaths | null {
  const dirs: string[] = [];

  if (options?.customUserDir?.trim()) {
    dirs.push(options.customUserDir.trim());
  }
  if (options?.envVar && process.env[options.envVar]?.trim()) {
    dirs.push(process.env[options.envVar]!.trim());
  }
  for (const name of appDirCandidates) {
    dirs.push(...platformUserDirs(name));
  }

  const seen = new Set<string>();
  for (const userDir of dirs) {
    if (seen.has(userDir)) continue;
    seen.add(userDir);

    const globalDb = join(userDir, 'globalStorage', 'state.vscdb');
    const workspaceStorage = join(userDir, 'workspaceStorage');
    if (existsSync(globalDb) || existsSync(workspaceStorage)) {
      return { userDir, globalDb, workspaceStorage };
    }
  }

  return null;
}

export async function detectVsCodeFork(
  displayName: string,
  appDirCandidates: string[],
  options?: { envVar?: string; customUserDir?: string }
): Promise<ConnectorDetectResult> {
  const paths = resolveVsCodeForkPaths(appDirCandidates, options);
  if (!paths) {
    return {
      installed: false,
      dataPaths: [],
      message: `未检测到 ${displayName} 安装或对话数据`,
    };
  }

  const dataPaths: string[] = [];
  if (existsSync(paths.globalDb)) dataPaths.push(paths.globalDb);
  if (existsSync(paths.workspaceStorage)) dataPaths.push(paths.workspaceStorage);

  return {
    installed: true,
    dataPaths,
    message: `检测到 ${displayName}: ${paths.userDir}`,
  };
}

export function readWorkspaceMapping(workspaceStorageDir: string): Map<string, string> {
  const mapping = new Map<string, string>();
  if (!existsSync(workspaceStorageDir)) return mapping;

  const dirs = readdirSync(workspaceStorageDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const hash of dirs) {
    const workspaceJson = join(workspaceStorageDir, hash, 'workspace.json');
    if (!existsSync(workspaceJson)) continue;
    try {
      const content = JSON.parse(readFileSync(workspaceJson, 'utf-8')) as {
        folder?: string;
        configuration?: { folder?: string };
      };
      const folder = content.folder ?? content.configuration?.folder;
      if (folder) {
        const decoded = decodeURIComponent(folder.replace(/^file:\/\//, ''));
        mapping.set(hash, platformPathFix(decoded));
      }
    } catch {
      // skip invalid workspace.json
    }
  }

  return mapping;
}

function platformPathFix(path: string): string {
  if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(path)) {
    return path.slice(1);
  }
  return path;
}
