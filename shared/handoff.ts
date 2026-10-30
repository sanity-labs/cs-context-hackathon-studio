/**
 * The one line the customer's setup prints for Sanity: everything the chat
 * app needs from their side. It carries a read-only project token, so it
 * travels by a secure share. Encoded rather than encrypted: it is a paste
 * that can't be mangled, not a secret in itself.
 */
export type Handoff = {
  projectId: string
  dataset: string
  readToken: string
  organizationId: string
  studioUrl?: string
  /** The day of the hackathon, as YYYY-MM-DD. */
  hackathonDate?: string
  /** When the customer's tokens stop working, so ours can match. */
  expiresAt?: string
}

const PREFIX = 'context-hackathon:1:'

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string {
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

export function encodeHandoff(handoff: Handoff): string {
  return `${PREFIX}${toBase64Url(JSON.stringify(handoff))}`
}

/** Throws with a message a person can act on: a paste cut short is the usual cause. */
export function decodeHandoff(line: string): Handoff {
  const trimmed = line.trim()
  if (!trimmed.startsWith(PREFIX)) throw new Error(`That isn't a handoff line: it should start with ${PREFIX}`)
  // A line copied out of a terminal box or an email can arrive wrapped, with borders and spaces in it. None of those are base64url, so they go.
  const encoded = trimmed.slice(PREFIX.length).replace(/[^A-Za-z0-9_-]/g, '')
  let parsed: Partial<Handoff>
  try {
    parsed = JSON.parse(fromBase64Url(encoded)) as Partial<Handoff>
  } catch {
    throw new Error('The handoff line is damaged. Ask for it again, or copy it in one piece.')
  }
  const {projectId, dataset, readToken, organizationId} = parsed
  if (!projectId || !dataset || !readToken || !organizationId) throw new Error('The handoff line is missing a value. Ask for a new one.')
  return {projectId, dataset, readToken, organizationId, studioUrl: parsed.studioUrl, hackathonDate: parsed.hackathonDate, expiresAt: parsed.expiresAt}
}
