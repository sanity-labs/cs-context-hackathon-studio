import {findModel, type Model, MODEL, MODEL_SIZES} from '@hackathon/agents'
import {SelectIcon} from '@sanity/icons/Select'
import {Stack, Text} from '@sanity/ui'
import {useState} from 'react'
import {set, type StringInputProps, unset} from 'sanity'

import {useModels} from '../lib/chat'
import {listingMessage, type PickerItem, PickerPopover} from './AddPicker'
import {SegmentControl} from './SegmentControl'

const SIZES = [
  {label: 'Small', value: MODEL_SIZES.sm},
  {label: 'Medium', value: MODEL_SIZES.md},
  {label: 'Large', value: MODEL_SIZES.lg},
]

const CUSTOM = 'custom'

/** OpenRouter addresses a model as `vendor/id`. */
function vendorOf(id: string): string {
  const slash = id.indexOf('/')
  return slash < 1 ? 'Other' : id.slice(0, slash)
}

/** The model half of the name, since the vendor half is the group header. */
function labelOf({id, name}: Model): string {
  const at = name.indexOf(': ')
  return at > 0 ? name.slice(at + 2) : name === id ? '' : name
}

/**
 * Vendors sort by the name their header shows, which OpenRouter gives as
 * `Vendor: Model`. Within a vendor, ids sort naturally so a family reads
 * together and `gpt-10` follows `gpt-2`.
 */
function byVendor(listed: Model[]): {vendor: string; models: Model[]}[] {
  const groups = new Map<string, Model[]>()
  for (const model of listed) groups.set(vendorOf(model.id), [...(groups.get(vendorOf(model.id)) ?? []), model])
  return [...groups]
    .map(([slug, group]) => {
      const models = group.toSorted((one, other) => one.id.localeCompare(other.id, undefined, {numeric: true}))
      const named = models.find((model) => model.name.indexOf(': ') > 0)
      return {vendor: named?.name.slice(0, named.name.indexOf(': ')) ?? slug, models}
    })
    .toSorted((one, other) => one.vendor.localeCompare(other.vendor, undefined, {sensitivity: 'base'}))
}

function cost(model: Model): string {
  const money = (amount: number) => `$${Number(amount.toFixed(2))}`
  const window =
    model.context >= 1_000_000
      ? `${Number((model.context / 1_000_000).toFixed(1))}M context`
      : model.context >= 1000
        ? `${Math.round(model.context / 1000)}K context`
        : undefined
  return [`${money(model.input)} in, ${money(model.output)} out per million tokens`, window].filter(Boolean).join(', ')
}

function nameOf(model: Model): string {
  return labelOf(model) || model.id
}

function note(value: string, listed: Model[], custom: boolean): string | undefined {
  const found = findModel(value, listed)
  if (!found) return custom ? 'No longer offered with zero data retention, so every answer fails. Pick another.' : undefined
  return custom ? `Stays on it until someone picks another. ${cost(found)}.` : `${nameOf(found)}, moving to each newer one. ${cost(found)}.`
}

/**
 * As `@s` has it: Small, Medium or Large, each following its family to the
 * newest model, or Custom, which keeps one model from OpenRouter's list.
 * Medium is stored as nothing, so it follows the default when that changes.
 */
export function ModelInput(props: StringInputProps) {
  const {onChange, readOnly, value} = props
  const listing = useModels()
  const listed = listing.status === 'ready' ? listing.data : []
  const [open, setOpen] = useState(false)
  const [field, setField] = useState<HTMLElement | null>(null)
  const size = SIZES.find((it) => it.value === (value ?? MODEL))
  const custom = !size
  const said = listing.status === 'ready' ? note(value ?? MODEL, listed, custom) : undefined
  const pinned = custom && value ? findModel(value, listed) : undefined
  const customLabel = custom && value ? (pinned ? nameOf(pinned) : value) : 'Custom'

  const items: PickerItem[] = byVendor(listed).flatMap(({vendor, models}) =>
    models.map((model) => ({
      id: model.id,
      title: model.id,
      subtitle: [labelOf(model), cost(model)].filter(Boolean).join(', '),
      group: vendor,
    })),
  )

  return (
    <PickerPopover
      open={open}
      onClose={() => setOpen(false)}
      reference={field}
      items={items}
      selected={custom && value ? [value] : []}
      filterPlaceholder="Filter models"
      nothingToPick={listingMessage(listing, {
        loading: 'Asking OpenRouter which models there are',
        failed: 'Could not list models',
        empty: 'No model can do what an agent needs without retaining prompts.',
      })}
      onToggle={(id, checked) => {
        setOpen(false)
        // Unchecking the one in hand is how an agent goes back to the default.
        onChange(checked ? set(id) : unset())
      }}
    >
      <Stack ref={setField} gap={3}>
        <SegmentControl
          ariaLabel="Model size"
          options={[...SIZES, {label: customLabel, value: CUSTOM, iconRight: SelectIcon}]}
          selected={open || custom ? CUSTOM : (size?.value ?? CUSTOM)}
          disabled={readOnly}
          onSelect={(picked) => {
            if (picked === CUSTOM) return setOpen(true)
            setOpen(false)
            onChange(picked === MODEL ? unset() : set(picked))
          }}
        />
        {said ? (
          <Text size={1} muted style={{textWrap: 'pretty'}}>
            {said}
          </Text>
        ) : listing.status === 'error' ? (
          <Text size={1} muted>
            Could not list models: {listing.message}.
          </Text>
        ) : null}
      </Stack>
    </PickerPopover>
  )
}
