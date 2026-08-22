import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpApp } from './http.js';
import { createDatabase, type AppDatabase } from './infra/database.js';
import { LocalVault } from './infra/vault.js';
import { AuthRepository } from './repositories/auth-repository.js';
import { CreationRepository } from './repositories/creation-repository.js';
import { GatewayRepository } from './repositories/gateway-repository.js';
import { AuthService } from './services/auth-service.js';
import { GatewayService } from './services/gateway-service.js';
import { ModelPricingService } from './services/model-pricing-service.js';
import { CreationService } from './services/creation-service.js';
import type { DesktopIntegration } from './desktop-integration.js';

type HttpResult = { status: number; body: string; headers: Record<string, string | string[] | undefined> };

const jwt = (claims: Record<string, unknown>) =>
  `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==';

const send = (
  server: Server,
  method: string,
  route: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<HttpResult> => new Promise((resolve, reject) => {
  const address = server.address();
  if (!address || typeof address === 'string') return reject(new Error('TEST_SERVER_NOT_LISTENING'));
  const payload = body === undefined ? '' : JSON.stringify(body);
  const call = request({
    host: '127.0.0.1', port: address.port, path: route, method,
    headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers } : headers,
  }, (response) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => resolve({
      status: response.statusCode ?? 0,
      body: Buffer.concat(chunks).toString('utf8'),
      headers: response.headers,
    }));
  });
  call.on('error', reject);
  if (payload) call.write(payload);
  call.end();
});

describe('local model API HTTP routes', () => {
  let dataDir: string;
  let database: AppDatabase;
  let server: Server;
  let desktopIntegration: DesktopIntegration;
  let rateLimitRead: ReturnType<typeof vi.fn>;
  let rateLimitConsume: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'codex-http-test-'));
    database = createDatabase(dataDir);
    const vault = new LocalVault(dataDir);
    const auth = new AuthService(new AuthRepository(database), vault, {
      tenantId: 'test', usageUrl: 'https://example.test/usage', timeoutMs: 1_000, concurrency: 1,
    });
    const pricing = new ModelPricingService({
      cachePath: path.resolve('pricing/model-pricing.json'),
      remoteUrl: 'https://example.test/model-pricing.json',
      fetcher: async () => new Response('', { status: 503 }),
    });
    const gateway = new GatewayService(new GatewayRepository(database, pricing), vault, auth, pricing, 'test');
    const creation = new CreationService(new CreationRepository(database), path.join(dataDir, 'generated-images'), 'test');
    desktopIntegration = {};
    rateLimitRead = vi.fn(async () => ({ availableCount: 1, credits: [] }));
    rateLimitConsume = vi.fn(async () => ({ outcome: 'reset', availableCount: 0, credits: [] }));
    auth.import('account.json', {
      type: 'codex', account_id: 'account-1', email: 'user@example.com', access_token: 'access-value',
      chatgpt_plan_type: 'plus',
    });
    server = createHttpApp(auth, gateway, path.join(dataDir, 'missing-web'), creation, undefined, desktopIntegration, {
      read: rateLimitRead,
      consume: rateLimitConsume,
    }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('authenticates, returns a non-stream response, and exposes the generated log', async () => {
    const settings = await send(server, 'PUT', '/api/gateway-settings', {
      baseUrl: 'http://127.0.0.1:4312/v1', enabled: true,
    });
    expect(settings.status).toBe(200);
    const apiKey = (JSON.parse(settings.body) as { apiKey: string }).apiKey;
    expect(apiKey).toMatch(/^sk-/);

    const rejected = await send(server, 'POST', '/v1/responses', {
      model: 'gpt-5.6-sol', input: 'hello', stream: false,
    }, { Authorization: 'Bearer wrong-secret' });
    expect(rejected.status).toBe(401);

    vi.stubGlobal('fetch', vi.fn(async () => {
      const completed = {
        type: 'response.completed',
        response: { id: 'resp-1', object: 'response', usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 } },
      };
      return new Response(`event: response.completed\ndata: ${JSON.stringify(completed)}\n\n`, {
        status: 200, headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-1' },
      });
    }));

    const proxied = await send(server, 'POST', '/v1/responses', {
      model: 'gpt-5.6-sol', input: 'hello', stream: false,
    }, { Authorization: `Bearer ${apiKey}` });
    expect(proxied.status).toBe(200);
    expect(JSON.parse(proxied.body)).toMatchObject({ id: 'resp-1', object: 'response' });
    expect(proxied.headers['x-request-id']).toBe('req-1');

    const dashboard = await send(server, 'GET', '/api/request-logs');
    const data = JSON.parse(dashboard.body) as {
      logs: Array<{ requestId: string; totalTokens: number; ttftMs: number | null; failed: boolean }>;
      summary: { totalRequests: number; totalTokens: number };
    };
    expect(data.logs).toEqual([expect.objectContaining({ requestId: 'req-1', totalTokens: 18, failed: false })]);
    expect(data.logs[0]?.ttftMs).not.toBeNull();
    expect(data.summary).toMatchObject({ totalRequests: 1, totalTokens: 18 });

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('/backend-api/codex/models?client_version=');
      return new Response(JSON.stringify({ models: [
        { slug: 'gpt-5.4', display_name: 'GPT-5.4' },
      ] }), { status: 200 });
    }));
    const models = await send(server, 'GET', '/v1/models', undefined, { Authorization: `Bearer ${apiKey}` });
    const modelPayload = JSON.parse(models.body) as { object: string; data: Array<{ id: string }> };
    expect(modelPayload.object).toBe('list');
    expect(modelPayload.data).toHaveLength(9);
    expect(modelPayload.data.map((model) => model.id)).toEqual(expect.arrayContaining([
      'gpt-5.4', 'gpt-5.3-codex-spark', 'gpt-image-1.5', 'gpt-image-2',
    ]));
    expect(modelPayload.data.map((model) => model.id)).not.toContain('codex-auto-review');

    const authFile = await send(server, 'GET', '/api/client-files/auth.json');
    expect(JSON.parse(authFile.body)).toEqual({ OPENAI_API_KEY: apiKey });
    const configFile = await send(server, 'GET', '/api/client-files/config.toml?model=gpt-5-codex');
    expect(configFile.body).toContain('model = "gpt-5-codex"');

    const codexConfig = await send(server, 'POST', '/api/client-config', { model: 'gpt-5-codex' });
    expect(JSON.parse(codexConfig.body)).toMatchObject({
      kind: 'codex', secondaryFileName: 'config.toml', apiKey,
      endpoint: 'http://127.0.0.1:4312/v1',
    });
    const imageConfig = await send(server, 'POST', '/api/client-config', { model: 'gpt-image-2' });
    expect(JSON.parse(imageConfig.body)).toMatchObject({
      kind: 'image', secondaryFileName: 'request.json', apiKey,
      endpoint: 'http://127.0.0.1:4312/v1',
    });

    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/images/generations');
      expect((init?.headers as Record<string, string>)['Chatgpt-Account-Id']).toBe('account-1');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: 'gpt-image-2', prompt: 'A black robot', stream: false,
      });
      return new Response(JSON.stringify({
        created: 1, data: [{ b64_json: 'AA==' }],
        usage: { input_tokens: 2, output_tokens: 8, total_tokens: 10 },
      }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'image-http-1' } });
    }));
    const image = await send(server, 'POST', '/v1/images/generations', {
      model: 'gpt-image-2', prompt: 'A black robot', size: '1024x1024',
    }, { Authorization: `Bearer ${apiKey}` });
    expect(image.status).toBe(200);
    expect(JSON.parse(image.body)).toMatchObject({ data: [{ b64_json: 'AA==' }] });
    expect(image.headers['x-request-id']).toBe('image-http-1');

    const logsAfterImage = JSON.parse((await send(server, 'GET', '/api/request-logs')).body) as {
      logs: Array<{ requestId: string; path: string; totalTokens: number }>;
    };
    expect(logsAfterImage.logs[0]).toMatchObject({
      requestId: 'image-http-1', path: '/v1/images/generations', totalTokens: 10,
    });
  });

  it('returns an English error and does not proxy a model without pricing', async () => {
    const settings = await send(server, 'PUT', '/api/gateway-settings', {
      baseUrl: 'http://127.0.0.1:4312/v1', enabled: true,
    });
    const apiKey = (JSON.parse(settings.body) as { apiKey: string }).apiKey;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await send(server, 'POST', '/v1/responses', {
      model: 'gpt-unpriced', input: 'hello', stream: false,
    }, { Authorization: `Bearer ${apiKey}` });

    expect(response.status).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      error: {
        code: 'MODEL_PRICE_NOT_CONFIGURED',
        message: 'Pricing for this model is not available yet. Please try again after the pricing catalog is updated.',
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('imports an official ChatGPT login without returning tokens', async () => {
    const idToken = jwt({
      email: 'oauth@example.com',
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'account-oauth',
        chatgpt_plan_type: 'plus',
      },
    });
    const credential = {
      auth_mode: 'chatgpt',
      openai_api_key: null,
      tokens: {
        id_token: idToken,
        access_token: 'login-access-secret',
        refresh_token: 'login-refresh-secret',
        account_id: 'account-oauth',
      },
      last_refresh: '2026-08-20T00:00:00.000Z',
    };
    desktopIntegration.loginWithChatGpt = async () => ({
      fileName: 'chatgpt-oauth.json',
      content: JSON.stringify(credential),
    });

    const login = await send(server, 'POST', '/api/auth-files/login-chatgpt');
    expect(login.status).toBe(201);
    expect(login.body).not.toContain('login-access-secret');
    expect(login.body).not.toContain('login-refresh-secret');
    const result = JSON.parse(login.body) as { file: { id: string; email: string; accountId: string } };
    expect(result.file).toMatchObject({ email: 'oauth@example.com', accountId: 'account-oauth' });

    const stored = await send(server, 'GET', `/api/auth-files/${result.file.id}/download`);
    expect(JSON.parse(stored.body)).toEqual(credential);
  });

  it('persists generated images and restores creation conversations', async () => {
    const files = JSON.parse((await send(server, 'GET', '/api/auth-files')).body) as { files: Array<{ id: string }> };
    const authFileId = files.files[0]!.id;
    const sessionId = randomUUID();
    const userMessageId = randomUUID();
    const createdAt = Date.now();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      created: 1,
      data: [{ b64_json: onePixelPng }, { b64_json: onePixelPng }],
      usage: { input_tokens: 2, output_tokens: 8, total_tokens: 10 },
    }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'creation-1' } })));

    const generated = await send(server, 'POST', '/api/creation/generate', {
      authFileId,
      sessionId,
      session: { id: sessionId, title: 'Robot', createdAt },
      userMessage: {
        id: userMessageId,
        role: 'user',
        text: 'A tiny robot',
        attachments: [{ name: 'reference.png', dataUrl: `data:image/png;base64,${onePixelPng}` }],
        createdAt,
      },
      model: 'gpt-image-2',
      prompt: 'A tiny robot',
    });
    expect(generated.status).toBe(200);
    const result = JSON.parse(generated.body) as {
      data: Array<{ id: string; url: string }>;
      message: { role: string; attachments: Array<{ url: string }> };
    };
    expect(result.data).toHaveLength(2);
    expect(result.message).toMatchObject({ role: 'assistant', attachments: [{ url: result.data[0]!.url }, { url: result.data[1]!.url }] });

    const image = await send(server, 'GET', result.data[0]!.url);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');

    const workspace = JSON.parse((await send(server, 'GET', '/api/creation/workspace')).body) as {
      sessions: Array<{ id: string; messages: Array<{ role: string; attachments?: Array<{ url: string }> }> }>;
      images: Array<{ id: string }>;
    };
    expect(workspace.images).toHaveLength(2);
    expect(workspace.sessions[0]).toMatchObject({
      id: sessionId,
      messages: [{ role: 'user' }, { role: 'assistant' }],
    });
    const inputUrl = workspace.sessions[0]!.messages[0]!.attachments?.[0]?.url;
    expect(inputUrl).toMatch(/^\/api\/creation-input-images\//);
    const inputImage = await send(server, 'GET', inputUrl!);
    expect(inputImage.status).toBe(200);
    expect(inputImage.headers['content-type']).toContain('image/png');

    rmSync(path.join(dataDir, 'generated-images', `${result.data[0]!.id}.png`));
    const afterFileDelete = JSON.parse((await send(server, 'GET', '/api/creation/workspace')).body) as {
      sessions: Array<{ id: string; messages: Array<{ role: string; attachments?: Array<{ url: string }> }> }>;
      images: Array<{ id: string }>;
    };
    expect(afterFileDelete.images).toEqual([expect.objectContaining({ id: result.data[1]!.id })]);
    expect(afterFileDelete.sessions[0]!.messages[1]!.attachments).toEqual([
      { name: `${result.data[0]!.id}.png`, url: result.data[0]!.url },
      { name: `${result.data[1]!.id}.png`, url: result.data[1]!.url },
    ]);
    expect((await send(server, 'GET', result.data[0]!.url)).status).toBe(404);
    expect(database.prepare('SELECT 1 FROM creation_images WHERE tenant_id = ? AND id = ?').get('test', result.data[0]!.id)).toBeUndefined();

    const deleted = await send(server, 'DELETE', `/api/creation/sessions/${sessionId}`);
    expect(deleted.status).toBe(204);
    const afterDelete = JSON.parse((await send(server, 'GET', '/api/creation/workspace')).body) as {
      sessions: unknown[]; images: Array<{ id: string; sessionId: string }>;
    };
    expect(afterDelete.sessions).toHaveLength(0);
    expect(afterDelete.images).toEqual([expect.objectContaining({ id: result.data[1]!.id, sessionId })]);
    expect((await send(server, 'GET', result.data[1]!.url)).status).toBe(200);
    expect((await send(server, 'GET', inputUrl!)).status).toBe(404);

    const logs = JSON.parse((await send(server, 'GET', '/api/request-logs')).body) as {
      logs: Array<{ requestId: string; responseContent: string }>;
    };
    expect(logs.logs[0]).toMatchObject({ requestId: 'creation-1' });
    expect(logs.logs[0]!.responseContent).toContain('[base64 omitted:');
    expect(logs.logs[0]!.responseContent).not.toContain(onePixelPng);
  });

  it('reads and consumes Codex rate-limit reset credits for a selected auth file', async () => {
    const fileId = (JSON.parse((await send(server, 'GET', '/api/auth-files')).body) as { files: Array<{ id: string }> }).files[0]!.id;
    const status = await send(server, 'GET', `/api/auth-files/${fileId}/rate-limit-reset`);
    expect(status.status).toBe(200);
    expect(JSON.parse(status.body)).toEqual({ availableCount: 1, credits: [] });
    expect(rateLimitRead).toHaveBeenCalledWith(fileId);

    const idempotencyKey = randomUUID();
    const consumed = await send(server, 'POST', `/api/auth-files/${fileId}/rate-limit-reset`, { idempotencyKey });
    expect(consumed.status).toBe(200);
    expect(JSON.parse(consumed.body)).toEqual({ outcome: 'reset', availableCount: 0, credits: [] });
    expect(rateLimitConsume).toHaveBeenCalledWith(fileId, idempotencyKey);
  });

  it('rejects ChatGPT login outside desktop and maps integration failures', async () => {
    const unavailable = await send(server, 'POST', '/api/auth-files/login-chatgpt');
    expect(unavailable.status).toBe(501);
    expect(JSON.parse(unavailable.body)).toEqual({ error: { code: 'DESKTOP_INTEGRATION_UNAVAILABLE' } });
    const cancelUnavailable = await send(server, 'POST', '/api/auth-files/login-chatgpt/cancel');
    expect(cancelUnavailable.status).toBe(501);

    desktopIntegration.loginWithChatGpt = async () => { throw new Error('CODEX_CLI_NOT_FOUND'); };
    const cancel = vi.fn();
    desktopIntegration.cancelChatGptLogin = cancel;
    const cancelled = await send(server, 'POST', '/api/auth-files/login-chatgpt/cancel');
    expect(cancelled.status).toBe(200);
    expect(JSON.parse(cancelled.body)).toEqual({ cancelled: true });
    expect(cancel).toHaveBeenCalledOnce();
    const missingCli = await send(server, 'POST', '/api/auth-files/login-chatgpt');
    expect(missingCli.status).toBe(503);
    expect(JSON.parse(missingCli.body)).toEqual({ error: { code: 'CODEX_CLI_NOT_FOUND' } });
  });
});
