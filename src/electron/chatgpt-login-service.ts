import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopCredential } from '../server/desktop-integration.js';
import { resolveCodexCli } from '../server/infra/codex-cli.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export class ChatGptLoginService {
  private activeProcess: ChildProcess | null = null;
  private loginPending = false;
  private cancelRequested = false;
  private disposed = false;

  constructor(private readonly dataDir: string) {}

  async login(): Promise<DesktopCredential> {
    if (this.disposed) throw new Error('CHATGPT_LOGIN_CANCELLED');
    if (this.loginPending) throw new Error('CHATGPT_LOGIN_IN_PROGRESS');
    this.loginPending = true;
    this.cancelRequested = false;

    try {
      const binary = await resolveCodexCli();
      const loginRoot = path.join(this.dataDir, 'chatgpt-login');
      await mkdir(loginRoot, { recursive: true, mode: 0o700 });
      await chmod(loginRoot, 0o700);
      const loginHome = await mkdtemp(path.join(loginRoot, 'session-'));
      await chmod(loginHome, 0o700);
      try {
        if (this.disposed || this.cancelRequested) throw new Error('CHATGPT_LOGIN_CANCELLED');
        await this.runLogin(binary, loginHome);
        if (this.disposed || this.cancelRequested) throw new Error('CHATGPT_LOGIN_CANCELLED');
        const authPath = path.join(loginHome, 'auth.json');
        let content: string;
        try {
          content = await readFile(authPath, 'utf8');
        } catch {
          throw new Error('CHATGPT_AUTH_FILE_MISSING');
        }
        if (this.disposed || this.cancelRequested) throw new Error('CHATGPT_LOGIN_CANCELLED');
        return {
          fileName: `chatgpt-${Date.now()}-${randomUUID().slice(0, 8)}.json`,
          content,
        };
      } finally {
        await rm(loginHome, { recursive: true, force: true });
      }
    } finally {
      this.loginPending = false;
      this.cancelRequested = false;
    }
  }

  cancel(): void {
    if (!this.loginPending) return;
    this.cancelRequested = true;
    this.activeProcess?.kill('SIGTERM');
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private runLogin(binary: string, loginHome: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['login', '-c', 'cli_auth_credentials_store="file"'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
        env: { ...process.env, CODEX_HOME: loginHome },
      });
      this.activeProcess = child;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, LOGIN_TIMEOUT_MS);

      child.once('error', () => {
        clearTimeout(timeout);
        this.activeProcess = null;
        reject(new Error('CHATGPT_LOGIN_FAILED'));
      });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        this.activeProcess = null;
        if (timedOut) reject(new Error('CHATGPT_LOGIN_TIMEOUT'));
        else if (this.disposed || this.cancelRequested || signal === 'SIGTERM') reject(new Error('CHATGPT_LOGIN_CANCELLED'));
        else if (code !== 0) reject(new Error('CHATGPT_LOGIN_FAILED'));
        else resolve();
      });
    });
  }
}
