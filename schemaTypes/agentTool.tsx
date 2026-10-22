import {PlugIcon} from '@sanity/icons/Plug'
import {Badge, Card, Flex, Inline, Stack, Text} from '@sanity/ui'
import {useState} from 'react'
import {defineField, defineType, type ObjectInputProps, type PreviewProps} from 'sanity'

import {AddPicker, listingMessage} from '../components/AddPicker'
import {type ToolCatalog, type ToolSummary, useToolCatalog} from '../lib/chat'
import {type PickFunctionsProps, pickerProps, withPicker} from '../lib/picked'
import {useHackathonSecrets} from '../lib/secrets'

const SHAPE = {_type: 'agentTool', field: 'name'}

/** The keys a tool can't run without that nobody has set under Keys yet. */
function unsetKeys(tool: ToolSummary, catalog: ToolCatalog, values: Record<string, string | undefined>): string[] {
  const required = new Set(catalog.keys.filter((key) => !key.optional).map((key) => key.key))
  return tool.keys.filter((key) => required.has(key) && !values[key])
}

/** Tools come from the chat app, so a pick is looked up there, like a Knowledge Base in Context. */
function useTool(name: unknown) {
  const catalog = useToolCatalog()
  const {values} = useHackathonSecrets()
  if (catalog.status !== 'ready') return {catalog}
  const tool = catalog.data.data.tools.find((it) => it.name === name)
  return {catalog, tool, missing: tool ? unsetKeys(tool, catalog.data.data, values) : []}
}

function ToolPreview(props: PreviewProps) {
  const {catalog, tool, missing = []} = useTool(props.title)
  if (catalog.status === 'loading') return props.renderDefault({...props, subtitle: 'The chat app'})
  if (catalog.status === 'error') return props.renderDefault({...props, subtitle: catalog.message})
  if (!tool) {
    return props.renderDefault({...props, subtitle: 'No longer in the chat app', status: <Badge tone="critical">missing</Badge>} as PreviewProps)
  }
  return props.renderDefault({
    ...props,
    title: tool.title,
    subtitle: missing.length ? `Needs ${missing.join(', ')}, under Keys` : tool.description,
    status: missing.length ? <Badge tone="caution">needs keys</Badge> : undefined,
  } as PreviewProps)
}

/** Opening a picked tool shows what it does and what it needs. Developers change tools in the chat app's repo. */
function ToolSheet(props: ObjectInputProps) {
  const {catalog, tool, missing = []} = useTool(Reflect.get(props.value ?? {}, SHAPE.field))
  if (catalog.status !== 'ready') return <Text size={1} muted>{catalog.status === 'error' ? catalog.message : 'Loading…'}</Text>
  if (!tool) {
    return (
      <Card tone="critical" padding={3} radius={2}>
        <Text size={1}>This tool is no longer in the chat app. Remove it from this agent.</Text>
      </Card>
    )
  }
  return (
    <Stack gap={4}>
      <Text size={1} muted>
        {tool.description}
      </Text>
      <Flex gap={2} align="center" wrap="wrap">
        <Text size={1} weight="medium">
          Name
        </Text>
        <Badge>{tool.name}</Badge>
      </Flex>
      <Flex gap={2} align="center" wrap="wrap">
        <Text size={1} weight="medium">
          Connects to
        </Text>
        {tool.connects.length ? (
          <Inline gap={2}>
            {tool.connects.map((system) => (
              <Badge key={system}>{system}</Badge>
            ))}
          </Inline>
        ) : (
          <Text size={1} muted>
            No other systems
          </Text>
        )}
      </Flex>
      {missing.length ? (
        <Card tone="caution" padding={3} radius={2}>
          <Text size={1}>
            Needs {missing.join(', ')}. Set {missing.length > 1 ? 'them' : 'it'} under Keys in the top menu.
          </Text>
        </Card>
      ) : null}
      <Text size={1} muted>
        Developers write tools in the chat app&apos;s repo. To change what this one does, open a pull request there.
      </Text>
    </Stack>
  )
}

export const agentToolType = defineType({
  name: SHAPE._type,
  title: 'Tool',
  type: 'object',
  icon: PlugIcon,
  options: {modal: {type: 'dialog', width: 1}},
  components: {input: ToolSheet, preview: ToolPreview},
  fields: [
    defineField({name: SHAPE.field, title: 'Name', type: 'string', readOnly: true, validation: (rule) => rule.required()}),
    // What it was called when picked, for anyone reading the data. The preview shows the current title.
    defineField({name: 'title', title: 'Title', type: 'string', readOnly: true, hidden: true}),
  ],
  // `prepare` cannot reach the chat app, so the name travels as the title and the preview swaps in the rest.
  preview: {select: {name: SHAPE.field}, prepare: ({name}) => ({title: name})},
})

function ToolPicker(props: PickFunctionsProps) {
  const [opened, setOpened] = useState(0)
  const catalog = useToolCatalog(opened)
  const {values} = useHackathonSecrets()
  const picks = pickerProps(props, SHAPE, (name): Record<string, string> => {
    const title = catalog.status === 'ready' ? catalog.data.data.tools.find((tool) => tool.name === name)?.title : undefined
    return title ? {title} : {}
  })
  const listed = catalog.status === 'ready' ? catalog.data.data : {tools: [], keys: []}
  // A tool that writes waits for the chat to ask for approval, so only one already picked is listed.
  const tools = listed.tools.filter((tool) => !tool.approval || picks.selected.includes(tool.name))

  return (
    <AddPicker
      items={tools.map((tool) => {
        const missing = unsetKeys(tool, listed, values)
        return {
          id: tool.name,
          title: tool.title,
          subtitle: tool.description,
          group: tool.connects[0] ?? 'Built in',
          badge: missing.length ? {text: 'needs keys', tone: 'caution' as const} : undefined,
        }
      })}
      {...picks}
      // A tool merged into the chat app shows up without a reload.
      onOpen={() => setOpened((count) => count + 1)}
      addLabel="Add tool"
      filterPlaceholder="Filter tools"
      nothingToPick={listingMessage(catalog, {
        loading: 'Asking the chat app',
        failed: 'Could not list the tools',
        empty: 'The chat app has no tools yet.',
      })}
    />
  )
}

export const toolsDescription =
  'Look-ups in other systems, like a Slack channel or today\'s exchange rate: its records. A Knowledge Base says what the policy is; a tool says what happened. It decides when to use each one, so pick only what the job needs.'

export const ToolsInput = withPicker(ToolPicker)
