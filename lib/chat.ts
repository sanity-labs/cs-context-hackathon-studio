import type {Model} from '@hackathon/agents'
import {type SanityClient, useClient} from 'sanity'

import {apiVersion} from '../env'
import {cachedFor, type Loadable, useLoadable} from './loadable'

/** One tool as the chat app lists it at /api/tools. */
export type ToolSummary = {
  name: string
  group: string
  title: string
  description: string
  connects: string[]
  approval: boolean
  keys: string[]
}

export type ToolKey = {connector: string; title: string; key: string; kind: 'secret' | 'config'; optional?: true; help?: string}

export type ToolCatalog = {tools: ToolSummary[]; keys: ToolKey[]}

type FromChat<T> = {chatUrl: string; data: T}

/**
 * The chat app lives in another repo, so the Studio asks it, at the chat
 * address in Settings, which tools and models there are. A tool merged into
 * the chat app shows up here without redeploying the Studio.
 */
async function fromChat<T>(client: SanityClient, path: string): Promise<FromChat<T>> {
  const chatUrl = await client.fetch<string | null>(`*[_id == "settings"][0].chatUrl`)
  if (!chatUrl) throw new Error('Add the chat address in Settings first')
  const response = await fetch(new URL(path, chatUrl), {cache: 'no-store'})
  if (!response.ok) throw new Error(`the chat app answered ${response.status}`)
  return {chatUrl, data: (await response.json()) as T}
}

const loadTools = cachedFor(30_000, (client: SanityClient) => fromChat<ToolCatalog>(client, '/api/tools'))
const loadModels = cachedFor(5 * 60_000, (client: SanityClient) => fromChat<{models: Model[]}>(client, '/api/models'))

/** `reload` asks again once the short cache has gone stale, as a picker opening does. */
export function useToolCatalog(reload = 0): Loadable<FromChat<ToolCatalog>> {
  const client = useClient({apiVersion})
  return useLoadable(() => loadTools(client), [client, reload])
}

export function useToolList(reload = 0): Loadable<ToolSummary[]> {
  const catalog = useToolCatalog(reload)
  return catalog.status === 'ready' ? {status: 'ready', data: catalog.data.data.tools} : catalog
}

export function useModels(): Loadable<Model[]> {
  const client = useClient({apiVersion})
  const listing = useLoadable(() => loadModels(client), [client])
  return listing.status === 'ready' ? {status: 'ready', data: listing.data.data.models} : listing
}
