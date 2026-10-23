/**
 * The customer's half of the setup, run by their developer: everything the
 * hackathon needs in their own Sanity organization. It creates (or reuses) a
 * project for the agents, checks Sanity Context with an organization token,
 * seeds example agents and deploys this Studio. It ends with one line to send
 * to Sanity, who host the chat app and set it up from that line.
 *
 * Re-running is safe: it offers the values from the last run as defaults.
 */
import {spawn} from 'node:child_process'
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import * as p from '@clack/prompts'
import {createClient} from '@sanity/client'

import {CONTEXT_TOKEN_KEY, encodeHandoff, SECRETS_ID} from '@hackathon/agents'
import {exampleAgents, secretsDocument, type SeedInput, settingsDocument} from './seed'

/** This Studio's folder: apps/studio in Sanity's repo, and the root of the published template. */
const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STUDIO_ENV = join(STUDIO, '.env')
/** What the chat app needs, kept apart from the Studio's .env and out of git, so a re-run reuses the read token. */
const CHAT_ENV = join(STUDIO, '.env.chat')
/** npm and pnpm both put the CLI here; in our repo it's the Studio's own node_modules. */
const SANITY_BIN = [join(STUDIO, 'node_modules/.bin/sanity'), join(STUDIO, '../../node_modules/.bin/sanity')].find(existsSync) ?? join(STUDIO, 'node_modules/.bin/sanity')
/** How to run this again, in whichever package manager started it. */
const PM = process.env.npm_config_user_agent?.startsWith('pnpm') ? 'pnpm' : 'npm'
const RERUN = PM === 'pnpm' ? 'pnpm hackathon' : 'npm run hackathon'
const API_VERSION = '2026-09-01'
const DATASET = 'production'

// ---------------------------------------------------------------------------
// Small helpers

type Run = {code: number; stdout: string; stderr: string}

/** Runs the Sanity CLI from the Studio folder. Interactive commands share this terminal. */
function sanity(
  args: string[],
  {interactive = false, env = {}}: {interactive?: boolean; env?: Record<string, string>} = {},
): Promise<Run> {
  return new Promise((done) => {
    const child = spawn(SANITY_BIN, args, {
      cwd: STUDIO,
      env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env},
      stdio: interactive ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => (stdout += chunk))
    child.stderr?.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => done({code: code ?? 1, stdout, stderr}))
  })
}

/** CLI output can carry a line or two before the JSON. */
function json<T>(output: string): T {
  const start = output.search(/[[{]/)
  if (start < 0) throw new Error(`Expected JSON from the Sanity CLI, got: ${output.slice(0, 300)}`)
  return JSON.parse(output.slice(start)) as T
}

async function sanityJson<T>(args: string[]): Promise<T> {
  const run = await sanity(args)
  if (run.code !== 0) throw new Error((run.stderr || run.stdout).trim() || `sanity ${args.join(' ')} failed`)
  return json<T>(run.stdout)
}

/** The first line of a CLI error, which is the one that says what went wrong. */
function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? 'unknown error'
}

/**
 * Tokens stop working a week after the hackathon, whether or not anyone tidies
 * up: the organization token can change Knowledge Bases across the organization,
 * and attendees can read it.
 */
const EXPIRES_AFTER_DAYS = 7

function expiryAfter(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + EXPIRES_AFTER_DAYS)
  return date.toISOString()
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'})

type Robot = {id?: string; token?: string; key?: string}

/**
 * An organization token. `--grant context=editor` is Context Editor in Manage
 * (the `knowledge-base-editor-robot` role). The person running setup needs an
 * organization role that may create tokens, which an organization admin has.
 */
async function createOrganizationToken(organizationId: string, label: string, expiresAt: string): Promise<{id: string; token: string}> {
  const run = await sanity(['tokens', 'create', label, '--organization', organizationId, '--grant', 'context=editor', '--expires-at', expiresAt, '--yes', '--json'])
  if (run.code !== 0) throw new Error(firstLine(run.stderr || run.stdout))
  const robot = json<Robot>(run.stdout)
  const token = robot.token ?? robot.key
  if (!robot.id || !token) throw new Error('the CLI created no token')
  return {id: robot.id, token}
}

/** Best effort: a token setup replaced is no use to anyone, and it expires anyway. */
async function deleteToken(scope: {projectId: string} | {organizationId: string}, id: string | undefined) {
  if (!id) return
  const where = 'projectId' in scope ? ['-p', scope.projectId] : ['--organization', scope.organizationId]
  await sanity(['tokens', 'delete', id, ...where, '--yes'])
}

function check<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel(`Setup stopped. Run ${RERUN} again whenever you are ready.`)
    process.exit(0)
  }
  return value as Exclude<T, symbol>
}

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const entries = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => [match[1] ?? '', (match[2] ?? '').replace(/^"(.*)"$/, '$1')] as const)
  return Object.fromEntries(entries)
}

