import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const deployDir = join(root, 'deploy', 'desktop');
const desktopDir = join(root, 'apps', 'desktop');
const builderConfig = join(desktopDir, 'electron-builder.yml');

rmSync(deployDir, { recursive: true, force: true });
mkdirSync(join(root, 'deploy'), { recursive: true });

execSync('pnpm --filter @mirscope/desktop deploy deploy/desktop --prod', {
  cwd: root,
  stdio: 'inherit',
});

cpSync(join(desktopDir, 'out'), join(deployDir, 'out'), { recursive: true });

if (!existsSync(join(deployDir, 'out', 'main', 'index.js'))) {
  throw new Error('Missing deploy/desktop/out/main/index.js — run electron-vite build first');
}

const electronBuilderBin =
  process.platform === 'win32'
    ? join(root, 'apps', 'desktop', 'node_modules', '.bin', 'electron-builder.cmd')
    : join(root, 'apps', 'desktop', 'node_modules', '.bin', 'electron-builder');

execSync(`"${electronBuilderBin}" --win nsis --x64 --config "${builderConfig}"`, {
  cwd: deployDir,
  stdio: 'inherit',
});

console.log('\n✓ Windows installer: deploy/desktop/release/Mirscope-Setup-*.exe');
