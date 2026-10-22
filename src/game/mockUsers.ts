/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile } from '../types/game';

export const INITIAL_PLAYER: UserProfile = {
  id: 'current_user',
  name: 'Alex Rivera',
  role: 'admin',
  title: 'Full-Stack Lead',
  status: 'online',
  currentMapId: 'main_office',
  x: 8,
  y: 11,
  direction: 'down',
  isMoving: false,
  avatarConfig: {
    skinColor: '#f8c291',
    hairStyle: 'short',
    hairColor: '#3d2714',
    shirtColor: '#2563eb', // Royal blue
    pantsColor: '#1e293b',
    accessory: 'badge',
  },
};

export const MOCK_COLLEAGUES: UserProfile[] = [
  {
    id: 'user_sarah',
    name: 'Sarah Chen',
    role: 'employee',
    title: 'Staff Product Designer',
    status: 'busy',
    currentMapId: 'main_office',
    x: 4,
    y: 6,
    direction: 'down',
    isMoving: false,
    isBot: true,
    avatarConfig: {
      skinColor: '#fed7aa',
      hairStyle: 'long',
      hairColor: '#18181b',
      shirtColor: '#db2777', // Magenta
      pantsColor: '#334155',
      accessory: 'glasses',
      characterId: 'npc_curly',
    },
  },
  {
    id: 'user_marcus',
    name: 'Marcus Brody',
    role: 'admin',
    title: 'VP of Engineering',
    status: 'in_meeting',
    currentMapId: 'boardroom_wing',
    x: 8,
    y: 4,
    direction: 'down',
    isMoving: false,
    isBot: true,
    avatarConfig: {
      skinColor: '#c28859',
      hairStyle: 'short',
      hairColor: '#475569',
      shirtColor: '#0f172a', // Navy suit
      pantsColor: '#1e293b',
      accessory: 'glasses',
      characterId: 'npc_silver',
    },
  },
  {
    id: 'user_elena',
    name: 'Elena Rostova',
    role: 'employee',
    title: 'Principal DevOps Architect',
    status: 'online',
    currentMapId: 'main_office',
    x: 18,
    y: 13,
    direction: 'up',
    isMoving: false,
    isBot: true,
    avatarConfig: {
      skinColor: '#ffedd5',
      hairStyle: 'curly',
      hairColor: '#b45309', // Auburn
      shirtColor: '#059669', // Emerald
      pantsColor: '#0f172a',
      accessory: 'headset',
      characterId: 'npc_teal',
    },
  },
  {
    id: 'user_liam',
    name: 'Liam Patel',
    role: 'employee',
    title: 'Senior Frontend Engineer',
    status: 'coffee_break',
    currentMapId: 'main_office',
    x: 20,
    y: 3,
    direction: 'left',
    isMoving: false,
    isBot: true,
    avatarConfig: {
      skinColor: '#b37748',
      hairStyle: 'spiky',
      hairColor: '#1e1b4b',
      shirtColor: '#f59e0b', // Amber
      pantsColor: '#1e293b',
      accessory: 'none',
      characterId: 'npc_beanie',
    },
  },
  {
    id: 'user_maya',
    name: 'Maya Lin',
    role: 'employee',
    title: 'Product Marketing Manager',
    status: 'online',
    currentMapId: 'rooftop_garden',
    x: 7,
    y: 6,
    direction: 'right',
    isMoving: false,
    isBot: true,
    avatarConfig: {
      skinColor: '#fcd34d',
      hairStyle: 'long',
      hairColor: '#451a03',
      shirtColor: '#7c3aed', // Purple
      pantsColor: '#334155',
      accessory: 'glasses',
      characterId: 'npc_poppy',
    },
  },
];
