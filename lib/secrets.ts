import {CONTEXT_TOKEN_KEY, SECRETS_NAMESPACE} from '@hackathon/agents'
import {useSecrets} from '@sanity/studio-secrets'

export {CONTEXT_TOKEN_KEY, SECRETS_NAMESPACE}

export type SecretValues = Record<string, string | undefined>

export type Kind = 'secret' | 'config'

/** Upper snake case, as `@s` has it, like ACME_API_KEY. */
export const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/

/**
 * Which added keys are config, readable after saving, as a comma-separated
 * list. A tool's own keys say which they are; this is for keys added before
 * a tool that reads them is merged. It doesn't match KEY_PATTERN, so no tool
 * can ask for it.
 */
const CONFIG_KEYS = '_config'

/**
 * The private `secrets.hackathon` document, through `@sanity/studio-secrets`.
 * Anyone with read access to the project can read it, so it is for read-only,
 * short-lived keys only.
 */
export function useHackathonSecrets() {
  const {loading, secrets, storeSecrets} = useSecrets<SecretValues>(SECRETS_NAMESPACE)
  const all = secrets ?? {}
  const config = new Set((all[CONFIG_KEYS] ?? '').split(',').filter(Boolean))
  const values: SecretValues = Object.fromEntries(Object.entries(all).filter(([key]) => KEY_PATTERN.test(key)))
  return {
    loading,
    values,
    /** Keys that were added as config, so their values show. */
    config,
    /**
     * Sets or clears one key, keeping the others: the plugin replaces the whole
     * object on save. `kind` is remembered only for keys no tool declares.
     */
    setValue: (key: string, value: string | undefined, kind?: Kind) => {
      const next: SecretValues = {...all}
      const kinds = new Set(config)
      if (value?.trim()) {
        next[key] = value.trim()
        if (kind === 'config') kinds.add(key)
        else if (kind === 'secret') kinds.delete(key)
      } else {
        delete next[key]
        kinds.delete(key)
      }
      if (kinds.size) next[CONFIG_KEYS] = [...kinds].join(',')
      else delete next[CONFIG_KEYS]
      storeSecrets(next)
    },
  }
}
