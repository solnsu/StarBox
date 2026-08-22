import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AuthService, RuntimeCredential } from './auth-service.js';
import { ServiceError } from './auth-service.js';
import { resolveCodexCli } from '../infra/codex-cli.js';

const REQUEST_TIMEOUT_MS = 20_000;

type JsonObject = Record<string, unknown>;
type RpcId = number | string;
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export type RateLimitResetCredit = {
  id: string;
  expiresAt: number | null;
  title: string | null;
};

export type RateLimitResetStatus = {
  availableCount: number;
  credits: RateLimitResetCredit[];
};

export type RateLimitResetOutcome = 'reset' | 'alreadyRedeemed' | 'nothingToReset' | 'noCredit';

export type RateLimitResetResult = RateLimitResetStatus & {
  outcome: RateLimitResetOutcome;
};

export type CodexRateLimitDependencies = {
  resolveBinary?: () => Promise<string>;
  startProcess?: (binary: string, isolatedHome: string) => ChildProcessWithoutNullStreams;
};

class AppServerClient {
  private readonly pending = new Map<RpcId, PendingRequest>();
  private buffer = '';
  private closing = false;

  constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly refreshCredential: () => Promise<RuntimeCredential>,
  ) {
    process.stdout.setEncoding('utf8');
    process.stdout.on('data', (chunk: string) => this.handleChunk(chunk));
    process.stderr.resume();
    process.stdin.on('error', () => this.failPending('CODEX_APP_SERVER_CLOSED'));
    process.once('error', () => this.failPending('CODEX_APP_SERVER_START_FAILED'));
    process.once('close', () => {
      if (!this.closing) this.failPending('CODEX_APP_SERVER_CLOSED');
    });
  }

  async initialize(): Promise<void> {
    await this.request(1, 'initialize', {
      clientInfo: { name: 'starbox', title: 'StarBox', version: '0.1.0' },
      capabilities: { experimentalApi: true },
    });
    this.send({ method: 'initialized', params: {} });
  }

  login(credential: RuntimeCredential): Promise<unknown> {
    return this.request(2, 'account/login/start', {
      type: 'chatgptAuthTokens',
      accessToken: credential.accessToken,
      chatgptAccountId: credential.accountId,
      ...(credential.planType ? { chatgptPlanType: credential.planType } : {}),
    });
  }

  request(id: RpcId, method: string, params?: JsonObject): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new ServiceError('CODEX_APP_SERVER_TIMEOUT', 504));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.send({ id, method, ...(params ? { params } : {}) });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new ServiceError('CODEX_APP_SERVER_CLOSED', 502));
      }
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    this.failPending('CODEX_APP_SERVER_CLOSED');
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 1_000);
      this.process.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      this.process.kill('SIGTERM');
    });
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.handleLine(line);
      newline = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    let message: JsonObject;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      message = parsed as JsonObject;
    } catch {
      this.failPending('CODEX_APP_SERVER_PROTOCOL_ERROR');
      return;
    }
    if (typeof message.method === 'string' && message.id !== undefined) {
      void this.handleServerRequest(message.id as RpcId, message.method);
      return;
    }
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id as RpcId);
    if (!pending) return;
    this.pending.delete(message.id as RpcId);
    clearTimeout(pending.timeout);
    if (message.error) pending.reject(new ServiceError('CODEX_APP_SERVER_REQUEST_FAILED', 502));
    else pending.resolve(message.result);
  }

  private async handleServerRequest(id: RpcId, method: string): Promise<void> {
    if (method !== 'account/chatgptAuthTokens/refresh') {
      this.send({ id, error: { code: -32601, message: 'Method not found' } });
      return;
    }
    try {
      const credential = await this.refreshCredential();
      this.send({
        id,
        result: {
          accessToken: credential.accessToken,
          chatgptAccountId: credential.accountId,
          ...(credential.planType ? { chatgptPlanType: credential.planType } : {}),
        },
      });
    } catch {
      this.send({ id, error: { code: -32000, message: 'Token refresh failed' } });
    }
  }

  private send(message: JsonObject): void {
    if (this.process.stdin.destroyed) throw new ServiceError('CODEX_APP_SERVER_CLOSED', 502);
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private failPending(code: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new ServiceError(code, 502));
    }
    this.pending.clear();
  }
}

