import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const executableName = () => process.platform === 'win32' ? 'codex.exe' : 'codex';

const executableCandidates = (): string[] => {
  const binary = executableName();
  const fromPath = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, binary));
  const configured = process.env.CODEX_CLI_PATH?.trim();
  const homeCandidates = process.platform === 'win32'
    ? []
    : [
        path.join(os.homedir(), '.local', 'bin', binary),
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
      ];
  return [...new Set([...(configured ? [configured] : []), ...fromPath, ...homeCandidates])];
};

export const resolveCodexCli = async (): Promise<string> => {
  const mode = process.platform === 'win32' ? constants.F_OK : constants.X_OK;
  for (const candidate of executableCandidates()) {
    try {
      await access(candidate, mode);
      return candidate;
    } catch {
      // Continue until an executable Codex CLI is found.
    }
  }
  throw new Error('CODEX_CLI_NOT_FOUND');
};
