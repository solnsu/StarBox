import { z } from 'zod';

const modelIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const modelPriceSchema = z.object({
  input: z.number().finite().nonnegative(),
  cachedInput: z.number().finite().nonnegative(),
  output: z.number().finite().nonnegative(),
}).strict();

const pricingCatalogSchema = z.object({
  version: z.string().trim().min(1).max(64),
  publishedAt: z.iso.datetime({ offset: true }),
  currency: z.literal('USD'),
  unit: z.literal('per_million_tokens'),
  source: z.url().refine((value) => value.startsWith('https://'), 'HTTPS source required'),
  models: z.record(modelIdSchema, modelPriceSchema),
  aliases: z.record(modelIdSchema, modelIdSchema).default({}),
}).strict().superRefine((catalog, context) => {
  for (const [alias, target] of Object.entries(catalog.aliases)) {
    if (!catalog.models[target]) {
      context.addIssue({ code: 'custom', path: ['aliases', alias], message: `Unknown pricing target: ${target}` });
    }
  }
});

export type ModelPricingCatalog = z.infer<typeof pricingCatalogSchema>;

export type ModelUsage = {
  model: string | null;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
};

export const parseModelPricingCatalog = (value: unknown): ModelPricingCatalog => pricingCatalogSchema.parse(value);

export const resolveModelPrice = (catalog: ModelPricingCatalog, model: string | null) => {
  if (!model) return null;
  return catalog.models[catalog.aliases[model] ?? model] ?? null;
};

export const estimateModelCostUsd = (catalog: ModelPricingCatalog, usage: ModelUsage): number => {
  const price = resolveModelPrice(catalog, usage.model);
  if (!price) return 0;
  const cachedTokens = Math.min(Math.max(usage.cachedTokens, 0), Math.max(usage.inputTokens, 0));
  const uncachedTokens = Math.max(usage.inputTokens - cachedTokens, 0);
  return (
    uncachedTokens * price.input
    + cachedTokens * price.cachedInput
    + Math.max(usage.outputTokens, 0) * price.output
  ) / 1_000_000;
};
