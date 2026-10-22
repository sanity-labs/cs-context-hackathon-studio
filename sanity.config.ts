import {LockIcon} from '@sanity/icons/Lock'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {KeysTool} from './components/KeysTool'
import {TryItAction} from './components/TryItAction'
import {dataset, projectId} from './env'
import {agentType} from './schemaTypes/agent'
import {agentKnowledgeBaseType} from './schemaTypes/agentKnowledgeBase'
import {agentToolType} from './schemaTypes/agentTool'
import {instructionsType} from './schemaTypes/instructions'
import {settingsType} from './schemaTypes/settings'
import {structure} from './structure'

export default defineConfig({
  name: 'default',
  title: 'Context Hackathon',
  projectId,
  dataset,
  // Token sign-in, so the Studio can list the organization's Knowledge Bases on the user's behalf.
  auth: {loginMethod: 'dual'},
  plugins: [structureTool({structure, title: 'Agents'})],
  tools: (tools) => [...tools, {name: 'keys', title: 'Keys', icon: LockIcon, component: KeysTool}],
  schema: {
    types: [agentType, agentKnowledgeBaseType, agentToolType, instructionsType, settingsType],
    // Settings is a single document, opened from the structure, never created from the menu.
    templates: (templates) => templates.filter((template) => template.schemaType !== 'settings'),
  },
  document: {
    actions: (actions, {schemaType}) => {
      if (schemaType === 'settings') {
        return actions.filter((action) => !['duplicate', 'delete', 'unpublish'].includes(action.action ?? ''))
      }
      return schemaType === 'agent' ? [...actions, TryItAction] : actions
    },
  },
  // An agent is published or not. These features only add noise for a one-day build.
  releases: {enabled: false},
  scheduledPublishing: {enabled: false},
  scheduledDrafts: {enabled: false},
  tasks: {enabled: false},
  announcements: {enabled: false},
})
