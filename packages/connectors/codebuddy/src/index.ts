import { createVsCodeForkConnector } from '@mirscope/connectors-common';
import { codebuddyManifest } from './manifest.js';

export function createCodeBuddyConnector() {
  return createVsCodeForkConnector({
    manifest: codebuddyManifest,
    appDirCandidates: ['CodeBuddy CN', 'CodeBuddy', 'WorkBuddy CN', 'WorkBuddy'],
    envVar: 'MIRSCOPE_CODEBUDDY_USER_DIR',
  });
}

export { codebuddyManifest } from './manifest.js';
