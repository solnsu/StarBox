import { describe, expect, it } from 'vitest';
import { parseCodexAuthJson, validateJsonFileName } from './codex-auth.js';

const jwt = (claims: Record<string, unknown>) =>
  `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

describe('parseCodexAuthJson', () => {
  it('parses a flat Codex credential', () => {
    const result = parseCodexAuthJson({
      type: 'codex',
      access_token: 'access-value',
      refresh_token: 'refresh-value',
      account_id: 'account-1',
      email: 'dev@example.com',
    });
    expect(result).toMatchObject({
      accessToken: 'access-value',
      refreshToken: 'refresh-value',
      accountId: 'account-1',
      email: 'dev@example.com',
    });
  });

  it('parses official Codex CLI nested tokens and JWT metadata', () => {
    const idToken = jwt({
      email: 'nested@example.com',
      exp: 1_900_000_000,
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'account-nested',
        chatgpt_plan_type: 'plus',
      },
    });
    const input = { auth_mode: 'chatgpt', openai_api_key: null, tokens: { access_token: 'access', id_token: idToken } };
    const result = parseCodexAuthJson(input);
    expect(result.email).toBe('nested@example.com');
    expect(result.accountId).toBe('account-nested');
    expect(result.planType).toBe('plus');
    expect(result.expiresAt).toBeNull();
    expect(result.accessTokenExpiresAt).toBe(1_900_000_000_000);
    expect(result.raw).toEqual(input);
  });

  it('preserves the optional order number from official CLI auth JSON', () => {
    const result = parseCodexAuthJson({
      auth_mode: 'chatgpt', order_code: '#9G9WMX2Q',
      tokens: { access_token: 'access', id_token: jwt({ email: 'order@example.com' }) },
    });
    expect(result.order_code).toBe('#9G9WMX2Q');
    expect(result.raw.order_code).toBe('#9G9WMX2Q');
  });

  it('normalizes ChatGPT Session JSON without rejecting a stale local expires field', () => {
    const result = parseCodexAuthJson({
      user: { email: 'session@example.com' },
      accessToken: 'session-access-token',
      sessionToken: 'session-cookie-token',
      expires: '2020-01-01T00:00:00.000Z',
    });
    expect(result).toMatchObject({
      accessToken: 'session-access-token',
      sessionToken: 'session-cookie-token',
      email: 'session@example.com',
      expiresAt: null,
      accessTokenExpiresAt: 1577836800000,
    });
    expect(result.raw.type).toBe('codex');
  });

  it('uses the access token JWT expiry instead of stale stored or ID token expiry values', () => {
    const accessExpiry = 1_900_000_000;
    const result = parseCodexAuthJson({
      access_token: jwt({ exp: accessExpiry }),
      id_token: jwt({ exp: 1_600_000_000 }),
      expired: '2020-01-01T00:00:00.000Z',
    });

    expect(result.accessTokenExpiresAt).toBe(accessExpiry * 1000);
  });

  it('reads the current top-level ChatGPT account claim from a JWT', () => {
    const result = parseCodexAuthJson({
      access_token: jwt({
        email: 'claim@example.com',
        'https://api.openai.com/auth.chatgpt_account_id': 'account-claim',
        chatgpt_plan_type: 'plus',
        chatgpt_subscription_active_until: '2026-08-25T17:50:18+00:00',
      }),
    });
    expect(result.accountId).toBe('account-claim');
    expect(result.planType).toBe('plus');
    expect(result.expiresAt).toBe(Date.parse('2026-08-25T17:50:18+00:00'));
  });

  it('preserves a Session subscription expiry when normalizing the stored JSON', () => {
    const result = parseCodexAuthJson({
      user: { email: 'session@example.com' },
      accessToken: 'session-access-token',
      chatgpt_subscription_active_until: '2026-08-25T17:50:18+00:00',
    });
    expect(result.expiresAt).toBe(Date.parse('2026-08-25T17:50:18+00:00'));
    expect(result.raw.chatgpt_subscription_active_until).toBe('2026-08-25T17:50:18.000Z');
    expect(parseCodexAuthJson(result.raw).expiresAt).toBe(result.expiresAt);
  });

  it('rejects non-Codex providers and missing access tokens', () => {
    expect(() => parseCodexAuthJson({ type: 'claude', access_token: 'x' })).toThrow('CODEX_ONLY');
    expect(() => parseCodexAuthJson({ type: 'codex' })).toThrow('ACCESS_TOKEN_REQUIRED');
  });

  it('requires a safe JSON file name', () => {
    expect(validateJsonFileName('codex-account.json')).toBe('codex-account.json');
    expect(() => validateJsonFileName('../credential.json')).toThrow('INVALID_FILE_NAME');
    expect(() => validateJsonFileName('credential.txt')).toThrow('INVALID_FILE_NAME');
  });
});
