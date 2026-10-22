import {AddIcon} from '@sanity/icons/Add'
import {SearchIcon} from '@sanity/icons/Search'
import {Badge, type BadgeTone, Box, Button, Card, Checkbox, Flex, Stack, Text, TextInput, useClickOutsideEvent} from '@sanity/ui'
import {Popover} from '@sanity/ui/popover'
import {type ReactElement, useMemo, useState} from 'react'
import {CommandList, type CommandListRenderItemCallback} from 'sanity'

import type {Loadable} from '../lib/loadable'

export type PickerItem = {
  id: string
  title: string
  subtitle?: string
  group?: string
  badge?: {text: string; tone: BadgeTone}
}

type Props = {
  id?: string
  items: PickerItem[]
  selected: string[]
  onToggle: (id: string, checked: boolean) => void
  /** Called as it opens, so a listing that changes during the day can ask again. */
  onOpen?: () => void
  readOnly?: boolean
  addLabel: string
  filterPlaceholder: string
  nothingToPick: string
}

export function listingMessage(listing: Loadable<unknown>, copy: {loading: string; failed: string; empty: string}): string {
  if (listing.status === 'loading') return copy.loading
  if (listing.status === 'error') return `${copy.failed}: ${listing.message}`
  return copy.empty
}

type ListProps = Pick<Props, 'items' | 'selected' | 'onToggle' | 'filterPlaceholder' | 'nothingToPick'>

type Row = {type: 'header'; title: string; first: boolean} | {type: 'item'; item: PickerItem}

const ROW_HEIGHT = 54
const HEADER_HEIGHT = 36
// The space above a header parts it from the group before, and the first has none.
const FIRST_HEADER_HEIGHT = 28
/** What `padding={1}` on the list is in pixels. */
const LIST_PADDING = 4
const LIST_MAX_HEIGHT = 360

/** The list, opened under `reference` and as wide as it, for a trigger other than the add button. */
export function PickerPopover({
  open,
  onClose,
  reference,
  children,
  ...list
}: ListProps & {open: boolean; onClose: () => void; reference: HTMLElement | null; children: ReactElement}) {
  const [popover, setPopover] = useState<HTMLElement | null>(null)

  useClickOutsideEvent(open && onClose, () => [reference, popover])

  return (
    <Popover
      open={open}
      portal
      constrainSize
      placement="bottom-start"
      matchReferenceWidth
      radius={2}
      ref={setPopover}
      referenceElement={reference}
      content={<PickerList {...list} onClose={onClose} />}
    >
      {children}
    </Popover>
  )
}

/** As `@s` has it: the array's "Add item" button, opening a filterable list of checkboxes. */
export function AddPicker({onOpen, ...props}: Props) {
  const [open, setOpen] = useState(false)
  const [button, setButton] = useState<HTMLElement | null>(null)

  return (
    <PickerPopover {...props} open={open} onClose={() => setOpen(false)} reference={button}>
      <Button
        ref={setButton}
        id={props.id}
        icon={AddIcon}
        mode="ghost"
        width="fill"
        fontSize={1}
        padding={3}
        text={`${props.addLabel}…`}
        selected={open}
        disabled={props.readOnly}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
      />
    </PickerPopover>
  )
}

function PickerList({items, selected, onToggle, onClose, filterPlaceholder, nothingToPick}: ListProps & {onClose: () => void}) {
  const [filter, setFilter] = useState('')
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  const rows = useMemo(() => toRows(items, filter), [items, filter])
  const height = Math.min(LIST_MAX_HEIGHT, rows.reduce((sum, row) => sum + heightOf(row), 0) + LIST_PADDING * 2)

  const renderItem: CommandListRenderItemCallback<Row> = (row) => {
    if (row.type === 'header') {
      return (
        <Flex align="flex-end" paddingX={3} paddingBottom={2} style={{height: heightOf(row)}}>
          <Text size={0} weight="medium" muted style={{textTransform: 'uppercase'}}>
            {row.title}
          </Text>
        </Flex>
      )
    }
    const checked = selected.includes(row.item.id)
    return (
      <Card
        as="button"
        type="button"
        tabIndex={-1}
        paddingX={4}
        radius={2}
        style={{width: '100%', height: ROW_HEIGHT, textAlign: 'left'}}
        onClick={(event) => {
          if (!(event.target instanceof HTMLInputElement)) onToggle(row.item.id, !checked)
        }}
      >
        <Flex align="center" gap={4} style={{height: '100%'}}>
          <Checkbox
            checked={checked}
            tabIndex={-1}
            // The mark is a fixed 17px with no size prop; this is the one lever.
            style={{transform: 'scale(1.2)'}}
            onChange={(event) => onToggle(row.item.id, event.currentTarget.checked)}
          />
          <Stack gap={2} flex={1} style={{minWidth: 0}}>
            <Text size={1} weight="medium" textOverflow="ellipsis">
              {row.item.title}
            </Text>
            {row.item.subtitle && (
              <Text size={1} muted textOverflow="ellipsis" title={row.item.subtitle}>
                {row.item.subtitle}
              </Text>
            )}
          </Stack>
          {row.item.badge && (
            <Badge tone={row.item.badge.tone} fontSize={0}>
              {row.item.badge.text}
            </Badge>
          )}
        </Flex>
      </Card>
    )
  }

  return (
    <Flex direction="column">
      <Card borderBottom padding={1}>
        <TextInput
          ref={setInput}
          icon={SearchIcon}
          border={false}
          fontSize={1}
          radius={2}
          autoComplete="off"
          placeholder={filterPlaceholder}
          value={filter}
          clearButton={filter.length > 0}
          onClear={() => setFilter('')}
          onChange={(event) => setFilter(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose()
          }}
        />
      </Card>
      {rows.length === 0 ? (
        <Box padding={4}>
          <Text size={1} muted align="center">
            {items.length === 0 ? nothingToPick : `Nothing matches “${filter}”`}
          </Text>
        </Box>
      ) : (
        <Box style={{height}}>
          <CommandList
            activeItemDataAttr="data-hovered"
            ariaLabel={filterPlaceholder}
            ariaMultiselectable
            autoFocus="input"
            inputElement={input}
            items={rows}
            itemHeight={ROW_HEIGHT}
            getItemKey={(index) => {
              const row = rows[index]!
              return row.type === 'header' ? `header-${row.title}` : row.item.id
            }}
            getItemDisabled={(index) => rows[index]!.type === 'header'}
            getItemSelected={(index) => {
              const row = rows[index]!
              return row.type === 'item' && selected.includes(row.item.id)
            }}
            renderItem={renderItem}
            overscan={10}
            padding={1}
          />
        </Box>
      )}
    </Flex>
  )
}

function heightOf(row: Row): number {
  if (row.type === 'item') return ROW_HEIGHT
  return row.first ? FIRST_HEADER_HEIGHT : HEADER_HEIGHT
}

function toRows(items: PickerItem[], filter: string): Row[] {
  const needle = filter.trim().toLowerCase()
  const visible = needle ? items.filter((item) => `${item.title} ${item.subtitle ?? ''}`.toLowerCase().includes(needle)) : items
  const groups = new Set(visible.map((item) => item.group))
  if (groups.size < 2) return visible.map((item) => ({type: 'item', item}))
  const rows: Row[] = []
  for (const group of groups) {
    if (group) rows.push({type: 'header', title: group, first: rows.length === 0})
    for (const item of visible) {
      if (item.group === group) rows.push({type: 'item', item})
    }
  }
  return rows
}
