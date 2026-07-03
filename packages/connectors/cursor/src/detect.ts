import type { ConnectorDetectResult } from '@mirscope/shared';
import { detectVsCodeFork, resolveVsCodeForkPaths } from '@mirscope/connectors-common';

export interface CursorPaths {
  userDir: string;
  globalDb: string;
  workspaceStorage: string;
}

export function getCursorPaths(): CursorPaths {
  const paths = resolveVsCodeForkPaths(['Cursor'], { envVar: 'MIRSCOPE_CURSOR_USER_DIR' });
  if (!paths) {
    throw new Error('Cursor paths not found');
  }
  return paths;
}

export async function detectCursor(): Promise<ConnectorDetectResult> {
  return detectVsCodeFork('Cursor', ['Cursor'], { envVar: 'MIRSCOPE_CURSOR_USER_DIR' });
}

export { readWorkspaceMapping } from '@mirscope/connectors-common';
