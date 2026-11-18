import { useId } from 'react';
import type { ReactNode } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentedOption<NoInfer<T>>[];
  onChange(value: NoInfer<T>): void;
  disabled?: boolean;
  className?: string;
};

// A div, not a fieldset: WebKit before 16 cannot lay a fieldset out as a grid.
export function Segmented<T extends string>({label, value, options, onChange, disabled, className}: SegmentedProps<T>) {
  const name = useId();
  return <div className={className ? `segmented ${className}` : 'segmented'} role="radiogroup" aria-label={label}>
    {options.map(option => {
      const hintId = `${name}-${option.value}-hint`;
      return <label key={option.value} className="segment" title={option.icon ? option.label : undefined}>
        <input
          className="segment-input"
          type="radio"
          name={name}
          value={option.value}
          checked={option.value === value}
          disabled={disabled || option.disabled}
          aria-label={option.label}
          aria-describedby={option.hint ? hintId : undefined}
          onChange={() => onChange(option.value)}
        />
        <span className="segment-face">
          {option.icon}
          <span className="segment-label">{option.label}</span>
          {option.hint && <small id={hintId} className="segment-hint">{option.hint}</small>}
        </span>
      </label>;
    })}
  </div>;
}