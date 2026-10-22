import {BoltIcon} from '@sanity/icons/Bolt'
import {CogIcon} from '@sanity/icons/Cog'
import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Hackathon')
    .items([
      S.documentTypeListItem('agent').title('Agents').icon(BoltIcon),
      S.divider(),
      S.listItem()
        .title('Settings')
        .icon(CogIcon)
        .child(S.document().schemaType('settings').documentId('settings').title('Settings')),
    ])
