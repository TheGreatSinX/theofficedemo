/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Asset file validation (pure, testable) and image analysis helpers.
 */

import {
  AssetValidationLimits,
  AssetValidationResult,
  DEFAULT_ASSET_LIMITS,
} from '../../types/assets';

export interface AssetFileInfo {
  name: string;
  size: number;
  type: string;
}

export function validateAssetFile(
  file: AssetFileInfo,
  limits: AssetValidationLimits = DEFAULT_ASSET_LIMITS
): AssetValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!file || typeof file.name !== 'string' || file.name.trim() === '') {
    return { ok: false, errors: ['File is missing a name.'], warnings };
  }

  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const mimeOk = limits.allowedMimeTypes.includes(file.type);
  const extOk = allowedExtensions.includes(ext);

  if (!mimeOk && !extOk) {
    errors.push(
      `Unsupported file type "${file.type || ext}". Allowed: ${limits.allowedMimeTypes.join(', ')}.`
    );
  }

  if (file.size <= 0) {
    errors.push('File is empty.');
  } else if (file.size > limits.maxFileBytes) {
    errors.push(
      `File is too large (${(file.size / 1024 / 1024).toFixed(2)} MB). Maximum is ${(
        limits.maxFileBytes /
        1024 /
        1024
      ).toFixed(0)} MB.`
    );
  } else if (file.size > limits.maxFileBytes * 0.75) {
    warnings.push('File is close to the size limit and may be slow to upload on weak connections.');
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    warnings.push('JPEG images have no transparency; use PNG for tiles and sprites.');
  }
  if (ext === '.gif') {
    warnings.push('Animated GIFs are imported using their first frame.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateImageDimensions(
  width: number,
  height: number,
  limits: AssetValidationLimits = DEFAULT_ASSET_LIMITS
): AssetValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, errors: ['Could not read image dimensions.'], warnings };
  }
  if (width < limits.minDimension || height < limits.minDimension) {
    errors.push(`Image is too small (${width}×${height}px). Minimum is ${limits.minDimension}px per side.`);
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    errors.push(
      `Image is too large (${width}×${height}px). Maximum is ${limits.maxDimension}px per side.`
    );
  }
  if (width * height > 16_000_000) {
    errors.push('Image exceeds 16 megapixels and cannot be processed safely in the browser.');
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Browser-only image helpers
// ---------------------------------------------------------------------------

export function loadImageElement(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image file.'));
    img.src = url;
  });
}

export function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return loadImageElement(blob).then((img) => ({ width: img.naturalWidth, height: img.naturalHeight }));
}

/** Samples the image and reports whether any pixel has alpha < 255. */
export function analyzeTransparency(
  img: HTMLImageElement,
  sampleStep = 4
): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4 * sampleStep) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Creates a small thumbnail data-url (kept under a few KB for Firestore). */
export function createThumbnail(img: HTMLImageElement, maxSize = 96): string {
  const ratio = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

/** Extracts a single frame into a data-url (used for previews and export). */
export function extractFrameDataUrl(
  img: HTMLImageElement,
  frameIndex: number,
  columns: number,
  frameWidth: number,
  frameHeight: number
): string {
  const col = frameIndex % columns;
  const row = Math.floor(frameIndex / columns);
  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    col * frameWidth,
    row * frameHeight,
    frameWidth,
    frameHeight,
    0,
    0,
    frameWidth,
    frameHeight
  );
  return canvas.toDataURL('image/png');
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(blob);
  });
}
