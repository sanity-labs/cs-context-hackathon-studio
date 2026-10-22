import {LinkIcon} from '@sanity/icons/Link'
import {defineArrayMember, defineField, defineType} from 'sanity'

/** Rich text with the few styles an agent's instructions need: headings, lists, emphasis, code and links. */
export const instructionsType = defineType({
  name: 'instructions',
  title: 'Instructions',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'Heading', value: 'h2'},
        {title: 'Subheading', value: 'h3'},
      ],
      lists: [
        {title: 'Bullets', value: 'bullet'},
        {title: 'Numbers', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Strong', value: 'strong'},
          {title: 'Emphasis', value: 'em'},
          {title: 'Code', value: 'code'},
        ],
        annotations: [
          defineArrayMember({
            name: 'link',
            title: 'Link',
            type: 'object',
            icon: LinkIcon,
            fields: [
              defineField({
                name: 'href',
                title: 'URL',
                type: 'url',
                validation: (rule) => rule.required().uri({scheme: ['https', 'http', 'mailto']}),
              }),
            ],
          }),
        ],
      },
    }),
  ],
})
