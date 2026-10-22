import type {IconComponent} from '@sanity/icons'
import {Button, Flex} from '@sanity/ui'
import type {CSSProperties} from 'react'

export type SegmentOption<V extends string> = {value: V; label: string; iconRight?: IconComponent}

// Neighbours overlap by a pixel so two borders read as one, and the picked
// segment sits above them so its border is the one showing.
function joined(index: number, count: number, active: boolean): CSSProperties {
  return {
    ...(index > 0 ? {borderBottomLeftRadius: 0, borderTopLeftRadius: 0, marginLeft: -1} : {}),
    ...(index < count - 1 ? {borderBottomRightRadius: 0, borderTopRightRadius: 0} : {}),
    ...(active ? {position: 'relative', zIndex: 1} : {background: 'transparent'}),
  }
}

// A Button's text only ellipsizes once something narrower than it holds it.
const CLIPPED: CSSProperties = {
  display: 'block',
  maxWidth: '16em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** As `@s` has it: buttons joined into one control, one of them picked. */
export function SegmentControl<V extends string>({
  ariaLabel,
  options,
  selected,
  disabled,
  onSelect,
}: {
  ariaLabel: string
  options: SegmentOption<V>[]
  selected: V
  disabled?: boolean
  onSelect: (value: V) => void
}) {
  return (
    <Flex align="center" aria-label={ariaLabel} role="group">
      {options.map((option, index) => {
        const active = option.value === selected
        return (
          <Button
            key={option.value}
            aria-pressed={active}
            disabled={disabled}
            fontSize={1}
            mode="ghost"
            padding={3}
            selected={active}
            text={<span style={CLIPPED}>{option.label}</span>}
            iconRight={option.iconRight}
            style={joined(index, options.length, active)}
            onClick={() => onSelect(option.value)}
          />
        )
      })}
    </Flex>
  )
}
