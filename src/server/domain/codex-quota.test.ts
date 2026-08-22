import { describe, expect, it } from 'vitest';
import { parseCodexQuota } from './codex-quota.js';

describe('parseCodexQuota', () => {
  it('normalizes Codex primary and secondary windows', () => {
    const result = parseCodexQuota({
      plan_type: 'team',
      rate_limit: {
        allowed: true,
        primary_window: { used_percent: 38, limit_window_seconds: 18_000, reset_after_seconds: 120 },
        secondary_window: { used_percent: 92, limit_window_seconds: 604_800, reset_at: 1_800_000_000 },
      },
    }, 1_700_000_000_000);
    expect(result.planType).toBe('team');
    expect(result.usedPercent).toBe(92);
    expect(result.limitReached).toBe(false);
    expect(result.windows).toEqual([
      { key: 'primary', durationSeconds: 18_000, usedPercent: 38, resetAt: 1_700_000_120_000 },
      { key: 'secondary', durationSeconds: 604_800, usedPercent: 92, resetAt: 1_800_000_000_000 },
    ]);
  });

  it('marks a fully used window as exhausted', () => {
    const result = parseCodexQuota({ rate_limit: { primary_window: { used_percent: 100 } } });
    expect(result.limitReached).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it('rejects payloads without a Codex rate limit', () => {
    expect(() => parseCodexQuota({ plan_type: 'plus' })).toThrow('INVALID_USAGE_RESPONSE');
  });
});