function writeEnv(file: string, header: string, values: Record<string, string | undefined>) {
  const lines = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${/[\s#"']/.test(value ?? '') ? JSON.stringify(value) : value}`)
  writeFileSync(file, `# ${header}\n${lines.join('\n')}\n`)
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// ---------------------------------------------------------------------------
// The run

async function main() {
  p.intro('Sanity, in context: hackathon setup')

  const major = Number(process.versions.node.split('.')[0])
  if (major < 22) {
    p.cancel(`Node ${process.versions.node} is too old. Install Node 22 or later, then run ${PM} install and ${RERUN} again.`)
    process.exit(1)
  }
  if (!existsSync(SANITY_BIN)) {
    p.cancel(`Dependencies are missing. Run ${PM} install first.`)
    process.exit(1)
  }

  const previous = {...readEnv(STUDIO_ENV), ...readEnv(CHAT_ENV)}

  const SECRETS_NOTE = [
    'Setup saves it in this project\'s private secrets document (the Studio\'s Keys view), where only the',
    'chat app\'s server uses it. Anyone with read access to the project can read that document, and this',
    'token can change Sanity Context across your organization. It stops working on the date above; delete it sooner if you like.',
  ].join('\n')

  p.note(
    [
      'You will need:',
      '- to run this as an organization admin in Sanity: setup creates an organization token for Sanity Context',
      '- Knowledge Bases enabled in your organization\'s Labs settings',
      '',
      'Sanity hosts the chat app and covers the models, so there are no model keys to arrange.',
      'At the end you get one line to send to your Sanity contact, who sets up the chat app from it.',
      '',
      'It takes about ten minutes.',
    ].join('\n'),
    'Before you start',
  )

  // 1. Signed in to Sanity
  let me = await sanity(['api', 'users/me', '--global'])
  if (me.code !== 0) {
    p.log.step('Sign in to Sanity with the account you use for your organization.')
    await sanity(['login'], {interactive: true})
    me = await sanity(['api', 'users/me', '--global'])
    if (me.code !== 0) {
      p.cancel(`Still not signed in. Run ${RERUN} again after sanity login works.`)
      process.exit(1)
    }
  }
  const user = json<{name?: string; email?: string}>(me.stdout)
  p.log.success(`Signed in as ${user.name ?? user.email ?? 'you'}`)

  // 2. Organization: the one that holds your content and Knowledge Bases
  const organizations = await sanityJson<{id: string; name: string}[]>(['api', 'organizations', '--global'])
  if (!organizations.length) {
    p.cancel('Your account is not in any organization. Ask an admin to add you, then run setup again.')
    process.exit(1)
  }
  const organizationId = check(
    await p.select({
      message: 'Which organization? Pick the one that holds your content, so agents can read it.',
      options: organizations.map((org) => ({value: org.id, label: org.name, hint: org.id})),
      // The Studio's .env keeps it. The chat's used to, before the id moved to Settings, so older runs may only have that.
      initialValue: previous.SANITY_STUDIO_ORGANIZATION_ID ?? previous.SANITY_ORGANIZATION_ID,
    }),
  )
  const organization = organizations.find((org) => org.id === organizationId)

  // 3. Project for the agents
  const projects = (await sanityJson<{id: string; displayName: string; organizationId?: string}[]>(['api', 'projects', '--global'])).filter(
    (project) => project.organizationId === organizationId,
  )
  const projectChoice = check(
    await p.select({
      message: 'Where should the agents live?',
      options: [
        {value: '__new', label: 'A new project, just for the hackathon', hint: 'recommended'},
        ...projects.map((project) => ({value: project.id, label: project.displayName, hint: project.id})),
      ],
      initialValue: previous.SANITY_PROJECT_ID && projects.some((project) => project.id === previous.SANITY_PROJECT_ID) ? previous.SANITY_PROJECT_ID : '__new',
    }),
  )
  let projectId = projectChoice
  if (projectChoice === '__new') {
    const name = check(await p.text({message: 'Project name', initialValue: 'Context Hackathon'}))
    const spin = p.spinner()
    spin.start('Creating the project')
    const created = await sanityJson<{projectId?: string; id?: string}>([
      'projects',
      'create',
      name,
      '--organization',
      organizationId,
      '--dataset',
      DATASET,
      '--dataset-visibility',
      'private',
      '--json',
      '--yes',
    ])
    projectId = created.projectId ?? created.id ?? ''
    if (!projectId) throw new Error('The CLI created a project but did not say its id. Pick it from the list on the next run.')
    spin.stop(`Created project ${projectId}`)
  } else {
    // Fails harmlessly when the dataset is already there.
    await sanity(['datasets', 'create', DATASET, '--visibility', 'private', '-p', projectId])
  }

  // 4. The date, which both tokens expire after
  const today = new Date().toISOString().slice(0, 10)
  const hackathonDate = check(
    await p.text({
      message: `When is the hackathon? (YYYY-MM-DD) Setup's tokens expire ${EXPIRES_AFTER_DAYS} days after it.`,
      initialValue: previous.HACKATHON_DATE && previous.HACKATHON_DATE >= today ? previous.HACKATHON_DATE : '',
      placeholder: today,
      validate: (value) => {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return 'A date like 2026-11-12'
        if (value < today) return 'That date has passed'
        return undefined
      },
    }),
  )
  const expiresAt = expiryAfter(hackathonDate)

  // 5. Token 1 of 2: a project token, so the chat app can read the agents
  const sameReadToken = previous.SANITY_PROJECT_ID === projectId && previous.SANITY_READ_TOKEN && previous.SANITY_READ_TOKEN_EXPIRES === expiresAt
  let readToken = sameReadToken ? previous.SANITY_READ_TOKEN : undefined
  let readTokenId = sameReadToken ? previous.SANITY_READ_TOKEN_ID : undefined
  if (!readToken) {
    const token = await sanityJson<Robot>([
      'tokens',
      'create',
      'Chat app: read agents',
      '-p',
      projectId,
      '--role',
      'viewer',
      '--expires-at',
      expiresAt,
      '--yes',
      '--json',
    ])
    readToken = token.token ?? token.key
    readTokenId = token.id
    if (!readToken) throw new Error('Could not create a read token for the chat app.')
    // A new date replaces the token from the last run, rather than leaving both.
    if (previous.SANITY_PROJECT_ID === projectId && previous.SANITY_READ_TOKEN_ID !== readTokenId) await deleteToken({projectId}, previous.SANITY_READ_TOKEN_ID)
    p.log.success(`Token 1 of 2 done: created a project token, "Chat app: read agents", so the chat app can read the agents. It expires on ${formatDay(expiresAt)}. Nothing to do.`)
  }

  // 6. Knowledge Bases
  type KnowledgeBase = {publicId: string; title: string; state?: string}
  let knowledgeBases: KnowledgeBase[] = []
  const listed = await sanity(['context', 'list', '--organization', organizationId, '--json'])
  if (listed.code === 0) {
    const parsed = json<KnowledgeBase[] | {data: KnowledgeBase[]}>(listed.stdout)
    knowledgeBases = Array.isArray(parsed) ? parsed : parsed.data
    p.log.success(`${knowledgeBases.length} Knowledge Base${knowledgeBases.length === 1 ? '' : 's'} in ${organization?.name}`)
  } else {
    p.log.warn(
      `Couldn't list Knowledge Bases (${(listed.stderr || listed.stdout).trim().split('\n')[0]}).\nAn organization admin can enable them on the Labs page: https://www.sanity.io/manage/org/labs`,
    )
  }
  let seedKnowledgeBases: KnowledgeBase[] = []
  if (knowledgeBases.length) {
    const picked = check(
      await p.multiselect({
        message: 'Which Knowledge Bases should the example agents use? Pick your dry-run one. (Teams build their own on the day.)',
        options: knowledgeBases.map((kb) => ({value: kb.publicId, label: kb.title, hint: kb.state})),
        required: false,
      }),
    )
    seedKnowledgeBases = knowledgeBases.filter((kb) => picked.includes(kb.publicId))
  } else {
    p.log.info(`Do the dry run: build one small Knowledge Base now, then run setup again so the example agents can use it: https://www.sanity.io/@${organizationId}/context/knowledge-bases/new`)
  }

  // 7. Token 2 of 2: an organization token, so the chat app can read Knowledge Bases and save conversations to Insights
  const storedSecrets = await sanityJson<{result?: Record<string, string> | null}>([
    'api',
    `data/query/${DATASET}`,
    '--project-hosted',
    '-p',
    projectId,
    '-f',
    `query=*[_id == "${SECRETS_ID}"][0].secrets`,
  ]).catch(() => ({result: null}))
  const savedToken = storedSecrets.result?.[CONTEXT_TOKEN_KEY]
  const sameContextToken = Boolean(savedToken) && previous.SANITY_PROJECT_ID === projectId && previous.CONTEXT_TOKEN_EXPIRES === expiresAt
  let contextToken = sameContextToken ? (savedToken ?? '') : ''
  let contextTokenId = sameContextToken ? previous.CONTEXT_TOKEN_ID : undefined
  if (sameContextToken) {
    p.log.success(`Token 2 of 2: keeping the organization token from the last run. It expires on ${formatDay(expiresAt)}.`)
  } else {
    try {
      const created = await createOrganizationToken(organizationId, 'Chat app: Context and Insights', expiresAt)
      contextToken = created.token
      contextTokenId = created.id
      if (previous.CONTEXT_TOKEN_ID !== created.id) await deleteToken({organizationId}, previous.CONTEXT_TOKEN_ID)
      p.log.success(
        `Token 2 of 2 done: created an organization token, "Chat app: Context and Insights" (Context Editor), so the chat app can read Knowledge Bases and save conversations to Insights. It expires on ${formatDay(expiresAt)}, and is saved in the Studio under Keys. Nothing to do.`,
      )
    } catch (error) {
      p.note(
        [
          `Setup couldn't create the organization token itself (${error instanceof Error ? error.message : error}).`,
          'That usually means your account can\'t create organization tokens. An organization admin can do it by hand:',
          '',
          '1. Open https://www.sanity.io/manage/org/api/tokens (organization-level tokens, not project tokens)',
          `2. Pick ${organization?.name ?? 'your organization'} and add a token named "Chat app: Context and Insights"`,
          `3. Give it the Context Editor role, set it to expire on ${formatDay(expiresAt)}, and copy it`,
          '',
          SECRETS_NOTE,
        ].join('\n'),
        'Token 2 of 2: organization token',
      )
      contextToken =
        check(
          await p.password({
            message: `Paste the organization token${savedToken ? ' (Enter keeps the current one)' : ''}`,
            validate: (value) => (value || savedToken ? undefined : 'Required'),
          }),
        ) || savedToken || ''
      contextTokenId = undefined
    }
  }

  // Both halves of what the chat app does with it: read Knowledge Bases, and save a conversation to Insights.
  const contextClient = createClient({
    apiVersion: 'v2025-11-27',
    token: contextToken,
    context: {organizationId},
    useProjectHostname: false,
    useCdn: false,
  })
  try {
    await contextClient.context.knowledgeBases.list({organizationId, limit: 1})
    p.log.success('The organization token can read Knowledge Bases')
  } catch (error) {
    p.log.warn(`The token couldn't list Knowledge Bases (${error instanceof Error ? error.message : error}). Check it's an organization token for ${organization?.name}. Carrying on.`)
  }
  try {
    // One clearly labelled conversation, saved again under the same thread on every run rather than piling up.
    await contextClient.context.conversations.save({
      threadId: 'context-hackathon-setup-check',
      messages: [
        {role: 'user', content: 'Setup check from the hackathon setup: can the chat app save conversations to Insights?'},
        {role: 'assistant', content: 'Yes. This conversation is the check, and can be ignored.'},
      ],
      metadata: {source: 'hackathon setup', check: 'insights-write'},
    })
    p.log.success('The organization token can save conversations to Insights (a "setup check" conversation now shows there)')
  } catch (error) {
    p.log.warn(
      `The token couldn't save a conversation to Insights (${error instanceof Error ? error.message : error}). It needs the Context Editor role: without it agents still answer, but Insights stays empty. Carrying on.`,
    )
  }

  // 8. Studio address
  let hostname = check(
    await p.text({
      message: 'Studio address: ____.sanity.studio',
      initialValue: previous.SANITY_STUDIO_HOSTNAME ?? `${slug(organization?.name ?? 'agent')}-context-hackathon`,
      validate: (value) => (value && /^[a-z0-9][a-z0-9-]{2,62}$/.test(value) ? undefined : 'Lowercase letters, numbers and dashes'),
    }),
  )

  // 9. Env files
  const studioEnv = {
    SANITY_STUDIO_PROJECT_ID: projectId,
    SANITY_STUDIO_DATASET: DATASET,
    SANITY_STUDIO_ORGANIZATION_ID: organizationId,
    SANITY_STUDIO_HOSTNAME: hostname,
  }
  writeEnv(STUDIO_ENV, 'Written by the hackathon setup', studioEnv)
  // Not in .env: the Studio's build reads that, and only SANITY_STUDIO_ values should ever reach it.
  writeEnv(CHAT_ENV, 'Written by the hackathon setup: what the chat app needs, and what a re-run reuses. Kept out of git; the handoff line carries it to Sanity.', {
    SANITY_PROJECT_ID: projectId,
    SANITY_DATASET: DATASET,
    SANITY_READ_TOKEN: readToken,
    SANITY_READ_TOKEN_ID: readTokenId,
    SANITY_READ_TOKEN_EXPIRES: expiresAt,
    CONTEXT_TOKEN_ID: contextTokenId,
    CONTEXT_TOKEN_EXPIRES: expiresAt,
    HACKATHON_DATE: hackathonDate,
  })
  p.log.success('Wrote .env and .env.chat')

  // 10. Settings and example agents
  const existing = await sanityJson<{result?: {chatUrl?: string} | null}>([
    'api',
    `data/query/${DATASET}`,
    '--project-hosted',
    '-p',
    projectId,
    '-f',
    'query=*[_id == "settings"][0]{chatUrl}',
  ]).catch(() => ({result: null}))
  const seed: SeedInput = {
    organizationId,
    chatUrl: existing.result?.chatUrl,
    knowledgeBases: seedKnowledgeBases.map((kb) => ({id: kb.publicId, title: kb.title})),
  }
  const folder = mkdtempSync(join(tmpdir(), 'context-hackathon-'))
  const settingsFile = join(folder, 'settings.json')
  const agentsFile = join(folder, 'agents.json')
  writeFileSync(settingsFile, JSON.stringify(settingsDocument(seed)))
  writeFileSync(agentsFile, JSON.stringify(exampleAgents(seed)))
  // The secrets document keeps whatever tool keys are already there, and takes the organization token.
  const secretsFile = join(folder, 'secrets.json')
  writeFileSync(secretsFile, JSON.stringify(secretsDocument({...(storedSecrets.result ?? {}), [CONTEXT_TOKEN_KEY]: contextToken})))
  const wroteSettings = await sanity(['documents', 'create', settingsFile, '--replace', '-p', projectId, '-d', DATASET])
  const wroteAgents = await sanity(['documents', 'create', agentsFile, '--missing', '-p', projectId, '-d', DATASET])
  const wroteSecrets = await sanity(['documents', 'create', secretsFile, '--replace', '-p', projectId, '-d', DATASET])
  if (wroteSettings.code !== 0 || wroteAgents.code !== 0 || wroteSecrets.code !== 0) {
    p.log.warn(`Couldn't write the settings, keys or example agents: ${(wroteSettings.stderr || wroteAgents.stderr || wroteSecrets.stderr).trim().slice(0, 300)}`)
  } else {
    p.log.success('Saved the settings, the organization token (under Keys) and two example agents (existing agents were left alone)')
  }

  // 11. Deploy the schema and the Studio
  const spin = p.spinner()
  spin.start('Deploying the schema')
  const schema = await sanity(['schemas', 'deploy'], {env: studioEnv})
  spin.stop(schema.code === 0 ? 'Schema deployed' : `Schema deploy failed: ${(schema.stderr || schema.stdout).trim().slice(0, 300)}`)

  for (;;) {
    p.log.step(`Deploying the Studio to https://${hostname}.sanity.studio`)
    const deploy = await sanity(['deploy', '--url', hostname, '--yes'], {interactive: true, env: {...studioEnv, SANITY_STUDIO_HOSTNAME: hostname}})
    if (deploy.code === 0) break
    const retry = check(await p.confirm({message: 'The Studio didn\'t deploy. Try another address?'}))
    if (!retry) break
    hostname = check(await p.text({message: 'Studio address: ____.sanity.studio', validate: (v) => (v && /^[a-z0-9][a-z0-9-]{2,62}$/.test(v) ? undefined : 'Lowercase letters, numbers and dashes')}))
    writeEnv(STUDIO_ENV, 'Written by the hackathon setup', {...studioEnv, SANITY_STUDIO_HOSTNAME: hostname})
  }

  const handoff = encodeHandoff({
    projectId,
    dataset: DATASET,
    readToken,
    organizationId,
    studioUrl: `https://${hostname}.sanity.studio`,
    hackathonDate,
    expiresAt,
  })
  p.note(
    [
      `Studio: https://${hostname}.sanity.studio`,
      '',
      'Send this line to your Sanity contact. It holds the read-only project token the chat app reads the agents',
      'and Keys with, so use a secure share (like a 1Password link), not email or Slack:',
      '',
      handoff,
      '',
      'They set up the chat app from it and send back its address and passcode. Then:',
      '1. In the Studio, open Settings and paste the chat\'s address, so "Try it" and the tool and model pickers work.',
      '2. Set any tool keys in the Studio, under Keys.',
      `3. Invite attendees to the project as Editors: https://www.sanity.io/manage/project/${projectId}/members`,
      '',
      `Both of setup's tokens stop working on ${formatDay(expiresAt)}, a week after the hackathon. To change the date, run ${RERUN} again.`,
      `Lost the line? It's also in .env.chat, and running ${RERUN} again prints it.`,
    ].join('\n'),
    'Done',
  )
  p.outro('Happy hacking.')
}

main().catch((error: unknown) => {
  p.cancel(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
