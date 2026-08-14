// app/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { FontFamily, GraphicConfig } from './lib/types';
import { nextId } from './lib/color';
import { presets } from './lib/presets';
import { buildGenerateRequestBody, buildVideoRequestBody, OutputFormat, VideoSettings } from './lib/buildRequest';
import { NumberField, ColorField, SelectField, AlignRow, AnimationFieldsRow } from './components/fields';
import { alignedX } from './lib/align';
import { ImageUrlField } from './components/ImageUrlField';
import { OverlayEditor } from './components/OverlayEditor';
import { RichLinesEditor } from './components/RichLinesEditor';
import { SecondaryImagesEditor } from './components/SecondaryImagesEditor';
import { LinesEditor } from './components/LinesEditor';
import { PresetSelector } from './components/PresetSelector';
import { CustomPresetsPanel } from './components/CustomPresetsPanel';
import { CustomPreset, deleteCustomPreset, loadCustomPresets, saveCustomPreset } from './lib/customPresets';
import { BulkCreatePanel, TargetField } from './components/BulkCreatePanel';
import { LivePreviewCanvas } from './components/LivePreviewCanvas';
import { apiUrl, resolveAssetUrl } from './lib/api';

interface Asset {
  filename: string;
  url: string;
  created_at: string;
}

