import {AGENT_NAME, RESERVED_AGENT_NAMES, toAgentName} from '@hackathon/agents'
import {BoltIcon} from '@sanity/icons/Bolt'
import {DocumentIcon} from '@sanity/icons/Document'
import {PlugIcon} from '@sanity/icons/Plug'
import {defineArrayMember, defineField, defineType, getPublishedId, type SlugValue, type ValidationContext} from 'sanity'

import {ModelInput} from '../components/ModelInput'
import {apiVersion} from '../env'
import {PICKER_ONLY} from '../lib/picked'
import {KnowledgeBasesInput, knowledgeBasesDescription} from './agentKnowledgeBase'
import {ToolsInput, toolsDescription} from './agentTool'

export const agentType = defineType({
  name: 'agent',
  title: 'Agent',
  type: 'document',
  icon: BoltIcon,
  groups: [
    {name: 'agent', title: 'Agent', icon: BoltIcon, default: true},
    {name: 'instructions', title: 'Instructions', icon: DocumentIcon},
    {name: 'access', title: 'Knowledge and tools', icon: PlugIcon},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'agent',
      description: 'The name people see in the chat, like "HR policy". Keep it short, and leave out "agent" or "bot".',
      validation: (rule) => rule.required().max(60),
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'slug',
      group: 'agent',
      description: 'What people type to ask this agent directly, like @hr-policy. Made from the title.',
      options: {source: 'title', slugify: toAgentName},
      validation: (rule) => rule.required().custom(usableName),
    }),
    defineField({
      name: 'description',
      title: 'What this agent covers',
      type: 'text',
      rows: 3,
      group: 'agent',
      description:
        'The chat reads this to decide which agent answers when nobody picks one. Name the topics it covers and the ones it doesn\'t, like "Expenses, travel and per diems. Not payroll."',
      validation: (rule) => rule.required().max(400),
    }),
    defineField({
      name: 'model',
      title: 'Model',
      type: 'string',
      group: 'agent',
      description:
        'Medium suits almost every agent. Small is quicker and cheaper, for simple, repetitive work. Large is for hard reasoning. Custom keeps one model you pick.',
      components: {input: ModelInput},
    }),
    defineField({
      name: 'instructions',
      title: 'Instructions',
      type: 'instructions',
      group: 'instructions',
      description:
        'What you would tell a new colleague: who it helps, what it does, how it should answer, and what it should refuse. Keep it to about a screen.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'knowledgeBases',
      title: 'Knowledge Bases',
      type: 'array',
      group: 'access',
      description: knowledgeBasesDescription,
      of: [defineArrayMember({type: 'agentKnowledgeBase'})],
      options: {disableActions: [...PICKER_ONLY]},
      components: {input: KnowledgeBasesInput},
    }),
    defineField({
      name: 'tools',
      title: 'Tools',
      type: 'array',
      group: 'access',
      description: toolsDescription,
      of: [defineArrayMember({type: 'agentTool'})],
      options: {disableActions: [...PICKER_ONLY]},
      components: {input: ToolsInput},
    }),
  ],
  preview: {
    select: {title: 'title', name: 'name.current'},
    prepare: ({title, name}) => ({title, subtitle: name ? `@${name}` : undefined}),
  },
})

async function usableName(slug: SlugValue | undefined, context: ValidationContext) {
  const name = slug?.current
  if (!name) return true
  if (!AGENT_NAME.test(name)) return 'Lowercase letters and digits, separated by dashes'
  if ((RESERVED_AGENT_NAMES as readonly string[]).includes(name)) return `${name} is reserved by the chat. Pick another name.`

  const id = context.document?._id
  if (!id) return true
  const taken = await context
    .getClient({apiVersion})
    .fetch<{title?: string} | null>(
      `*[_type == "agent" && !sanity::versionOf($id) && name.current == $name][0]{title}`,
      {id: getPublishedId(id), name},
    )
  return taken ? `${taken.title ?? 'Another agent'} already answers to @${name}.` : true
}