const asObject = (value: unknown): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceError('CODEX_APP_SERVER_PROTOCOL_ERROR', 502);
  }
  return value as JsonObject;
};

const parseResetStatus = (value: unknown): RateLimitResetStatus => {
  const root = asObject(value);
  const resetCredits = root.rateLimitResetCredits;
  if (resetCredits === null || resetCredits === undefined) return { availableCount: 0, credits: [] };
  const creditsRoot = asObject(resetCredits);
  const availableCount = Number(creditsRoot.availableCount);
  if (!Number.isInteger(availableCount) || availableCount < 0) {
    throw new ServiceError('CODEX_APP_SERVER_PROTOCOL_ERROR', 502);
  }
  const credits = Array.isArray(creditsRoot.credits) ? creditsRoot.credits.flatMap((item): RateLimitResetCredit[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const credit = item as JsonObject;
    if (typeof credit.id !== 'string' || !credit.id) return [];
    return [{
      id: credit.id,
      expiresAt: typeof credit.expiresAt === 'number' ? credit.expiresAt : null,
      title: typeof credit.title === 'string' ? credit.title : null,
    }];
  }) : [];
  return { availableCount, credits };
};

const parseOutcome = (value: unknown): RateLimitResetOutcome => {
  const outcome = asObject(value).outcome;
  if (outcome === 'reset' || outcome === 'alreadyRedeemed' || outcome === 'nothingToReset' || outcome === 'noCredit') {
    return outcome;
  }
  throw new ServiceError('CODEX_APP_SERVER_PROTOCOL_ERROR', 502);
};

export class CodexRateLimitService {
  constructor(
    private readonly authService: Pick<AuthService, 'getRuntimeCredential'>,
    private readonly dependencies: CodexRateLimitDependencies = {},
  ) {}

  read(fileId: string): Promise<RateLimitResetStatus> {
    return this.withClient(fileId, async (client) => parseResetStatus(
      await client.request(3, 'account/rateLimits/read'),
    ));
  }

  consume(fileId: string, idempotencyKey: string): Promise<RateLimitResetResult> {
    return this.withClient(fileId, async (client) => {
      const outcome = parseOutcome(await client.request(3, 'account/rateLimitResetCredit/consume', { idempotencyKey }));
      const status = parseResetStatus(await client.request(4, 'account/rateLimits/read'));
      return { outcome, ...status };
    });
  }

  private async withClient<T>(fileId: string, action: (client: AppServerClient) => Promise<T>): Promise<T> {
    let isolatedHome: string | null = null;
    let client: AppServerClient | null = null;
    try {
      let credential = await this.authService.getRuntimeCredential(fileId);
      const binary = await (this.dependencies.resolveBinary ?? resolveCodexCli)();
      isolatedHome = await mkdtemp(path.join(os.tmpdir(), 'starbox-app-server-'));
      const child = this.dependencies.startProcess
        ? this.dependencies.startProcess(binary, isolatedHome)
        : spawn(binary, ['app-server', '--listen', 'stdio://'], {
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, CODEX_HOME: isolatedHome },
          });
      client = new AppServerClient(child, async () => {
        credential = await this.authService.getRuntimeCredential(fileId, true);
        return credential;
      });
      await client.initialize();
      await client.login(credential);
      return await action(client);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      const code = error instanceof Error ? error.message : '';
      if (code === 'CODEX_CLI_NOT_FOUND') throw new ServiceError(code, 503);
      throw new ServiceError('CODEX_APP_SERVER_START_FAILED', 502);
    } finally {
      await client?.close().catch(() => undefined);
      if (isolatedHome) await rm(isolatedHome, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
