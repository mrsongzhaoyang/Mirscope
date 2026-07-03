import { app } from 'electron';
import { join } from 'node:path';

export function getDataPath(): string {
  return join(app.getPath('userData'), 'data', 'prompts.db');
}

export function getDataDir(): string {
  return join(app.getPath('userData'), 'data');
}
