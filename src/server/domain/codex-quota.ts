import { z } from 'zod';

const windowSchema = z
  .object({
    used_percent: z.number().finite().nullable().optional(),
    limit_window_seconds: z.number().finite().nullable().optional(),
    reset_at: z.number().finite().nullable().optional(),
    reset_after_seconds: z.number().finite().nullable().optional(),
  })
  .passthrough();

const rateLimitSchema = z
  .object({
    allowed: z.boolean().optional(),
    limit_reached: z.boolean().optional(),
    primary_window: windowSchema.nullable().optional(),
    secondary_window: windowSchema.nullable().optional(),
  })
  .passthrough();

const usageSchema = z
  .object({
    plan_type: z.string().nullable().optional(),
    rate_limit: rateLimitSchema.nullable().optional(),
  })
  .passthrough();

export type QuotaWindow = {
  key: 'primary' | 'secondary';
  durationSeconds: number | null;
  usedPercent: number | null;
  resetAt: number | null;
};

export type CodexQuotaSnapshot = {
  planType: string | null;
  allowed: boolean;
  limitReached: boolean;
  usedPercent: number | null;
  windows: QuotaWindow[];
};

export const parseCodexQuota = (input: unknown, observedAt = Date.now()): CodexQuotaSnapshot => {
  const parsed = usageSchema.safeParse(input);
  if (!parsed.success || !parsed.data.rate_limit) throw new Error('INVALID_USAGE_RESPONSE');
  const rateLimit = parsed.data.rate_limit;
  const buildWindow = (
    key: QuotaWindow['key'],
    value: z.infer<typeof windowSchema> | null | undefined,
  ): QuotaWindow | null => {
    if (!value) return null;
    const resetAt = value.reset_at
      ? value.reset_at * 1000
      : value.reset_after_seconds
        ? observedAt + value.reset_after_seconds * 1000
        : null;
    return {
      key,
      durationSeconds: value.limit_window_seconds ?? null,
      usedPercent: value.used_percent ?? null,
      resetAt,
    };
  };
  const windows = [
    buildWindow('primary', rateLimit.primary_window),
    buildWindow('secondary', rateLimit.secondary_window),
  ].filter((value): value is QuotaWindow => value !== null);
  const percentages = windows
    .map((window) => window.usedPercent)
    .filter((value): value is number => value !== null);
  const usedPercent = percentages.length ? Math.max(...percentages) : null;
  return {
    planType: parsed.data.plan_type ?? null,
    allowed: rateLimit.allowed !== false,
    limitReached: rateLimit.limit_reached === true || percentages.some((value) => value >= 100),
    usedPercent,
    windows,
  };
};
