/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Texture keys and defaults for character sheets.
 *
 * Kept free of asset imports so the key rules can be unit tested.
 */

/** Phaser texture key under which a character sheet image is preloaded. */
export function characterPresetTextureKey(id: string): string {
  return `char_preset_${id}`;
}

/**
 * Texture key for an avatar sheet in the world.
 *
 * The key contains the character id, so switching characters registers a new
 * texture instead of replacing the old one. Destroying a texture that a live
 * sprite still uses leaves the sprite with a dead frame and the WebGL
 * renderer throws ("reading 'resolution' of null"), which blanks the scene.
 */
export function avatarSheetTextureKey(baseKey: string, characterId: string): string {
  return `${baseKey}_${characterId}`;
}

/**
 * Character used when a player never picked one (or the stored sheet is gone).
 * Keeps everybody on a hand-drawn sprite instead of the generated placeholder.
 */
export const DEFAULT_CHARACTER_ID = 'office_worker';
