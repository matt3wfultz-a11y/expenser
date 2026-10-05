import type { CategoryOptions } from '../categoryOptions'

interface Props {
  options: CategoryOptions
  value: string | null
  onChange: (id: string | null) => void
  emptyLabel?: string
  className?: string
  'aria-label'?: string
  disabled?: boolean
}

export function CategorySelect({ options, value, onChange, emptyLabel = 'Uncategorized', ...rest }: Props) {
  const { groups, labels } = options
  // Keep showing a hidden category if something is still assigned to it.
  const visible = value === null || groups.some((g) => g.options.some((o) => o.id === value))
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} {...rest}>
      <option value="">{emptyLabel}</option>
      {!visible && value && <option value={value}>{labels.get(value) ?? value} (hidden)</option>}
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
