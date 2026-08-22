import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { CodexRateLimitService } from './codex-rate-limit-service.js';

const appServerScript = String.raw`
  const readline = require('node:readline');
  const input = readline.createInterface({ input: process.stdin });
  let availableCount = 2;
  const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
  input.on('line', (line) => {
    const message = JSON.parse(line);
    if (message.method === 'initialized') return;
    if (message.method === 'initialize') send({ id: message.id, result: { userAgent: 'test' } });
    if (message.method === 'account/login/start') send({ id: message.id, result: { type: 'chatgptAuthTokens' } });
    if (message.method === 'account/rateLimitResetCredit/consume') {
      availableCount -= 1;
      send({ id: message.id, result: { outcome: 'reset' } });
    }
    if (message.method === 'account/rateLimits/read') send({ id: message.id, result: {
      rateLimits: {},
      rateLimitResetCredits: {
        availableCount,
        credits: availableCount ? [{ id: 'RateLimitResetCredit_1', expiresAt: 1784246400, title: 'Rate-limit reset' }] : [],
      },
    } });
  });
`;

const credential = {
  fileId: 'file-1',
  fileName: 'account.json',
  accountId: 'account-1',
  email: 'user@example.com',
  planType: 'plus',
  accessToken: 'access-token',
};

describe('CodexRateLimitService', () => {
  it('reads and consumes official rate-limit reset credits through app-server', async () => {
    const getRuntimeCredential = vi.fn(async () => credential);
    const service = new CodexRateLimitService({ getRuntimeCredential }, {
      resolveBinary: async () => process.execPath,
      startProcess: (binary) => spawn(binary, ['-e', appServerScript], {
        stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      }),
    });

    await expect(service.read('file-1')).resolves.toEqual({
      availableCount: 2,
      credits: [{ id: 'RateLimitResetCredit_1', expiresAt: 1784246400, title: 'Rate-limit reset' }],
    });
    await expect(service.consume('file-1', '8ae96ff3-3425-4f4c-8772-b6fd61502868')).resolves.toEqual({
      outcome: 'reset',
      availableCount: 1,
      credits: [{ id: 'RateLimitResetCredit_1', expiresAt: 1784246400, title: 'Rate-limit reset' }],
    });
    expect(getRuntimeCredential).toHaveBeenCalledTimes(2);
  });
});
