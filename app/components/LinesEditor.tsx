'use client';

import { LineShape } from '../lib/types';
import { nextId } from '../lib/color';
import { AddButton, ColorField, NumberField, RemoveButton } from './fields';

export function LinesEditor({
  lines,
  onChange,
}: {
  lines: LineShape[];
  onChange: (lines: LineShape[]) => void;
}) {
  const update = (id: string, patch: Partial<LineShape>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const add = () => {
    onChange([
      ...lines,
      {
        id: nextId('lineshape'),
        x: 100,
        y: 300 + lines.length * 60,
        length: 300,
        thickness: 2,
        angle: 0,
        color: '#ffffff',
        opacity: 1,
      },
    ]);
  };

  const remove = (id: string) => onChange(lines.filter((l) => l.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, idx) => (
        <div key={line.id} className="border border-zinc-800 rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Line {idx + 1}</span>
            <RemoveButton onClick={() => remove(line.id)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={line.x} onChange={(v) => update(line.id, { x: v })} />
            <NumberField label="Y" value={line.y} onChange={(v) => update(line.id, { y: v })} />
            <NumberField
              label="Length"
              value={line.length}
              onChange={(v) => update(line.id, { length: v })}
            />
            <NumberField
              label="Thickness (px)"
              value={line.thickness}
              onChange={(v) => update(line.id, { thickness: v })}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-zinc-400">Angle ({line.angle}°)</span>
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => update(line.id, { angle: 0 })}
                className={`text-xs rounded px-2 py-1 transition ${
                  line.angle === 0
                    ? 'bg-amber-500 text-black font-semibold'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                Horizontal
              </button>
              <button
                type="button"
                onClick={() => update(line.id, { angle: 90 })}
                className={`text-xs rounded px-2 py-1 transition ${
                  line.angle === 90
                    ? 'bg-amber-500 text-black font-semibold'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                Vertical
              </button>
              <input
                type="number"
                className="bg-zinc-900 border border-zinc-800 p-2 rounded w-full text-sm"
                value={line.angle}
                onChange={(e) => update(line.id, { angle: Number(e.target.value) })}
                placeholder="Custom degrees"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 items-end">
            <ColorField
              label="Color"
              value={line.color}
              onChange={(v) => update(line.id, { color: v })}
            />
            <label className="flex flex-col gap-1 text-sm text-zinc-400">
              Opacity ({line.opacity.toFixed(2)})
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={line.opacity}
                onChange={(e) => update(line.id, { opacity: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      ))}
      <AddButton label="Add line" onClick={add} />
    </div>
  );
}
