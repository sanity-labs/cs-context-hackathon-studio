import type {ComponentType, ReactNode} from 'react'
import {
  type ArrayInputFunctionsProps,
  type ArrayOfObjectsInputProps,
  type ArraySchemaType,
  insert,
  PatchEvent,
  setIfMissing,
  unset,
} from 'sanity'

/** As `@s` has it: an array of picks, added and removed by a picker rather than edited. */
export type PickFunctionsProps = ArrayInputFunctionsProps<{_key: string}, ArraySchemaType>

/** The picker adds and removes; duplicating a pick means nothing. */
export const PICKER_ONLY = ['add', 'addBefore', 'addAfter', 'duplicate', 'copy'] as const

/** The native array input, with `picker` in place of its "Add item" button. */
export function withPicker(picker: ComponentType<PickFunctionsProps>): (props: ArrayOfObjectsInputProps) => ReactNode {
  return function PickerInput(props) {
    return props.renderDefault({...props, arrayFunctions: picker})
  }
}

type Pick = {_key: string; id: string}

type Shape = {_type: string; field: string}

export function pickerProps(
  props: PickFunctionsProps,
  shape: Shape,
  extra?: (id: string) => Record<string, string>,
): {selected: string[]; readOnly?: boolean; onToggle: (id: string, checked: boolean) => void} {
  return {
    selected: pickedIds(props.value, shape.field).map((pick) => pick.id),
    readOnly: props.readOnly,
    onToggle: (id, checked) => togglePick(props, shape, id, checked, extra?.(id)),
  }
}

function pickedIds(items: Array<{_key: string}> | undefined, field: string): Pick[] {
  return (items ?? []).flatMap((item) => {
    const value: unknown = Reflect.get(item, field)
    return typeof value === 'string' ? [{_key: item._key, id: value}] : []
  })
}

function togglePick(props: PickFunctionsProps, shape: Shape, id: string, checked: boolean, extra?: Record<string, string>): void {
  // A plain insert, not `onItemAppend`: that one also opens the new item for
  // editing, which is right for an empty block and wrong for a finished pick.
  if (checked) {
    const item = {...extra, _type: shape._type, _key: randomKey(), [shape.field]: id}
    props.onChange(PatchEvent.from([setIfMissing([]), insert([item], 'after', [-1])]))
    return
  }
  const keys = pickedIds(props.value, shape.field)
    .filter((pick) => pick.id === id)
    .map((pick) => ({_key: pick._key}))
  props.onChange(PatchEvent.from(unset(keys)))
}

/** The 12-character `_key` shape the Studio mints for array items. */
function randomKey(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12)
}
