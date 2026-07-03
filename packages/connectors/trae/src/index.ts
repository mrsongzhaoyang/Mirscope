import { createTraeConnector as createTraeConnectorImpl } from '@mirscope/connectors-common';
import { traeManifest } from './manifest.js';

export function createTraeConnector() {
  return createTraeConnectorImpl({
    manifest: traeManifest,
    appDirCandidates: ['Trae CN', 'Trae', 'TraeCN'],
    envVar: 'MIRSCOPE_TRAE_USER_DIR',
  });
}

export { traeManifest } from './manifest.js';
