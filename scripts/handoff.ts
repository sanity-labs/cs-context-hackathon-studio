/**
 * npm run handoff: prints the handoff line again, for when it wasn't copied at
 * the end of setup. It's rebuilt from the .env and .env.chat setup wrote, so
 * nothing is created or changed. It checks the read token still works first.
 *
 * Piped, it prints only the line: npm run --silent handoff | pbcopy
 */
import {existsSync, readFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import * as p from '@clack/prompts'
import {createClient} from '@sanity/client'

import {encodeHandoff} from '@hackathon/agents'

const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PM = process.env.npm_config_user_agent?.startsWith('pnpm') ? 'pnpm' : 'npm'
const SETUP = PM === 'pnpm' ? 'pnpm hackathon' : 'npm run hackathon'
const piped = !process.stdout.isTTY

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const entries = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => [match[1] ?? '', (match[2] ?? '').replace(/^"(.*)"$/, '$1')] as const)
  return Object.fromEntries(entries)
}

function fail(message: string): never {
  if (piped) console.error(message)
  else p.cancel(message)
  process.exit(1)
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'})

async function main() {
  const env = {...readEnv(join(STUDIO, '.env')), ...readEnv(join(STUDIO, '.env.chat'))}
  const projectId = env.SANITY_PROJECT_ID ?? env.SANITY_STUDIO_PROJECT_ID
  const readToken = env.SANITY_READ_TOKEN
  const organizationId = env.SANITY_STUDIO_ORGANIZATION_ID
  if (!projectId || !readToken || !organizationId) fail(`There's no handoff line yet: setup hasn't finished in this folder. Run ${SETUP}.`)

  const expiresAt = env.SANITY_READ_TOKEN_EXPIRES
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) fail(`The read token in this line expired on ${formatDay(expiresAt)}. Run ${SETUP} again with a new date.`)

  if (!piped) p.intro('Context Hackathon: your handoff line')
  const client = createClient({projectId, dataset: env.SANITY_DATASET ?? 'production', apiVersion: '2026-09-01', token: readToken, useCdn: false, perspective: 'published'})
  try {
    await client.fetch('count(*[_type == "agent"])')
  } catch (error) {
    const status = (error as {statusCode?: number}).statusCode
    if (status === 401 || status === 403) fail(`The read token in .env.chat no longer works: it was deleted in Manage, or replaced. Run ${SETUP} again for a new one.`)
    // Offline, or the API is down: the line may still be fine, so print it anyway.
    const warning = `Couldn't check the read token (${error instanceof Error ? error.message : error}), so here's the line unchecked.`
    if (piped) console.error(warning)
    else p.log.warn(warning)
  }

  const studioUrl = env.SANITY_STUDIO_HOSTNAME ? `https://${env.SANITY_STUDIO_HOSTNAME}.sanity.studio` : undefined
  const line = encodeHandoff({
    projectId,
    dataset: env.SANITY_DATASET ?? 'production',
    readToken,
    organizationId,
    studioUrl,
    hackathonDate: env.HACKATHON_DATE,
    expiresAt,
  })

  if (piped) {
    process.stdout.write(`${line}\n`)
    return
  }
  p.log.message(
    [
      'Send this line to your Sanity contact. It holds the read-only project token the chat app reads the agents',
      'and Keys with, so use a secure share (like a 1Password link), not email or Slack.',
      expiresAt ? `It stops working on ${formatDay(expiresAt)}.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  // On its own, outside the box, so it copies cleanly.
  console.log(`\n${line}\n`)
  p.outro(`On a Mac, ${PM === 'pnpm' ? 'pnpm --silent handoff' : 'npm run --silent handoff'} | pbcopy copies it instead.`)
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
