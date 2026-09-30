import { useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useCad } from '../store/cadStore';
import { formatNumber, parseLength, parsePlainNumber, round, toDisplay, UNIT_LABEL } from '../utils/units';

interface ToolButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  shortcut?: string;
  variant?: 'default' | 'primary';
  compact?: boolean;
}

export function ToolButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  title,
  shortcut,
  variant = 'default',
  compact,
}: ToolButtonProps) {
  const base =
    'flex items-center gap-1.5 rounded px-2 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-35';
  const style =
    variant === 'primary'
      ? 'bg-accent text-white hover:bg-blue-500'
      : active
        ? 'bg-accent/25 text-sky-200 ring-1 ring-accent/60'
        : 'text-text hover:bg-panel-3';
  return (
    <button
      type="button"
      className={`${base} ${style}`}
      onClick={onClick}
      disabled={disabled}
      title={[title ?? label, shortcut && `(${shortcut})`].filter(Boolean).join(' ')}
    >
      <Icon size={15} strokeWidth={1.8} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export function Divider() {
  return <div className="mx-1 h-5 w-px bg-line" />;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
        {right}
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

type FieldKind = 'length' | 'angle' | 'scale' | 'count' | 'volume' | 'plain';

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  kind?: FieldKind;
  min?: number;
  max?: number;
  labelColor?: string;
  /** Unit label for `plain` fields. */
  suffix?: string;
  step?: number;
  title?: string;
}

const LITRES_PER_FT3 = 28.3168;

/**
 * Numeric input that applies valid values immediately while typing.
 * Length fields accept an optional unit suffix ("2 in", "5cm"). Volume values are litres
 * (shown as ft³ when the display unit is inches).
 */
export function NumberField({
  label,
  value,
  onChange,
  kind = 'length',
  min,
  max,
  labelColor,
  suffix: plainSuffix = '',
  step,
  title,
}: NumberFieldProps) {
  const units = useCad((s) => s.units);
  const endCoalesce = useCad((s) => s.endCoalesce);
  const [text, setText] = useState<string | null>(null);
  const volFactor = units === 'in' ? LITRES_PER_FT3 : 1;

  const format = (v: number) =>
    kind === 'length'
      ? String(toDisplay(v, units))
      : kind === 'count'
        ? String(Math.round(v))
        : kind === 'volume'
          ? formatNumber(v / volFactor, units === 'in' ? 3 : 2)
          : formatNumber(v, kind === 'scale' ? 4 : kind === 'plain' ? 3 : 2);

  const parse = (t: string) => {
    const raw = kind === 'length' ? parseLength(t, units) : parsePlainNumber(t);
    if (raw === null) return null;
    const v = kind === 'volume' ? raw * volFactor : raw;
    const n = kind === 'count' ? Math.round(v) : v;
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) return null;
    return n;
  };

  const suffix =
    kind === 'length'
      ? UNIT_LABEL[units]
      : kind === 'angle'
        ? '°'
        : kind === 'scale'
          ? '×'
          : kind === 'volume'
            ? units === 'in'
              ? 'ft³'
              : 'L'
            : plainSuffix;
  const stepSize =
    step ??
    (kind === 'length'
      ? (units === 'mm' ? 1 : 0.1) * (units === 'in' ? 25.4 : units === 'cm' ? 10 : 1)
      : kind === 'scale'
        ? 0.1
        : kind === 'volume'
          ? volFactor * (units === 'in' ? 0.1 : 1)
          : 1);
  const invalid = text !== null && parse(text) === null;

  const apply = (t: string) => {
    setText(t);
    const v = parse(t);
    if (v !== null && v !== value) onChange(v);
  };

  return (
    <label className="flex items-center gap-2" title={title}>
      <span className="w-24 shrink-0 truncate text-[12px] text-muted" style={labelColor ? { color: labelColor } : undefined}>
        {label}
      </span>
      <div
        className={`flex min-w-0 flex-1 items-center rounded border bg-panel-2 focus-within:border-accent ${
          invalid ? 'border-red-500' : 'border-line'
        }`}
      >
        <input
          className="min-w-0 flex-1 bg-transparent px-2 py-1 font-mono text-[12px] outline-none"
          value={text ?? format(value)}
          onFocus={(e) => {
            setText(format(value));
            e.target.select();
          }}
          onChange={(e) => apply(e.target.value)}
          onBlur={() => {
            setText(null);
            endCoalesce();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const dir = e.key === 'ArrowUp' ? 1 : -1;
              const stepped = round(value + dir * stepSize * (e.shiftKey ? 10 : 1), 6);
              const next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, stepped));
              onChange(next);
              setText(format(next));
            }
          }}
        />
        <span className="pr-2 text-[11px] text-muted">{suffix}</span>
      </div>
    </label>
  );
}

export function TextField({
  value,
  onCommit,
  className = '',
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    if (!cancelled.current && text !== null && text.trim()) onCommit(text.trim());
    cancelled.current = false;
    setText(null);
  };
  return (
    <input
      className={`rounded border border-line bg-panel-2 px-2 py-1 text-[12px] outline-none focus:border-accent ${className}`}
      value={text ?? value}
      maxLength={100}
      onFocus={() => setText(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
