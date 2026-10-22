import {BookIcon} from '@sanity/icons/Book'
import {Badge, type BadgeTone, Stack, Text} from '@sanity/ui'
import {useState} from 'react'
import {defineField, defineType, type SanityClient, useClient} from 'sanity'

import {AddPicker, listingMessage} from '../components/AddPicker'
import {apiVersion, organizationId, organizationUrl} from '../env'
import {listedPick} from '../lib/listedPick'
import {cachedFor, type Loadable, useLoadable} from '../lib/loadable'
import {type PickFunctionsProps, pickerProps, withPicker} from '../lib/picked'

const SHAPE = {_type: 'agentKnowledgeBase', field: 'id'}

type KnowledgeBase = Awaited<ReturnType<SanityClient['context']['knowledgeBases']['list']>>['data'][number]

// `review` is built and readable, with issues waiting; `created` was never built.
const STATE_TONE: Record<KnowledgeBase['state'], BadgeTone> = {
  ready: 'positive',
  review: 'caution',
  stale: 'caution',
  building: 'primary',
  created: 'default',
  paused: 'default',
}

/** States an agent can't read from yet, and what to do about them. */
const NOT_READY: Partial<Record<KnowledgeBase['state'], string>> = {
  created: 'Not built yet. Click Build entries in the Context app.',
  building: 'Still building. The agent can read it once it finishes.',
  paused: 'Paused. Resume it in the Context app.',
}

const listKnowledgeBases = cachedFor(30_000, async (client: SanityClient): Promise<KnowledgeBase[]> => {
  if (!organizationId) throw new Error('SANITY_STUDIO_ORGANIZATION_ID is not set. Run the setup again (npm run hackathon)')
  const all: KnowledgeBase[] = []
  let cursor: string | undefined
  do {
    const page = await client.context.knowledgeBases.list({organizationId, limit: 200, cursor})
    all.push(...page.data)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return all
})

function useKnowledgeBases(reload = 0): Loadable<KnowledgeBase[]> {
  const client = useClient({apiVersion})
  return useLoadable(() => listKnowledgeBases(client), [client, reload])
}

export const agentKnowledgeBaseType = defineType({
  name: SHAPE._type,
  title: 'Knowledge Base',
  type: 'object',
  icon: BookIcon,
  fields: [
    defineField({
      name: SHAPE.field,
      title: 'Knowledge Base id',
      type: 'string',
      readOnly: true,
      validation: (rule) => rule.required(),
    }),
    // What it was called when picked, for anyone reading the data. The preview shows the current title.
    defineField({name: 'title', title: 'Title', type: 'string', readOnly: true, hidden: true}),
  ],
  // `prepare` cannot reach Context, so the id travels as the title and the
  // preview component swaps in what the listing knows.
  preview: {select: {id: SHAPE.field}, prepare: ({id}) => ({title: id})},
  components: listedPick({
    field: SHAPE.field,
    useListing: useKnowledgeBases,
    idOf: (kb) => kb.publicId,
    urlOf: (id) => organizationUrl(`context/knowledge-bases/${id}`),
    describe: (kb) => ({
      title: kb.title,
      subtitle: NOT_READY[kb.state] ?? kb.description ?? undefined,
      status: <Badge tone={STATE_TONE[kb.state]}>{kb.state}</Badge>,
    }),
    copy: {loading: 'Sanity Context', missing: 'No longer in Sanity Context'},
  }),
})

function KnowledgeBasePicker(props: PickFunctionsProps) {
  const [opened, setOpened] = useState(0)
  const listing = useKnowledgeBases(opened)
  const knowledgeBases = listing.status === 'ready' ? listing.data : []

  return (
    <Stack gap={3}>
      <AddPicker
        items={knowledgeBases.map((kb) => ({
          id: kb.publicId,
          title: kb.title,
          subtitle: NOT_READY[kb.state] ?? kb.description ?? undefined,
          badge: {text: kb.state, tone: STATE_TONE[kb.state]},
        }))}
        {...pickerProps(props, SHAPE, (id): Record<string, string> => {
          const title = knowledgeBases.find((kb) => kb.publicId === id)?.title
          return title ? {title} : {}
        })}
        // Teams build theirs during the session, so opening asks again.
        onOpen={() => setOpened((count) => count + 1)}
        addLabel="Add Knowledge Base"
        filterPlaceholder="Filter Knowledge Bases"
        nothingToPick={listingMessage(listing, {
          loading: 'Loading from Sanity Context',
          failed: 'Could not list Knowledge Bases',
          empty: 'No Knowledge Bases in this organization yet.',
        })}
      />
      <Text size={1}>
        <a href={organizationUrl('context/knowledge-bases/new')} target="_blank" rel="noreferrer">
          New Knowledge Base&nbsp;↗
        </a>
      </Text>
    </Stack>
  )
}

export const knowledgeBasesDescription =
  'Collections of material it answers from, like a policy handbook or a product FAQ: its canon. Your team builds one in Sanity Context at the start of the session.'

export const KnowledgeBasesInput = withPicker(KnowledgeBasePicker)
