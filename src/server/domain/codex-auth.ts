import { z } from 'zod';

const MAX_AUTH_JSON_BYTES = 1024 * 1024;

const objectSchema = z.record(z.string(), z.unknown());

export type CodexCredential = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  sessionToken: string | null;
  accountId: string | null;
  email: string | null;
  planType: string | null;
  order_code: string | null;
  expiresAt: number | null;
  accessTokenExpiresAt: number | null;
  subscriptionExpiresAt: number | null;
  raw: Record<string, unknown>;
};

type JwtClaims = Record<string, unknown> & {
  email?: unknown;
  exp?: unknown;
  'https://api.openai.com/auth'?: unknown;
  'https://api.openai.com/auth.chatgpt_account_id'?: unknown;
  chatgpt_account_id?: unknown;
  chatgpt_plan_type?: unknown;
  chatgpt_subscription_active_until?: unknown;
};

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const timestampValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const text = stringValue(value);
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export const decodeJwtClaims = (token: string | null): JwtClaims | null => {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return objectSchema.safeParse(decoded).success ? (decoded as JwtClaims) : null;
  } catch {
    return null;
  }
};

const getAuthClaims = (claims: JwtClaims | null) => {
  const auth = claims?.['https://api.openai.com/auth'];
  return objectSchema.safeParse(auth).success ? (auth as Record<string, unknown>) : {};
};

const recordValue = (value: unknown): Record<string, unknown> => {
  const result = objectSchema.safeParse(value);
  return result.success ? result.data : {};
};

const compactRecord = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== ''));

export const parseCodexAuthJson = (input: string | unknown): CodexCredential => {
  const rawText = typeof input === 'string' ? input : JSON.stringify(input);
  if (Buffer.byteLength(rawText, 'utf8') > MAX_AUTH_JSON_BYTES) {
    throw new Error('AUTH_FILE_TOO_LARGE');
  }

  let parsed: unknown;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new Error('INVALID_JSON');
  }

  const result = objectSchema.safeParse(parsed);
  if (!result.success) throw new Error('AUTH_JSON_OBJECT_REQUIRED');
  const raw = result.data;
  const provider = stringValue(raw.type ?? raw.provider);
  if (provider && provider.toLowerCase() !== 'codex') throw new Error('CODEX_ONLY');

  const tokenContainers = [
    raw,
    recordValue(raw.tokens),
    recordValue(raw.token),
    recordValue(raw.credentials),
    recordValue(raw.session),
    recordValue(recordValue(raw.session).tokens),
    recordValue(recordValue(raw.session).token),
  ];
  const tokenValue = (...keys: string[]) => {
    for (const container of tokenContainers) {
      for (const key of keys) {
        const value = stringValue(container[key]);
        if (value) return value;
      }
    }
    return null;
  };
  const accessToken = tokenValue('access_token', 'accessToken');
  const refreshToken = tokenValue('refresh_token', 'refreshToken');
  const idToken = tokenValue('id_token', 'idToken');
  const sessionToken = tokenValue('session_token', 'sessionToken');
  if (!accessToken) throw new Error('ACCESS_TOKEN_REQUIRED');

  const idClaims = decodeJwtClaims(idToken);
  const accessClaims = decodeJwtClaims(accessToken);
  const claims = idClaims ?? accessClaims;
  const authClaims = getAuthClaims(claims);
  const user = recordValue(raw.user);
  const account = recordValue(raw.account);
  const profileAccount = recordValue(recordValue(raw.profile).account);
  const accountId = stringValue(
    raw.account_id ??
      raw.chatgpt_account_id ??
      account.id ??
      account.account_id ??
      account.chatgpt_account_id ??
      profileAccount.id ??
      profileAccount.account_id ??
      profileAccount.chatgpt_account_id ??
      tokenContainers.map((container) => container.account_id ?? container.chatgpt_account_id).find(Boolean) ??
      authClaims.chatgpt_account_id ??
      authClaims.account_id ??
      claims?.['https://api.openai.com/auth.chatgpt_account_id'] ??
      claims?.chatgpt_account_id,
  );
  const email = stringValue(raw.email ?? user.email ?? account.email ?? claims?.email ?? authClaims.email);
  const planType = stringValue(
    raw.plan_type ??
      raw.chatgpt_plan_type ??
      account.planType ??
      account.plan_type ??
      account.chatgpt_plan_type ??
      profileAccount.planType ??
      profileAccount.plan_type ??
      authClaims.chatgpt_plan_type ??
      authClaims.plan_type ??
      claims?.chatgpt_plan_type,
  );
  const order_code = stringValue(raw.order_code);
  const accessTokenExpiresAt =
    timestampValue(accessClaims?.exp) ??
    timestampValue(raw.expires ?? raw.expired ?? raw.expires_at) ??
    timestampValue(idClaims?.exp) ??
    null;
  const subscriptionExpiresAt = timestampValue(
    raw.chatgpt_subscription_active_until ??
      account.chatgpt_subscription_active_until ??
      profileAccount.chatgpt_subscription_active_until ??
      authClaims.chatgpt_subscription_active_until ??
      claims?.chatgpt_subscription_active_until,
  );
  const expiresAt = subscriptionExpiresAt;

  const isOfficialCliInput = raw.auth_mode === 'chatgpt' && Object.keys(recordValue(raw.tokens)).length > 0;
  const isSessionInput = Boolean(raw.accessToken || raw.session || user.email);
  const normalizedRaw = isOfficialCliInput
    ? raw
    : isSessionInput
    ? compactRecord({
        type: 'codex',
        account_id: accountId,
        chatgpt_account_id: accountId,
        email,
        name: email ?? stringValue(raw.name) ?? 'ChatGPT Account',
        plan_type: planType,
        chatgpt_plan_type: planType,
        order_code,
        chatgpt_subscription_active_until: subscriptionExpiresAt
          ? new Date(subscriptionExpiresAt).toISOString()
          : null,
        id_token: idToken,
        access_token: accessToken,
        refresh_token: refreshToken,
        session_token: sessionToken,
        last_refresh: new Date().toISOString(),
        expired: accessTokenExpiresAt ? new Date(accessTokenExpiresAt).toISOString() : null,
        disabled: raw.disabled === true ? true : null,
      })
      : raw;

  return {
    accessToken,
    refreshToken,
    idToken,
    sessionToken,
    accountId,
    email,
    planType,
    order_code,
    expiresAt,
    accessTokenExpiresAt,
    subscriptionExpiresAt,
    raw: normalizedRaw,
  };
};

export const validateJsonFileName = (fileName: string): string => {
  const normalized = fileName.trim();
  if (!normalized || normalized.length > 180 || !normalized.toLowerCase().endsWith('.json')) {
    throw new Error('INVALID_FILE_NAME');
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._@+ -]*\.json$/u.test(normalized)) {
    throw new Error('INVALID_FILE_NAME');
  }
  return normalized;
};
