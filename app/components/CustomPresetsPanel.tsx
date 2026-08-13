'use client';

import { useState } from 'react';
import { CustomPreset } from '../lib/customPresets';

export function CustomPresetsPanel({
  presets,
  onApply,
  onSave,
  onDelete,
}: {
  presets: CustomPreset[];
  onApply: (preset: CustomPreset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="bg-zinc-900 border border-zinc-800 p-2 rounded w-full text-sm"
          placeholder="Preset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!name.trim()}
          className="shrink-0 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-3 rounded transition"
        >
          Save current as preset
        </button>
      </div>

      {presets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="border border-zinc-800 hover:border-amber-500 rounded p-3 bg-zinc-900 flex flex-col gap-2 transition"
            >
              <button type="button" onClick={() => onApply(preset)} className="text-left">
                <div className="font-semibold text-sm">{preset.name}</div>
                <div className="text-xs text-zinc-500 mt-1">Your saved preset — click to load, fully editable</div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(preset.id)}
                className="text-xs text-red-400 hover:text-red-300 self-start transition"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
