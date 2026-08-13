'use client';

import { OverlayConfig, OverlayDirection } from '../lib/types';
import { ColorField, SelectField } from './fields';

const DIRECTIONS: { value: OverlayDirection; label: string }[] = [
  { value: 'bottom', label: 'Bottom (strong at bottom)' },
  { value: 'top', label: 'Top (strong at top)' },
  { value: 'left', label: 'Left (strong at left)' },
  { value: 'right', label: 'Right (strong at right)' },
  { value: 'radial', label: 'Radial (strong at center)' },
];

function OpacitySlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-zinc-400">
      {label} ({value.toFixed(2)})
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function OverlayEditor({
  overlay,
  onChange,
}: {
  overlay: OverlayConfig;
  onChange: (overlay: OverlayConfig) => void;
}) {
  const isGradient = overlay.type === 'gradient';

  return (
    <div className="flex flex-col gap-3 border border-zinc-800 rounded p-3">
      <div className="flex gap-2">
        {(['solid', 'gradient'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange({ ...overlay, type })}
            className={`flex-1 text-sm rounded p-2 capitalize transition ${
              overlay.type === type
                ? 'bg-amber-500 text-black font-semibold'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label={isGradient ? 'Color (anchor)' : 'Color'}
          value={overlay.color}
          onChange={(v) => onChange({ ...overlay, color: v })}
        />
        <OpacitySlider
          label={isGradient ? 'Opacity (anchor)' : 'Opacity'}
          value={overlay.opacity}
          onChange={(v) => onChange({ ...overlay, opacity: v })}
        />
      </div>

      {isGradient && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ColorField
              label="Color (fade)"
              value={overlay.color2}
              onChange={(v) => onChange({ ...overlay, color2: v })}
            />
            <OpacitySlider
              label="Opacity (fade)"
              value={overlay.opacity2}
              onChange={(v) => onChange({ ...overlay, opacity2: v })}
            />
          </div>
          <SelectField
            label="Position"
            value={overlay.direction}
            options={DIRECTIONS}
            onChange={(v) => onChange({ ...overlay, direction: v as OverlayDirection })}
          />
        </>
      )}
    </div>
  );
}
