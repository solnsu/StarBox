import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const projectDir = process.cwd();
const require = createRequire(import.meta.url);

const runCommand = (command, args, cwd = projectDir) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`));
  });
});
const runNpm = (args) => runCommand(npmCommand, args);

const builderArgs = process.argv.slice(2);
const crossCompilingWindows = process.platform !== 'win32' && builderArgs.includes('--win');

await runNpm(['run', 'build']);

let buildError;
try {
  if (crossCompilingWindows) {
    const electronVersion = require('electron/package.json').version;
    const prebuildInstall = path.join(
      projectDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install',
    );
    await runCommand(prebuildInstall, [
      '--runtime', 'electron',
      '--target', electronVersion,
      '--arch', 'x64',
      '--platform', 'win32',
      '--force',
    ], path.join(projectDir, 'node_modules', 'better-sqlite3'));
  }
  const rebuildOption = crossCompilingWindows ? ['--config.npmRebuild=false'] : [];
  await runNpm(['exec', '--', 'electron-builder', ...builderArgs, ...rebuildOption]);
} catch (error) {
  buildError = error;
} finally {
  try {
    await runNpm(['rebuild', 'better-sqlite3']);
  } catch (restoreError) {
    buildError ??= restoreError;
  }
}

if (buildError) throw buildError;
