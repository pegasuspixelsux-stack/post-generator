'use client';

import { presets } from '../lib/presets';

export function PresetSelector({ onApply }: { onApply: (presetId: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {presets.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onApply(preset.id)}
          className="text-left border border-zinc-800 hover:border-amber-500 rounded p-3 transition bg-zinc-900"
        >
          <div className="font-semibold text-sm">{preset.name}</div>
          <div className="text-xs text-zinc-500 mt-1">{preset.description}</div>
        </button>
      ))}
    </div>
  );
}