export default function PostGenerator() {
  const [config, setConfig] = useState<GraphicConfig>(() => presets[0].build());
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generatedFormat, setGeneratedFormat] = useState<OutputFormat>('jpeg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentAssets, setRecentAssets] = useState<Asset[]>([]);
  const [fonts, setFonts] = useState<FontFamily[]>([]);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg');
  const [bulkZipUrl, setBulkZipUrl] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [logoPadding, setLogoPadding] = useState(80);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({ fps: 30, duration: 3, fadeIn: 0, fadeOut: 0 });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Once a real render exists, any further edit falls back to the live
  // preview canvas so the change is visible immediately instead of showing
  // a now-stale generated image.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setImageUrl(null);
    setVideoUrl(null);
  }, [config]);

  const refreshAssets = async () => {
    try {
      const res = await fetch(apiUrl('/assets'));
      if (!res.ok) return;
      const data = await res.json();
      setRecentAssets(data.assets ?? []);
    } catch {
      // backend may not be running yet — non-fatal
    }
  };

  const refreshFonts = async () => {
    try {
      const res = await fetch(apiUrl('/fonts'));
      if (!res.ok) return;
      const data = await res.json();
      setFonts(data.fonts ?? []);
    } catch {
      // backend may not be running yet — non-fatal
    }
  };

  useEffect(() => {
    // Fire-and-forget fetches on mount; each sets state asynchronously via
    // its own await, not synchronously within this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAssets();
    void refreshFonts();
    setCustomPresets(loadCustomPresets());
  }, []);

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) setConfig(preset.build());
  };

  const applyCustomPreset = (preset: CustomPreset) => {
    // Deep-clone on load too, so editing the form never mutates the saved snapshot.
    setConfig(JSON.parse(JSON.stringify(preset.config)));
  };

  const handleSaveCustomPreset = (name: string) => {
    setCustomPresets(saveCustomPreset(name, config));
  };

  const handleDeleteCustomPreset = (id: string) => {
    setCustomPresets(deleteCustomPreset(id));
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(apiUrl('/generate-graphic'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildGenerateRequestBody(config, outputFormat, true)),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to generate');
      }
      const blob = await response.blob();
      setVideoUrl(null);
      setImageUrl(URL.createObjectURL(blob));
      setGeneratedFormat(outputFormat);
      refreshAssets();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to generate graphic');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVideo = async () => {
    setVideoLoading(true);
    setVideoError(null);
    try {
      const response = await fetch(apiUrl('/generate-video'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildVideoRequestBody(config, videoSettings, true)),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Failed to generate video');
      }
      const blob = await response.blob();
      setImageUrl(null);
      setVideoUrl(URL.createObjectURL(blob));
      refreshAssets();
    } catch (err) {
      console.error(err);
      setVideoError(err instanceof Error ? err.message : 'Failed to generate video');
    } finally {
      setVideoLoading(false);
    }
  };

  const handleBulkGenerate = async (
    images: string[],
    itemTexts: string[][],
    targetFields: TargetField[],
  ) => {
    setBulkLoading(true);
    setBulkError(null);
    setBulkZipUrl(null);
    try {
      const count = Math.max(images.length, itemTexts.length);
      const items = Array.from({ length: count }, (_, i) => ({
        background_image_url: images[i] || null,
        texts: itemTexts[i] ?? [],
      }));
      const response = await fetch(apiUrl('/generate-graphic/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base: buildGenerateRequestBody(config, outputFormat, true),
          items,
          target_fields: targetFields,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || 'Bulk generation failed');
      }
      const blob = await response.blob();
      setBulkZipUrl(URL.createObjectURL(blob));
      refreshAssets();
    } catch (err) {
      console.error(err);
      setBulkError(err instanceof Error ? err.message : 'Bulk generation failed');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <main className="flex flex-col lg:flex-row min-h-screen bg-zinc-950 text-white p-4 sm:p-8 gap-4 sm:gap-8">
      <div className="w-full lg:w-1/2 flex flex-col gap-4 lg:overflow-y-auto lg:max-h-screen px-2 sm:px-4 py-2">
        <h1 className="text-2xl font-bold">Post Generator Config</h1>

        <div>
          <h2 className="text-lg font-semibold mb-2">Presets</h2>
          <PresetSelector onApply={applyPreset} />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Custom Presets</h2>
          <CustomPresetsPanel
            presets={customPresets}
            onApply={applyCustomPreset}
            onSave={handleSaveCustomPreset}
            onDelete={handleDeleteCustomPreset}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <ImageUrlField
              label="Background Image URL"
              value={config.backgroundImageUrl}
              onChange={(v) => setConfig({ ...config, backgroundImageUrl: v })}
            />
          </div>
          <ColorField
            label="Background Color (fallback)"
            value={config.backgroundColor}
            onChange={(v) => setConfig({ ...config, backgroundColor: v })}
          />
          <NumberField
            label="Canvas Width"
            value={config.canvasWidth}
            onChange={(v) => setConfig({ ...config, canvasWidth: v })}
          />
          <NumberField
            label="Canvas Height"
            value={config.canvasHeight}
            onChange={(v) => setConfig({ ...config, canvasHeight: v })}
          />
        </div>

        <h2 className="text-lg font-semibold mt-4">Overlay</h2>
        <OverlayEditor overlay={config.overlay} onChange={(overlay) => setConfig({ ...config, overlay })} />

        <h2 className="text-lg font-semibold mt-4">Logo Config</h2>
        <div className="flex flex-col gap-2">
          <ImageUrlField
            value={config.logo.url}
            placeholder="Logo URL"
            onChange={(v) => setConfig({ ...config, logo: { ...config.logo, url: v } })}
          />
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Width"
              value={config.logo.width}
              onChange={(v) => setConfig({ ...config, logo: { ...config.logo, width: v } })}
            />
            <NumberField
              label="X"
              value={config.logo.x}
              onChange={(v) => setConfig({ ...config, logo: { ...config.logo, x: v } })}
            />
            <NumberField
              label="Y"
              value={config.logo.y}
              onChange={(v) => setConfig({ ...config, logo: { ...config.logo, y: v } })}
            />
          </div>
          <AlignRow
            padding={logoPadding}
            onPaddingChange={setLogoPadding}
            onAlign={(align) => {
              const x = alignedX(align, config.canvasWidth, config.logo.width, logoPadding);
              setConfig({ ...config, logo: { ...config.logo, x } });
            }}
          />
          <AnimationFieldsRow
            animation={config.logo.animation}
            duration={config.logo.animation_duration}
            delay={config.logo.animation_delay}
            onChange={(patch) => setConfig({ ...config, logo: { ...config.logo, ...patch } })}
          />
        </div>

        <h2 className="text-lg font-semibold mt-4">Secondary Images</h2>
        <SecondaryImagesEditor
          images={config.secondaryImages}
          onChange={(secondaryImages) => setConfig({ ...config, secondaryImages })}
        />

        <h2 className="text-lg font-semibold mt-4">Lines (optional)</h2>
        <LinesEditor lines={config.lines} onChange={(lines) => setConfig({ ...config, lines })} />

        <h2 className="text-lg font-semibold mt-4">Word Art (optional)</h2>
        <div className="flex flex-col gap-2">
          <ImageUrlField
            value={config.wordart.url}
            placeholder="Word art image URL — leave empty to disable"
            onChange={(v) => setConfig({ ...config, wordart: { ...config.wordart, url: v } })}
          />
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Width"
              value={config.wordart.width}
              onChange={(v) => setConfig({ ...config, wordart: { ...config.wordart, width: v } })}
            />
            <NumberField
              label="X"
              value={config.wordart.x}
              onChange={(v) => setConfig({ ...config, wordart: { ...config.wordart, x: v } })}
            />
            <NumberField
              label="Y"
              value={config.wordart.y}
              onChange={(v) => setConfig({ ...config, wordart: { ...config.wordart, y: v } })}
            />
          </div>
          <AnimationFieldsRow
            animation={config.wordart.animation}
            duration={config.wordart.animation_duration}
            delay={config.wordart.animation_delay}
            onChange={(patch) => setConfig({ ...config, wordart: { ...config.wordart, ...patch } })}
          />
        </div>

        <h2 className="text-lg font-semibold mt-4">Rich Text Lines</h2>
        <RichLinesEditor
          lines={config.richLines}
          onChange={(richLines) => setConfig({ ...config, richLines })}
          fonts={fonts}
          canvasWidth={config.canvasWidth}
        />

        <div className="mt-4">
          <SelectField
            label="File Type"
            value={outputFormat}
            options={[
              { value: 'jpeg', label: 'JPEG' },
              { value: 'png', label: 'PNG (supports transparency)' },
              { value: 'webp', label: 'WebP' },
            ]}
            onChange={(v) => setOutputFormat(v as OutputFormat)}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold p-3 rounded transition"
        >
          {loading ? 'Generating...' : 'Generate Graphic'}
        </button>

        {error && (
          <p className="text-red-400 text-sm border border-red-900 bg-red-950/40 rounded p-2">{error}</p>
        )}

        <h2 className="text-lg font-semibold mt-4">Video Export (MP4)</h2>
        <p className="text-xs text-zinc-500">
          Animates the logo, word art, and each rich text line per their own settings above, then holds. Elements
          set to &quot;None&quot; stay static the whole clip.
        </p>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Duration (s)"
              value={videoSettings.duration}
              onChange={(v) => setVideoSettings({ ...videoSettings, duration: v })}
            />
            <NumberField
              label="FPS"
              value={videoSettings.fps}
              onChange={(v) => setVideoSettings({ ...videoSettings, fps: v })}
            />
            <NumberField
              label="Fade in (s)"
              value={videoSettings.fadeIn}
              onChange={(v) => setVideoSettings({ ...videoSettings, fadeIn: v })}
            />
            <NumberField
              label="Fade out (s)"
              value={videoSettings.fadeOut}
              onChange={(v) => setVideoSettings({ ...videoSettings, fadeOut: v })}
            />
          </div>
          <button
            onClick={handleGenerateVideo}
            disabled={videoLoading}
            className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-black font-bold p-3 rounded transition"
          >
            {videoLoading ? 'Rendering video...' : 'Export Video (MP4)'}
          </button>
          {videoError && (
            <p className="text-red-400 text-sm border border-red-900 bg-red-950/40 rounded p-2">{videoError}</p>
          )}
        </div>

        <h2 className="text-lg font-semibold mt-4">Bulk Create</h2>
        <BulkCreatePanel
          richLines={config.richLines}
          loading={bulkLoading}
          error={bulkError}
          zipUrl={bulkZipUrl}
          onGenerate={handleBulkGenerate}
        />

        {recentAssets.filter((a) => !a.filename.endsWith('.mp4')).length > 0 && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-2">Recent Generations</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {recentAssets
                .filter((a) => !a.filename.endsWith('.mp4'))
                .map((asset) => (
                <a key={asset.filename} href={resolveAssetUrl(asset.url)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from a local FastAPI backend or Vercel Blob, not next/image's remote loader */}
                  <img
                    src={resolveAssetUrl(asset.url)}
                    alt={asset.filename}
                    className="w-full aspect-[9/16] object-cover rounded border border-zinc-800 hover:border-amber-500 transition"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center gap-4 bg-zinc-900 border border-zinc-800 rounded p-4">
        {videoUrl ? (
          <>
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              className="max-h-[70vh] lg:max-h-[750px] w-full object-contain shadow-lg"
            />
            <a
              href={videoUrl}
              download={`post-${nextId('download')}.mp4`}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded transition"
            >
              Download MP4
            </a>
          </>
        ) : imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL from a Blob, not a next/image-compatible source */}
            <img
              src={imageUrl}
              alt="Generated Preview"
              className="max-h-[70vh] lg:max-h-[750px] w-full object-contain shadow-lg"
            />
            <a
              href={imageUrl}
              download={`post-${nextId('download')}.${generatedFormat === 'jpeg' ? 'jpg' : generatedFormat}`}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded transition"
            >
              Download {generatedFormat.toUpperCase()}
            </a>
          </>
        ) : (
          <>
            <LivePreviewCanvas config={config} />
            <span className="text-xs text-zinc-500">
              Live preview (approximate) — click Generate for the final render
            </span>
          </>
        )}
      </div>
    </main>
  );
}
