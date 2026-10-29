import {AddIcon} from '@sanity/icons/Add'
import {Badge, Box, Button, Card, Container, Flex, Heading, Stack, Text, TextInput} from '@sanity/ui'
import {type ChangeEvent, useState} from 'react'

import {type ToolKey, useToolCatalog} from '../lib/chat'
import {CONTEXT_TOKEN_KEY, type Kind, useHackathonSecrets} from '../lib/secrets'
import {AddVariableDialog} from './AddVariableDialog'

type Row = {key: string; kind: Kind; optional?: boolean; help?: string}

/**
 * Like @s's environment variables page, but stored in this project: the
 * Context organization token and every tool's keys, in one private document
 * the chat app reads on its server. A key set here is live on the next
 * question, with no redeploy. Secrets are never shown again once saved.
 */
export function KeysTool() {
  const [reload, setReload] = useState(0)
  const state = useToolCatalog(reload)
  const {loading, values, config, setValue} = useHackathonSecrets()
  const [adding, setAdding] = useState(false)

  const groups: {title: string; rows: Row[]}[] = [
    {
      title: 'Sanity Context',
      rows: [
        {
          key: CONTEXT_TOKEN_KEY,
          kind: 'secret',
          help: 'An organization token with the Context Editor role, from Manage ("Chat app: Context and Insights"). Agents read the Knowledge Bases with it, and Insights saves conversations with it, which Context Viewer can\'t do. It can change Context across the organization, so delete it after the hackathon.',
        },
      ],
    },
  ]
  const declared: ToolKey[] = state.status === 'ready' ? state.data.data.keys : []
  const byConnector = new Map<string, ToolKey[]>()
  for (const key of declared) byConnector.set(key.title, [...(byConnector.get(key.title) ?? []), key])
  for (const [title, keys] of byConnector) groups.push({title, rows: keys.map((key) => ({key: key.key, kind: key.kind, optional: key.optional, help: key.help}))})
  // Keys added here that no tool reads yet, like one for a tool still in a pull request.
  const known = new Set([CONTEXT_TOKEN_KEY, ...declared.map((key) => key.key)])
  const others = Object.keys(values)
    .filter((key) => !known.has(key))
    .sort()
    .map((key): Row => ({key, kind: config.has(key) ? 'config' : 'secret', optional: true}))
  if (others.length && state.status === 'ready') {
    groups.push({title: 'Other variables', rows: others})
  }

  return (
    <Container width={2} padding={4}>
      <Stack gap={5}>
        <Stack gap={3}>
          <Flex align="center" gap={3}>
            <Box flex={1}>
              <Heading size={2}>Keys</Heading>
            </Box>
            <Button icon={AddIcon} text="Add variable" mode="ghost" disabled={loading} onClick={() => setAdding(true)} />
          </Flex>
          <Text muted size={1}>
            What the chat app needs to reach Sanity Context and each tool&apos;s system. Values are saved in a private document in
            this project and read only by the chat app&apos;s server, so a change is live on the next question. Building a tool?
            Add its keys with Add variable, and they&apos;re here when it&apos;s merged.
          </Text>
          <Card tone="caution" padding={3} radius={2}>
            <Text size={1}>
              Anyone with read access to this project can read these values, and they are included in dataset exports. Use
              read-only keys, and delete or rotate them after the hackathon.
            </Text>
          </Card>
        </Stack>
        {state.status === 'error' ? (
          <Card tone="caution" padding={3} radius={2}>
            <Flex gap={3} align="center">
              <Box flex={1}>
                <Text size={1}>Could not list the tools&apos; keys: {state.message}</Text>
              </Box>
              <Button text="Try again" mode="ghost" fontSize={1} padding={2} onClick={() => setReload((count) => count + 1)} />
            </Flex>
          </Card>
        ) : null}
        {groups.map((group) => (
          <Stack key={group.title} gap={3}>
            <Text weight="semibold">{group.title}</Text>
            {group.title === 'Slack' && state.status === 'ready' ? <SlackSetup chatUrl={state.data.chatUrl} /> : null}
            {group.rows.map((row) => (
              <KeyRow key={row.key} row={row} value={values[row.key]} disabled={loading} onSave={(next) => setValue(row.key, next)} />
            ))}
          </Stack>
        ))}
        {state.status === 'loading' ? <Text size={1} muted>Loading the tools&apos; keys from the chat app…</Text> : null}
      </Stack>
      {adding ? (
        <AddVariableDialog
          declared={declared}
          values={values}
          onClose={() => setAdding(false)}
          onSave={(key, value, kind) => {
            setValue(key, value, declared.some((it) => it.key === key) ? undefined : kind)
            setAdding(false)
          }}
        />
      ) : null}
    </Container>
  )
}

