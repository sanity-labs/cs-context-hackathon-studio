/** What people type to reach an agent: lowercase letters and digits, separated by dashes. */
export const AGENT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Words the chat uses itself, so no agent can take them. */
export const RESERVED_AGENT_NAMES = ['auto', 'unsure', 'all', 'help'] as const

export function toAgentName(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
