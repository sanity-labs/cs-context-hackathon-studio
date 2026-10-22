import {z} from 'zod'

/**
 * Sizes, as `@s` has them: an agent picks Small, Medium or Large, and each
 * follows its family to the newest model. `~vendor/family-latest` is
 * OpenRouter's own alias shape; `findModel` resolves it against the listing.
 */
export const MODEL_SIZES = {
  sm: '~anthropic/claude-haiku-latest',
  md: '~anthropic/claude-sonnet-latest',
  lg: '~anthropic/claude-opus-latest',
} as const

/** What an agent with no model runs on. Stored as nothing, so it follows this when it changes. */
export const MODEL = MODEL_SIZES.md

/** What classifies conversations for Insights: quick and cheap, since it reads every one. Jev picks agents. */
export const INSIGHTS_MODEL = MODEL_SIZES.sm

/** Prices are dollars per million tokens, which is how everyone quotes them and not how OpenRouter sends them. */
export type Model = {
  id: string
  name: string
  input: number
  output: number
  context: number
}

const MODELS_URL = 'https://openrouter.ai/api/v1/models'

// Every call asks for zero retention, so only these endpoints can run one. A
// model's own `supported_parameters` is the union over all its providers, so
// the filter reads the zero-retention endpoints themselves.
const ZDR_ENDPOINTS_URL = 'https://openrouter.ai/api/v1/endpoints/zdr'

/**
 * What an agent cannot run without: tools for its look-ups, and structured
 * outputs for the router. A capability filter rather than a list of names, so
 * it keeps up as generations come and go.
 */
const REQUIRED = ['tools', 'structured_outputs']

/**
 * A `:variant` is a way of running a model rather than a model. `openrouter/`
 * is a router pseudo-model. A `~` alias is how a size follows its family, and
 * `findModel` resolves it against this list, so the list holds only models.
 */
function offerable(id: string): boolean {
  return !id.includes(':') && !id.startsWith('openrouter/') && !id.startsWith('~')
}

const listedModel = z.object({
  id: z.string(),
  name: z.string().optional(),
  created: z.number().optional(),
  context_length: z.number().optional(),
  pricing: z.object({prompt: z.string(), completion: z.string()}).partial().optional(),
})

const endpoint = z.object({
  model_id: z.string(),
  supported_parameters: z.array(z.string()).optional(),
})

/** Per token as a decimal string, which at these magnitudes reads as zero. */
function perMillion(price: string | undefined): number {
  return Math.round(Number(price ?? 0) * 1_000_000 * 100) / 100
}

async function listed<T extends z.ZodType>(url: string, item: T): Promise<z.output<T>[]> {
  const response = await fetch(url, {signal: AbortSignal.timeout(10_000)})
  if (!response.ok) throw new Error(`OpenRouter would not list its models: ${response.status}`)
  return z.object({data: z.array(item)}).parse(await response.json()).data
}

/** Every model a turn can run on, newest first. Public: OpenRouter needs no key to list. */
export async function listModels(): Promise<Model[]> {
  const [models, endpoints] = await Promise.all([listed(MODELS_URL, listedModel), listed(ZDR_ENDPOINTS_URL, endpoint)])
  const runnable = new Set(
    endpoints.filter((found) => REQUIRED.every((it) => found.supported_parameters?.includes(it))).map((found) => found.model_id),
  )
  return models
    .filter((found) => offerable(found.id) && runnable.has(found.id))
    .toSorted((one, other) => (other.created ?? 0) - (one.created ?? 0))
    .map((found) => ({
      id: found.id,
      name: found.name ?? found.id,
      input: perMillion(found.pricing?.prompt),
      output: perMillion(found.pricing?.completion),
      context: found.context_length ?? 0,
    }))
}

/**
 * A size is `~vendor/family-latest`, and the listing is newest first, so the
 * first of the family is the newest that can run a turn.
 */
export function findModel(id: string, models: Model[]): Model | undefined {
  if (!id.startsWith('~')) return models.find((model) => model.id === id)
  const family = `${id.slice(1).replace(/-latest$/, '')}-`
  return models.find((model) => model.id.startsWith(family))
}
