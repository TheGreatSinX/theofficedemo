/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AvatarConfig, UserProfile } from '../types/game';
import { AssetMetadata } from '../types/assets';
import { generateAvatarSpritesheet } from '../game/pixelArtGenerator';
import { CHARACTER_PRESETS, getCharacterPreset } from '../game/characterPresets';
import {
  characterCountFor,
  isCharacterSheetAsset,
  resolveCustomCharacterSheet,
} from '../game/assets/customCharacterSheets';
import { assetRegistry } from '../services/AssetRegistry';
import { X, Check, Shirt, Upload } from 'lucide-react';
import { sounds } from '../game/soundEffects';

interface AvatarCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerProfile: UserProfile;
  onSaveProfile: (profile: UserProfile) => void;
}

const SKIN_COLORS = [
  { name: 'Peach', value: '#f8c291' },
  { name: 'Fair', value: '#fed7aa' },
  { name: 'Olive', value: '#e2b083' },
  { name: 'Warm Tan', value: '#c28859' },
  { name: 'Deep Bronze', value: '#8a5a36' },
];

const HAIR_STYLES: { id: AvatarConfig['hairStyle']; label: string }[] = [
  { id: 'short', label: 'Classic Short' },
  { id: 'long', label: 'Flowing Long' },
  { id: 'curly', label: 'Textured Curly' },
  { id: 'spiky', label: 'Modern Spiky' },
  { id: 'bald', label: 'Clean Shaved' },
];

const HAIR_COLORS = [
  { name: 'Espresso', value: '#18181b' },
  { name: 'Brunette', value: '#451a03' },
  { name: 'Auburn', value: '#b45309' },
  { name: 'Blonde', value: '#eab308' },
  { name: 'Silver', value: '#94a3b8' },
  { name: 'Cyan', value: '#06b6d4' },
];

const SHIRT_COLORS = [
  { name: 'Royal Blue', value: '#2563eb' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Crimson', value: '#dc2626' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Charcoal', value: '#1e293b' },
];

const PANTS_COLORS = [
  { name: 'Slate', value: '#1e293b' },
  { name: 'Denim', value: '#1d4ed8' },
  { name: 'Khaki', value: '#78716c' },
  { name: 'Black', value: '#090d16' },
];

const ACCESSORIES: { id: AvatarConfig['accessory']; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'glasses', label: 'Designer Glasses' },
  { id: 'headset', label: 'Office Headset' },
  { id: 'badge', label: 'Security Badge' },
];

/**
 * Draws the down-facing idle frame of an imported character sheet so the
 * roster tile matches what the player will actually walk around with.
 */
const UploadedSheetThumb: React.FC<{
  asset: AssetMetadata;
  characterIndex: number;
  className?: string;
}> = ({ asset, characterIndex, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sheet = resolveCustomCharacterSheet(asset, characterIndex);
    if (!sheet) return;

    assetRegistry.getImage(asset.id).then((image) => {
      if (cancelled || !image) return;
      // Frame 1 is the down-facing idle pose (middle column).
      const frame = sheet.frames[1];
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const scale = Math.min(canvas.width / frame.sw, canvas.height / frame.sh);
      const w = frame.sw * scale;
      const h = frame.sh * scale;
      ctx.drawImage(
        image,
        frame.sx,
        frame.sy,
        frame.sw,
        frame.sh,
        (canvas.width - w) / 2,
        (canvas.height - h) / 2,
        w,
        h
      );
    });

    return () => {
      cancelled = true;
    };
  }, [asset, characterIndex]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      className={className}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    />
  );
};

