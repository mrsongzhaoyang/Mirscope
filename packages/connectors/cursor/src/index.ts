import { createVsCodeForkConnector } from '@mirscope/connectors-common';
import { cursorManifest } from './manifest.js';

export function createCursorConnector() {
  return createVsCodeForkConnector({
    manifest: cursorManifest,
    appDirCandidates: ['Cursor'],
    envVar: 'MIRSCOPE_CURSOR_USER_DIR',
  });
}

export { cursorManifest } from './manifest.js';
