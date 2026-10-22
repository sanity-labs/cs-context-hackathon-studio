import {Badge} from '@sanity/ui'
import {type ComponentType, type ReactNode, useEffect} from 'react'
import type {ObjectItemProps, PreviewProps} from 'sanity'

import type {Loadable} from './loadable'

type Listed<T> = {
  field: string
  useListing: () => Loadable<T[]>
  idOf: (item: T) => string
  /** Opening the item goes here, in a new tab. Without one, the item opens as usual. */
  urlOf?: (id: string) => string
  describe: (item: T) => Pick<PreviewProps, 'title' | 'subtitle'> & {status?: ReactNode}
  copy: {loading: string; missing: string}
}

/**
 * As `@s` has it: a pick stores only an id, and its preview looks the id up
 * in the listing, so a title or state changed elsewhere shows here too.
 */
export function listedPick<T>({field, useListing, idOf, urlOf, describe, copy}: Listed<T>): {
  preview: ComponentType<PreviewProps>
  item?: ComponentType<ObjectItemProps>
} {
  function ListedPreview(props: PreviewProps) {
    const listing = useListing()
    // `prepare` puts the id in the title, since it cannot reach the listing.
    if (listing.status === 'loading') return props.renderDefault({...props, subtitle: copy.loading})
    if (listing.status === 'error') return props.renderDefault({...props, subtitle: listing.message})
    const found = listing.data.find((item) => idOf(item) === props.title)
    if (!found) {
      return props.renderDefault({...props, subtitle: copy.missing, status: <Badge tone="critical">missing</Badge>} as PreviewProps)
    }
    return props.renderDefault({...props, ...describe(found)} as PreviewProps)
  }

  if (!urlOf) return {preview: ListedPreview}

  function ListedItem(props: ObjectItemProps) {
    const id = Reflect.get(props.value, field)
    const {open, onClose} = props
    useEffect(() => {
      if (!open || typeof id !== 'string' || !urlOf) return
      onClose()
      window.open(urlOf(id), '_blank', 'noopener')
    }, [open, onClose, id])
    return props.renderDefault(props)
  }

  return {preview: ListedPreview, item: ListedItem}
}