export const AvatarCustomizerModal: React.FC<AvatarCustomizerModalProps> = ({
  isOpen,
  onClose,
  playerProfile,
  onSaveProfile,
}) => {
  const [name, setName] = useState(playerProfile.name);
  const [title, setTitle] = useState(playerProfile.title);
  const [status, setStatus] = useState<UserProfile['status']>(playerProfile.status);
  const [config, setConfig] = useState<AvatarConfig>({ ...playerProfile.avatarConfig });
  const [uploads, setUploads] = useState<AssetMetadata[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const activePreset = getCharacterPreset(config.characterId);
  const activeUpload = config.customCharacterAssetId
    ? assetRegistry.get(config.customCharacterAssetId)
    : undefined;
  const uploadCharacterIndex = config.customCharacterIndex ?? 0;

  // Character sheets imported through the Studio asset library.
  const refreshUploads = useCallback(() => {
    setUploads(assetRegistry.list().filter(isCharacterSheetAsset));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // The registry may not have been touched yet in this session.
    void assetRegistry.initialize().then(refreshUploads);
    refreshUploads();
    return assetRegistry.subscribe(refreshUploads);
  }, [isOpen, refreshUploads]);

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      setName(playerProfile.name);
      setTitle(playerProfile.title);
      setStatus(playerProfile.status);
      setConfig({ ...playerProfile.avatarConfig });
    }
  }, [isOpen, playerProfile]);

  // Render live preview on canvas
  useEffect(() => {
    if (!previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const preset = getCharacterPreset(config.characterId);
    if (preset) {
      let cancelled = false;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const scale = Math.min(canvas.width / preset.frameWidth, canvas.height / preset.frameHeight);
        const w = preset.frameWidth * scale;
        const h = preset.frameHeight * scale;
        // Frame (row 0, col 1) is the down-facing idle pose.
        ctx.drawImage(
          image,
          preset.frameWidth,
          0,
          preset.frameWidth,
          preset.frameHeight,
          (canvas.width - w) / 2,
          (canvas.height - h) / 2,
          w,
          h
        );
      };
      image.src = preset.image;
      return () => {
        cancelled = true;
      };
    }

    // Imported character sheet from the asset library.
    const upload = config.customCharacterAssetId
      ? assetRegistry.get(config.customCharacterAssetId)
      : undefined;
    if (upload) {
      const sheet = resolveCustomCharacterSheet(upload, config.customCharacterIndex ?? 0);
      if (sheet) {
        let cancelled = false;
        assetRegistry.getImage(upload.id).then((image) => {
          if (cancelled || !image) return;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          const frame = sheet.frames[1];
          const scale = Math.min(canvas.width / frame.sw, canvas.height / frame.sh);
          const w = frame.sw * scale;
          const h = frame.sh * scale;
          ctx.drawImage(
            image,
            frame.sx,
            frame.sy,
            frame.sw,
            frame.sh,
            (canvas.width - w) / 2,
            (canvas.height - h) / 2,
            w,
            h
          );
        });
        return () => {
          cancelled = true;
        };
      }
    }

    ctx.imageSmoothingEnabled = false;
    // Generate spritesheet and grab idle down frame (frame 1, row 0: x=32, y=0, w=32, h=32)
    const sheetCanvas = generateAvatarSpritesheet(config);
    ctx.drawImage(sheetCanvas, 32, 0, 32, 32, 0, 0, 128, 128);
  }, [config]);

  if (!isOpen) return null;

  const selectCustomAvatar = () => {
    const next = { ...config };
    delete next.characterId;
    delete next.customCharacterAssetId;
    delete next.customCharacterIndex;
    setConfig(next);
  };

  const selectPreset = (presetId: string) => {
    const next = { ...config, characterId: presetId };
    delete next.customCharacterAssetId;
    delete next.customCharacterIndex;
    setConfig(next);
  };

  const selectUpload = (asset: AssetMetadata, characterIndex = 0) => {
    const next = { ...config, customCharacterAssetId: asset.id, customCharacterIndex: characterIndex };
    delete next.characterId;
    setConfig(next);
  };

  const handleSave = () => {
    sounds.playInteract();
    // Keep undefined values out of the Firestore payload.
    const avatarConfig: AvatarConfig = { ...config };
    if (!avatarConfig.characterId) delete avatarConfig.characterId;
    if (!avatarConfig.customCharacterAssetId) delete avatarConfig.customCharacterAssetId;
    if (avatarConfig.customCharacterAssetId === undefined) delete avatarConfig.customCharacterIndex;
    onSaveProfile({
      ...playerProfile,
      name: name.trim() || 'Colleague',
      title: title.trim() || 'Team Member',
      status,
      avatarConfig,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="rpg-window w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rpg-window-title p-4 flex items-center justify-between">
          <div>
            <h3 className="pixel-title text-[10px]">Avatar Studio & Profile</h3>
            <p className="text-xs text-rpg-dim">Customize your pixel-art character and team role</p>
          </div>
          <button
            onClick={onClose}
            className="rpg-btn rpg-btn-danger p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Split 2 Columns */}
        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Live Pixel Preview & Identity */}
          <div className="md:col-span-5 flex flex-col items-center gap-4 border-b md:border-b-0 md:border-r border-rpg-line pb-5 md:pb-0 md:pr-4">
            <div className="rpg-inset w-36 h-36 p-2 flex items-center justify-center relative">
              <canvas
                ref={previewCanvasRef}
                width={128}
                height={128}
                className="w-32 h-32"
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="absolute bottom-1 right-2 text-[9px] font-mono text-rpg-dim">
                {activePreset ? 'RPG preset' : '32x32 RPG'}
              </span>
            </div>

            <div className="w-full space-y-3">
              <div>
                <label className="text-[11px] font-medium text-rpg-text block mb-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rpg-input w-full px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-rpg-text block mb-1">Role / Job Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rpg-input w-full px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-rpg-text block mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UserProfile['status'])}
                  className="rpg-input w-full px-3 py-1.5 text-xs"
                >
                  <option value="online">Online & Available</option>
                  <option value="in_meeting">In Meeting</option>
                  <option value="busy">Focus / Do Not Disturb</option>
                  <option value="coffee_break">Coffee Break</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right Column: Customization Controls */}
          <div className="md:col-span-7 space-y-4">
            {/* Character Roster */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-rpg-text">Character Roster</span>
                <span className="text-[9px] text-rpg-dim">visible to everyone</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={selectCustomAvatar}
                  title="Build a custom avatar from colors"
                  className={`rpg-inset flex flex-col items-center gap-1 p-1.5 cursor-pointer transition-colors ${
                    !activePreset && !activeUpload ? 'rpg-inset-active' : ''
                  }`}
                >
                  <div className="character-thumb character-thumb-custom">
                    <Shirt className="w-5 h-5 text-rpg-dim" />
                  </div>
                  <span
                    className={`text-[9px] leading-tight text-center ${
                      !activePreset && !activeUpload ? 'text-rpg-text' : 'text-rpg-dim'
                    }`}
                  >
                    Custom
                  </span>
                </button>
                {CHARACTER_PRESETS.map((preset) => {
                  const selected = config.characterId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => selectPreset(preset.id)}
                      title={preset.tagline}
                      className={`rpg-inset flex flex-col items-center gap-1 p-1.5 cursor-pointer transition-colors ${
                        selected ? 'rpg-inset-active' : ''
                      }`}
                    >
                      <div
                        className="character-thumb"
                        style={{ backgroundImage: `url(${preset.image})` }}
                        aria-hidden="true"
                      />
                      <span
                        className={`text-[9px] leading-tight text-center ${
                          selected ? 'text-rpg-text' : 'text-rpg-dim'
                        }`}
                      >
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              {activePreset && (
                <p className="text-[9px] text-rpg-dim mt-1.5">
                  {activePreset.tagline}. Preset outfits override the color options below.
                </p>
              )}
            </div>

            {/* Uploaded character sheets (Studio asset library) */}
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-rpg-text">Uploaded Sheets</span>
                <span className="text-[9px] text-rpg-dim">RPG Maker 3×4</span>
              </div>
              {uploads.length === 0 ? (
                <div className="rpg-inset flex items-center gap-2 p-2.5">
                  <Upload className="w-4 h-4 text-rpg-dim shrink-0" />
                  <p className="text-[9px] text-rpg-dim leading-snug">
                    No character sheets yet. Import a 3×4 RPG Maker sheet in Studio → Assets, then pick
                    it here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {uploads.map((asset) => {
                    const selected = config.customCharacterAssetId === asset.id;
                    const count = characterCountFor(asset);
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => selectUpload(asset, selected ? uploadCharacterIndex : 0)}
                        title={`${asset.name} · ${asset.columns}×${asset.rows} frames`}
                        className={`rpg-inset flex flex-col items-center gap-1 p-1.5 cursor-pointer transition-colors ${
                          selected ? 'rpg-inset-active' : ''
                        }`}
                      >
                        <div className="character-thumb-upload">
                          <UploadedSheetThumb asset={asset} characterIndex={selected ? uploadCharacterIndex : 0} />
                        </div>
                        <span
                          className={`text-[9px] leading-tight text-center ${
                            selected ? 'text-rpg-text' : 'text-rpg-dim'
                          }`}
                        >
                          {asset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {activeUpload && characterCountFor(activeUpload) > 1 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {Array.from({ length: characterCountFor(activeUpload) }).map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectUpload(activeUpload, index)}
                      className={`rpg-btn px-2 py-0.5 text-[9px] cursor-pointer ${
                        uploadCharacterIndex === index ? 'rpg-btn-gold' : 'rpg-btn-plain'
                      }`}
                    >
                      #{index + 1}
                    </button>
                  ))}
                </div>
              )}
              {activeUpload && (
                <p className="text-[9px] text-rpg-dim mt-1.5">
                  Using “{activeUpload.name}”. Sheets play back with the same 3-frame walk cycle as the
                  built-in roster. Other players see it once the sheet is shared with the cloud.
                </p>
              )}
            </div>

            {/* Procedural colors (disabled while a preset or uploaded sheet is selected) */}
            <div className={activePreset || activeUpload ? 'space-y-4 opacity-40 pointer-events-none select-none' : 'space-y-4'}>
            {/* Skin Tone */}
            <div>
              <span className="text-[11px] font-semibold text-rpg-text block mb-1.5">Skin Tone</span>
              <div className="flex gap-2">
                {SKIN_COLORS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setConfig({ ...config, skinColor: s.value })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      config.skinColor === s.value ? 'border-rpg-gold scale-110 shadow-sm' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: s.value }}
                    title={s.name}
                  />
                ))}
              </div>
            </div>

            {/* Hair Style */}
            <div>
              <span className="text-[11px] font-semibold text-rpg-text block mb-1.5">Hairstyle</span>
              <div className="grid grid-cols-2 gap-1.5">
                {HAIR_STYLES.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setConfig({ ...config, hairStyle: h.id })}
                    className={`rpg-inset py-1.5 px-2.5 text-xs text-left transition-colors cursor-pointer ${
                      config.hairStyle === h.id
                        ? 'rpg-inset-active text-rpg-text font-medium'
                        : 'text-rpg-dim'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Hair Color */}
            <div>
              <span className="text-[11px] font-semibold text-rpg-text block mb-1.5">Hair Color</span>
              <div className="flex gap-2">
                {HAIR_COLORS.map((hc) => (
                  <button
                    key={hc.value}
                    onClick={() => setConfig({ ...config, hairColor: hc.value })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      config.hairColor === hc.value ? 'border-rpg-gold scale-110 shadow-sm' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hc.value }}
                    title={hc.name}
                  />
                ))}
              </div>
            </div>

            {/* Shirt Color */}
            <div>
              <span className="text-[11px] font-semibold text-rpg-text block mb-1.5">Shirt Color</span>
              <div className="flex gap-2">
                {SHIRT_COLORS.map((sc) => (
                  <button
                    key={sc.value}
                    onClick={() => setConfig({ ...config, shirtColor: sc.value })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      config.shirtColor === sc.value ? 'border-rpg-gold scale-110 shadow-sm' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: sc.value }}
                    title={sc.name}
                  />
                ))}
              </div>
            </div>

            {/* Pants Color */}
            <div>
              <span className="text-[11px] font-semibold text-rpg-text block mb-1.5">Pants Color</span>
              <div className="flex gap-2">
                {PANTS_COLORS.map((pc) => (
                  <button
                    key={pc.value}
                    onClick={() => setConfig({ ...config, pantsColor: pc.value })}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      config.pantsColor === pc.value ? 'border-rpg-gold scale-110 shadow-sm' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: pc.value }}
                    title={pc.name}
                  />
                ))}
              </div>
            </div>

            {/* Accessory */}
            <div>
              <span className="text-[11px] font-semibold text-rpg-text block mb-1.5">Accessory</span>
              <div className="grid grid-cols-2 gap-1.5">
                {ACCESSORIES.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => setConfig({ ...config, accessory: acc.id })}
                    className={`rpg-inset py-1.5 px-2.5 text-xs text-left transition-colors cursor-pointer ${
                      config.accessory === acc.id
                        ? 'rpg-inset-active text-rpg-text font-medium'
                        : 'text-rpg-dim'
                    }`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-rpg-line flex justify-between items-center">
          <p className="text-[11px] text-rpg-dim">
            {activePreset
              ? `${activePreset.name} · synced to other players`
              : activeUpload
                ? `${activeUpload.name} · uploaded sheet · shared with other players`
                : 'Custom sprites are generated procedurally on a 32x32 canvas'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rpg-btn rpg-btn-plain px-4 py-2 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rpg-btn rpg-btn-gold px-4 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              Save Avatar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
