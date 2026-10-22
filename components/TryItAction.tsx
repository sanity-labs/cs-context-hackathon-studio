import {PlayIcon} from '@sanity/icons/Play'
import {useEffect, useState} from 'react'
import {type DocumentActionComponent, useClient} from 'sanity'

import {apiVersion} from '../env'

/** Opens the chat with this agent picked. Only published agents answer there. */
export const TryItAction: DocumentActionComponent = (props) => {
  const client = useClient({apiVersion})
  const [chatUrl, setChatUrl] = useState<string | null>(null)

  useEffect(() => {
    const subscription = client.observable
      .fetch<string | null>(`*[_id == "settings"][0].chatUrl`)
      .subscribe({next: (url) => setChatUrl(url ?? null), error: () => setChatUrl(null)})
    return () => subscription.unsubscribe()
  }, [client])

  const name = (props.published?.name as {current?: string} | undefined)?.current
  const disabled = !chatUrl || !name
  const title = !chatUrl
    ? 'Add the chat address in Settings first'
    : !name
      ? 'Publish the agent first'
      : props.draft
        ? 'Opens the published version. Publish to try your latest changes.'
        : undefined

  return {
    label: 'Try it',
    icon: PlayIcon,
    disabled,
    title,
    onHandle: () => {
      if (!chatUrl || !name) return
      const url = new URL(chatUrl)
      url.searchParams.set('agent', name)
      window.open(url.toString(), '_blank', 'noopener')
      props.onComplete()
    },
  }
}
