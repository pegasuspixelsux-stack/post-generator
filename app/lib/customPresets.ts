import { GraphicConfig } from './types';
import { nextId } from './color';

export interface CustomPreset {
  id: string;
  name: string;
  config: GraphicConfig;
}

const STORAGE_KEY = 'post-generator:custom-presets';

export function loadCustomPresets(): CustomPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(presets: CustomPreset[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function saveCustomPreset(name: string, config: GraphicConfig): CustomPreset[] {
  const existing = loadCustomPresets();
  const preset: CustomPreset = {
    id: nextId('custom-preset'),
    name,
    // Deep-clone so later edits to the live config don't mutate the saved snapshot.
    config: JSON.parse(JSON.stringify(config)),
  };
  const updated = [...existing, preset];
  persist(updated);
  return updated;
}

export function deleteCustomPreset(id: string): CustomPreset[] {
  const updated = loadCustomPresets().filter((p) => p.id !== id);
  persist(updated);
  return updated;
}
