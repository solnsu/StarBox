import { describe, expect, it } from 'vitest';
import { estimateModelCostUsd, parseModelPricingCatalog } from './model-pricing.js';

const catalog = parseModelPricingCatalog({
  version: 'test', publishedAt: '2026-08-21T00:00:00.000Z', currency: 'USD',
  unit: 'per_million_tokens', source: 'https://developers.openai.com/api/docs/pricing',
  models: {
    'gpt-5.6-sol': { input: 5, cachedInput: 0.5, output: 30 },
    'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  },
  aliases: { 'gpt-5.3-codex-spark': 'gpt-5.3-codex' },
});

describe('model pricing', () => {
  it('prices uncached, cached, and output tokens without double-counting cache', () => {
    expect(estimateModelCostUsd(catalog, {
      model: 'gpt-5.6-sol', inputTokens: 1_000_000, cachedTokens: 250_000, outputTokens: 100_000,
    })).toBeCloseTo(6.875);
  });

  it('uses the Codex family price for catalog aliases', () => {
    expect(estimateModelCostUsd(catalog, {
      model: 'gpt-5.3-codex-spark', inputTokens: 1_000_000, cachedTokens: 0, outputTokens: 0,
    })).toBeCloseTo(1.75);
  });

  it('does not invent a price for an unknown model', () => {
    expect(estimateModelCostUsd(catalog, {
      model: 'unknown-model', inputTokens: 1_000_000, cachedTokens: 0, outputTokens: 1_000_000,
    })).toBe(0);
  });
});
