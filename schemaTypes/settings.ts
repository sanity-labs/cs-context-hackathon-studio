import {CogIcon} from '@sanity/icons/Cog'
import {defineField, defineType} from 'sanity'

/** One document, written by the setup (`npm run hackathon`). The chat app and the Studio read it. */
export const settingsType = defineType({
  name: 'settings',
  title: 'Settings',
  type: 'document',
  icon: CogIcon,
  fields: [
    defineField({
      name: 'chatUrl',
      title: 'Chat address',
      type: 'url',
      description: 'Where the chat app is deployed, like https://acme-agents.vercel.app. The Studio links "Try it" here, and asks it which tools and models there are.',
    }),
    defineField({
      name: 'organizationId',
      title: 'Organization',
      type: 'string',
      description: 'The Sanity organization that holds the Knowledge Bases.',
      readOnly: true,
    }),
  ],
  preview: {prepare: () => ({title: 'Settings'})},
})