function KeyRow({row, value, disabled, onSave}: {row: Row; value?: string; disabled: boolean; onSave: (value: string | undefined) => void}) {
  const [draft, setDraft] = useState('')
  const isSet = Boolean(value)
  const secret = row.kind === 'secret'

  return (
    <Card padding={3} radius={2} border>
      <Stack gap={3}>
        <Flex gap={2} align="center" wrap="wrap">
          <Text size={1} weight="semibold">
            <code>{row.key}</code>
          </Text>
          <Badge tone={isSet ? 'positive' : row.optional ? 'default' : 'caution'} fontSize={0}>
            {isSet ? 'Set' : row.optional ? 'Optional' : 'Not set'}
          </Badge>
          {!secret && isSet ? (
            <Text size={1} muted>
              {value}
            </Text>
          ) : null}
        </Flex>
        {row.help ? (
          <Text size={1} muted>
            {row.help}
          </Text>
        ) : null}
        <Flex gap={2}>
          <Box flex={1}>
            <TextInput
              type={secret ? 'password' : 'text'}
              autoComplete="off"
              placeholder={isSet ? (secret ? 'Enter a new value to replace it' : 'Enter a new value') : 'Value'}
              value={draft}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value)}
              disabled={disabled}
              fontSize={1}
            />
          </Box>
          <Button
            text="Save"
            tone="primary"
            fontSize={1}
            disabled={disabled || !draft.trim()}
            onClick={() => {
              onSave(draft)
              setDraft('')
            }}
          />
          {isSet ? <Button text="Clear" mode="ghost" tone="critical" fontSize={1} disabled={disabled} onClick={() => onSave(undefined)} /> : null}
        </Flex>
      </Stack>
    </Card>
  )
}

/**
 * The customer's own Slack app, so it is an internal app: full rate limits and
 * Slack's search API. One link opens Slack's "create from manifest" screen,
 * already pointing at this customer's chat app.
 */
function SlackSetup({chatUrl}: {chatUrl: string}) {
  const create = new URL('/api/slack/manifest?create=1', chatUrl).toString()
  return (
    <Card padding={3} radius={2} tone="transparent" border>
      <Stack gap={3}>
        <Text size={1}>
          Optional. With a Slack app, agents answer when mentioned in Slack or sent a direct message, and can read and search
          public channels. A Slack admin in your workspace:
        </Text>
        <Text size={1}>
          1.{' '}
          <a href={create} target="_blank" rel="noreferrer">
            Creates the app from the chat app&apos;s manifest ↗
          </a>
          , choosing your workspace. It&apos;s your own app, so your workspace&apos;s approval rules apply.
        </Text>
        <Text size={1}>2. Clicks Install to Workspace.</Text>
        <Text size={1}>
          3. Pastes the Bot User OAuth Token (OAuth &amp; Permissions) into SLACK_BOT_TOKEN, and the Signing Secret (Basic
          Information) into SLACK_SIGNING_SECRET, below.
        </Text>
        <Text size={1}>4. Invites the app to the channels agents should read, with /invite. Then mention it to ask.</Text>
      </Stack>
    </Card>
  )
}
