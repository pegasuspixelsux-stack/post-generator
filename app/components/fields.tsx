'use client';

const inputClass = 'bg-zinc-900 border border-zinc-800 p-2 rounded w-full text-sm';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const input = (
    <input
      className={inputClass}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-400">
      {label}
      {input}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const input = (
    <input
      className={inputClass}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-400">
      {label}
      {input}
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const input = (
    <input
      className="bg-zinc-900 border border-zinc-800 rounded h-9 w-full cursor-pointer"
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!label) return input;
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-400">
      {label}
      {input}
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const select = (
    <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-400">
      {label}
      {select}
    </label>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function RemoveButton({ onClick, label = 'Remove' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-red-400 hover:text-red-300 transition self-start"
    >
      {label}
    </button>
  );
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm border border-dashed border-zinc-700 hover:border-amber-500 hover:text-amber-500 text-zinc-400 rounded p-2 transition"
    >
      + {label}
    </button>
  );
}
