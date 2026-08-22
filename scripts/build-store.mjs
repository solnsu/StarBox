import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const required = ['MSIX_IDENTITY_NAME', 'MSIX_PUBLISHER', 'MSIX_PUBLISHER_DISPLAY_NAME'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing Microsoft Store package identity variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (!/^CN=/.test(process.env.MSIX_PUBLISHER)) {
  console.error('MSIX_PUBLISHER must be the exact Partner Center publisher value, usually starting with CN=.');
  process.exit(1);
}

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${npmCommand} ${args.join(' ')} failed (${signal ?? code})`));
  });
});

await run(['run', 'build']);

const packageJson = JSON.parse(await (await import('node:fs/promises')).readFile('package.json', 'utf8'));
const config = {
  ...packageJson.build,
  win: {
    ...packageJson.build.win,
    target: [{ target: 'appx', arch: ['x64'] }],
  },
  appx: {
    applicationId: 'CodexAuthConsole',
    identityName: process.env.MSIX_IDENTITY_NAME,
    publisher: process.env.MSIX_PUBLISHER,
    publisherDisplayName: process.env.MSIX_PUBLISHER_DISPLAY_NAME,
    displayName: 'StarBox',
    backgroundColor: '#f6f7f9',
    showNameOnTiles: true,
    artifactName: '${productName}-${version}-store-${arch}.${ext}',
  },
};

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-auth-store-'));
const configPath = path.join(tempDir, 'electron-builder.json');
await (await import('node:fs/promises')).writeFile(configPath, JSON.stringify(config, null, 2));

let buildError;
try {
  await run(['exec', '--', 'electron-builder', '--config', configPath]);
} catch (error) {
  buildError = error;
} finally {
  try {
    await run(['rebuild', 'better-sqlite3']);
  } catch (restoreError) {
    buildError ??= restoreError;
  }
  await rm(tempDir, { recursive: true, force: true });
}

if (buildError) throw buildError;
