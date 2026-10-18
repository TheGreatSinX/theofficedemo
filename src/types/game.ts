/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Direction = 'down' | 'left' | 'right' | 'up';

export interface AvatarConfig {
  skinColor: string;
  hairStyle: 'short' | 'long' | 'curly' | 'spiky' | 'bald';
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  accessory?: 'glasses' | 'headset' | 'badge' | 'none';
}

export interface UserProfile {
  id: string;
  name: string;
  role: 'admin' | 'employee';
  title: string;
  status: 'online' | 'in_meeting' | 'busy' | 'coffee_break';
  avatarConfig: AvatarConfig;
  currentMapId: string;
  x: number; // tile or world coordinates
  y: number;
  direction: Direction;
  isMoving: boolean;
  isBot?: boolean;
}

export type ZoneType = 'meeting_room' | 'coffee' | 'watercooler' | 'whiteboard' | 'desk' | 'door_warp' | 'phone_booth';

export interface InteractionZone {
  id: string;
  name: string;
  type: ZoneType;
  tileX: number;
  tileY: number;
  width: number; // in tiles
  height: number;
  prompt: string;
  description?: string;
  meetUrl?: string;
  warpTarget?: {
    mapId: string;
    spawnTileX: number;
    spawnTileY: number;
  };
}

export interface MapObject {
  id: string;
  type: string;
  tileX: number;
  tileY: number;
  width: number;
  height: number;
  isSolid: boolean;
  interactionZoneId?: string;
}

export interface OfficeMapData {
  id: string;
  name: string;
  version: number;
  width: number; // in tiles
  height: number;
  tileSize: number;
  floorTiles: number[][]; // 2D array of tile IDs
  wallTiles: number[][];  // 2D array: 0 for none, or wall type ID
  solidMask: boolean[][]; // 2D boolean array: true if blocked
  objects: MapObject[];
  interactionZones: InteractionZone[];
  spawnPoint: {
    tileX: number;
    tileY: number;
    direction: Direction;
  };
}

export interface SpeechBubble {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  durationMs: number;
}

export type EditorTool =
  | 'brush_floor'
  | 'brush_wall'
  | 'erase_tile'
  | 'place_object'
  | 'delete_object'
  | 'toggle_collision';

export interface EditorSettings {
  activeTool: EditorTool;
  selectedFloorTile: number;
  selectedWallTile: number;
  selectedObjectType: string;
  showCollisionOverlay: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  channel: 'broadcast' | 'room' | 'direct' | 'local';
  recipientId?: string;
  text: string;
  timestamp: string;
  role?: 'admin' | 'employee';
}

export interface MeetingRoomConfig {
  id: string;
  name: string;
  meetUrl: string;
  activeCount: number;
  isLocked?: boolean;
}
