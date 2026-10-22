import {Box, Button, Card, Dialog, Flex, Grid, Radio, Stack, Text, TextArea} from '@sanity/ui'
import {Autocomplete} from '@sanity/ui/autocomplete'
import {type ReactNode, type SyntheticEvent, useId, useState} from 'react'
import {styled} from 'styled-components'

import type {ToolKey} from '../lib/chat'
import {CONTEXT_TOKEN_KEY, KEY_PATTERN, type Kind, type SecretValues} from '../lib/secrets'

/**
 * A secret's value drawn as dots, so it does not show on a screen share. Still a
 * textarea, so a multiline key pastes whole, which a password input would not.
 */
const ValueArea = styled(TextArea)<{$masked: boolean}>`
  -webkit-text-security: ${(props) => (props.$masked ? 'disc' : 'none')};
`

/** Keeps a value out of the spell checkers that send what is typed to a server. */
const PRIVATE = {
  'spellCheck': false,
  'autoCorrect': 'off',
  'autoCapitalize': 'off',
  'data-gramm': 'false',
  'data-gramm_editor': 'false',
  'data-enable-grammarly': 'false',
  'data-lt-active': 'false',
}

// The two cards sit side by side, so each line of copy stays short.
const SECRET_COPY = {title: 'Secret', description: 'Hidden once saved.'}
const CONFIG_COPY = {title: 'Config', description: 'Readable after saving.'}

type Props = {
  /** Every key a tool in the chat app reads, so one can be picked rather than typed. */
  declared: ToolKey[]
  values: SecretValues
  onClose: () => void
  onSave: (key: string, value: string, kind: Kind) => void
}

/**
 * As `@s`'s "Add variable": any key a tool will read, including one for a tool
 * still being built. A key a tool already declares keeps the kind it declares.
 */
export function AddVariableDialog({declared, values, onClose, onSave}: Props) {
  const id = useId()
  const formId = `${id}-form`
  const [key, setKey] = useState('')
  const [chosen, setChosen] = useState<Kind>('secret')
  const [value, setValue] = useState('')

  const claimed = declared.find((option) => option.key === key)
  const locked = key === CONTEXT_TOKEN_KEY ? 'secret' : claimed?.kind
  const kind = locked ?? chosen
  const wellFormed = KEY_PATTERN.test(key)
  const replacing = Boolean(values[key])
  const unset = declared.filter((option) => !values[option.key])

  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (wellFormed && value.trim()) onSave(key, value, kind)
  }

  return (
    <Dialog
      id={id}
      width={1}
      header="Add variable"
      onClose={onClose}
      onClickOutside={onClose}
      footer={
        <Flex justify="flex-end" gap={2} padding={3}>
          <Button mode="bleed" text="Cancel" onClick={onClose} />
          <Button type="submit" form={formId} tone="primary" text={replacing ? 'Replace' : 'Save'} disabled={!value.trim() || !wellFormed} />
        </Flex>
      }
    >
      <Box as="form" id={formId} padding={4} onSubmit={submit}>
        <Stack gap={4}>
          <Field
            label="Key"
            hint={
              key && !wellFormed
                ? 'Upper snake case, like ACME_API_KEY'
                : replacing
                  ? `${key} is already set. Saving replaces it.`
                  : claimed
                    ? `${claimed.title} reads this one.`
                    : undefined
            }
          >
            <Autocomplete
              id={`${id}-key`}
              options={unset.map((option) => ({value: option.key, payload: option}))}
              value={key}
              placeholder="ACME_API_KEY"
              openButton
              autoFocus
              // A null query is the field handing display back to `value`, on blur
              // and on select. Only a string is someone typing.
              onQueryChange={(query) => {
                if (query !== null) setKey(query.toUpperCase())
              }}
              onChange={(next) => setKey(next ?? '')}
              renderOption={(option) => (
                <Card as="button" padding={3} radius={2}>
                  <Stack gap={2}>
                    <Text size={1} weight="medium">
                      <code>{option.value}</code>
                    </Text>
                    <Text size={1} muted>
                      {option.payload.title} reads this one
                    </Text>
                  </Stack>
                </Card>
              )}
            />
          </Field>
          <Field label="Value">
            <ValueArea
              {...PRIVATE}
              // Only once there is a value: the placeholder would turn to dots too.
              $masked={kind === 'secret' && value.length > 0}
              rows={3}
              value={value}
              autoComplete="off"
              placeholder={kind === 'secret' ? 'A read-only key' : 'https://api.example.com'}
              onChange={(event) => setValue(event.currentTarget.value)}
            />
          </Field>
          <Field label="Type">
            <Grid gridTemplateColumns={2} gap={2}>
              <KindOption copy={SECRET_COPY} checked={kind === 'secret'} disabled={locked === 'config'} onSelect={() => setChosen('secret')} />
              <KindOption copy={CONFIG_COPY} checked={kind === 'config'} disabled={locked === 'secret'} onSelect={() => setChosen('config')} />
            </Grid>
          </Field>
          <Text size={1} muted>
            Tools read keys by name, so a tool in the chat app that asks for {key && wellFormed ? key : 'this key'} gets this value
            on the next question. Use read-only keys.
          </Text>
        </Stack>
      </Box>
    </Dialog>
  )
}

function Field({label, hint, children}: {label: string; hint?: string; children: ReactNode}) {
  return (
    <Stack gap={3}>
      <Text size={1} muted>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text size={1} muted>
          {hint}
        </Text>
      ) : null}
    </Stack>
  )
}

function KindOption({
  copy,
  checked,
  disabled,
  onSelect,
}: {
  copy: {title: string; description: string}
  checked: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <Card as="label" border radius={2} padding={3} tone={checked ? 'primary' : 'default'} style={{cursor: disabled ? 'not-allowed' : 'pointer'}}>
      <Flex gap={3} align="flex-start">
        <Stack flex={1} gap={3}>
          <Text size={1} weight="medium" muted={disabled}>
            {copy.title}
          </Text>
          <Text size={1} muted>
            {copy.description}
          </Text>
        </Stack>
        <Radio name="kind" checked={checked} disabled={disabled} onChange={onSelect} />
      </Flex>
    </Card>
  )
}
