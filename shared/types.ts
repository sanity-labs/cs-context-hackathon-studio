/** A Portable Text block, as the Studio stores an agent's instructions. */
export type InstructionBlock = {
  _type: string
  _key?: string
  style?: string
  listItem?: 'bullet' | 'number'
  level?: number
  children?: {_type: string; text?: string; marks?: string[]}[]
  markDefs?: {_key: string; _type: string; href?: string}[]
}

/** A published agent, as the chat app reads it. */
export type Agent = {
  _id: string
  title: string
  name: string
  description: string
  instructions: InstructionBlock[]
  /** A size (`MODEL_SIZES`) or an OpenRouter model id, like `anthropic/claude-sonnet-4.5`. Empty means Medium. */
  model?: string
  /** Public ids of Knowledge Bases (they start with `kb`). */
  knowledgeBases?: string[]
  /** Names of the chat app's tools it may use, like `slack-read-channel`. */
  tools?: string[]
}

/** The one settings document. Setup writes it; the Studio and the chat app read it. */
export type Settings = {
  /** Where the chat app is deployed, so the Studio can link to it. */
  chatUrl?: string
  /** The Sanity organization that holds the Knowledge Bases. */
  organizationId?: string
}

/**
 * The private document the Studio's Keys view writes (`@sanity/studio-secrets`):
 * `secrets.hackathon`, holding the Context organization token and every tool's
 * keys. The chat app reads it on the server only.
 */
export const SECRETS_NAMESPACE = 'hackathon'
export const SECRETS_ID = `secrets.${SECRETS_NAMESPACE}`

/** The key the Context organization token is stored under in the secrets document. */
export const CONTEXT_TOKEN_KEY = 'SANITY_CONTEXT_TOKEN'

/**
 * What the Studio shows the chat app to list the tools and their keys
 * (/api/tools). It lives in the secrets document, so only someone who can read
 * the project has it: the Studio makes it the first time it asks. Lower case
 * with a leading underscore, so it isn't a key: the Keys view doesn't list it
 * and no tool can ask for it.
 */
export const STUDIO_ACCESS_KEY = '_studioAccess'
export const STUDIO_ACCESS_HEADER = 'x-hackathon-studio-access'

export const SETTINGS_ID = 'settings'
