/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserProfile } from '../types/game';
import { MOCK_COLLEAGUES, INITIAL_PLAYER } from '../game/mockUsers';
import { multiplayerClient, ConnectionState } from '../multiplayer/client';
import { PlayerNetState } from '../multiplayer/protocol';

export interface IPresenceService {
  getCurrentUser(): UserProfile;
  getOnlineUsers(): UserProfile[];
  updateCurrentUser(updates: Partial<UserProfile>): UserProfile;
  subscribe(callback: (users: UserProfile[]) => void): () => void;
  getConnectionState(): ConnectionState;
  subscribeConnectionState(callback: (state: ConnectionState) => void): () => void;
}

function createExtendedMockRoster(): UserProfile[] {
  const base = [...MOCK_COLLEAGUES];
  const additionalNames = [
    { name: 'Daniel Kim', title: 'Data Engineer', map: 'main_office', status: 'online' as const },
    { name: 'Chloe Vance', title: 'QA Lead', map: 'boardroom_wing', status: 'in_meeting' as const },
    { name: 'Siddharth Rao', title: 'Cloud Architect', map: 'main_office', status: 'busy' as const },
    { name: 'Hannah Schmidt', title: 'People Ops Manager', map: 'rooftop_garden', status: 'coffee_break' as const },
    { name: 'Mateo Morales', title: 'Mobile Dev', map: 'main_office', status: 'online' as const },
    { name: 'Yuki Tanaka', title: 'Product Strategist', map: 'boardroom_wing', status: 'in_meeting' as const },
    { name: 'Fatima Al-Sayed', title: 'Security Engineer', map: 'main_office', status: 'busy' as const },
    { name: 'Lucas Dubois', title: 'Backend Lead', map: 'main_office', status: 'online' as const },
  ];

  additionalNames.forEach((emp, i) => {
    base.push({
      id: `mock_ext_${i + 1}`,
      name: emp.name,
      role: 'employee',
      title: emp.title,
      status: emp.status,
      currentMapId: emp.map,
      x: 10 + (i % 6),
      y: 10 + Math.floor(i / 6),
      direction: 'down',
      isMoving: false,
      isBot: true,
      avatarConfig: {
        skinColor: '#f8c291',
        hairStyle: 'short',
        hairColor: '#334155',
        shirtColor: '#3b82f6',
        pantsColor: '#1e293b',
        accessory: 'badge',
      },
    });
  });

  return base;
}

export class RealtimePresenceService implements IPresenceService {
  private currentUser: UserProfile = { ...INITIAL_PLAYER };
  private liveRemoteUsers: Map<string, UserProfile> = new Map();
  private mockColleagues: UserProfile[] = createExtendedMockRoster();
  private subscribers: Array<(users: UserProfile[]) => void> = [];
  private stateSubscribers: Array<(state: ConnectionState) => void> = [];
  private connectionState: ConnectionState = 'idle';

  constructor() {
    this.setupMultiplayerSync();
  }

  private setupMultiplayerSync() {
    // 1. Connection state changes
    multiplayerClient.onStateChange((state) => {
      this.connectionState = state;
      this.stateSubscribers.forEach((cb) => cb(state));
      if (state === 'disconnected' || state === 'failed') {
        this.liveRemoteUsers.clear();
        this.notify();
      }
    });

    // 2. Room snapshot
    multiplayerClient.onRoomSnapshot((players: PlayerNetState[]) => {
      this.liveRemoteUsers.clear();
      players.forEach((p) => {
        if (p.userId !== this.currentUser.id) {
          this.liveRemoteUsers.set(p.userId, this.mapNetStateToProfile(p));
        }
      });
      this.notify();
    });

    // 3. Player joined
    multiplayerClient.onPlayerJoined((p: PlayerNetState) => {
      if (p.userId !== this.currentUser.id) {
        this.liveRemoteUsers.set(p.userId, this.mapNetStateToProfile(p));
        this.notify();
      }
    });

    // 4. Player left
    multiplayerClient.onPlayerLeft((userId: string) => {
      if (this.liveRemoteUsers.has(userId)) {
        this.liveRemoteUsers.delete(userId);
        this.notify();
      }
    });

    // 5. Position and state updates
    multiplayerClient.onPlayerStates((states) => {
      let changed = false;
      states.forEach((s) => {
        const existing = this.liveRemoteUsers.get(s.userId);
        if (existing) {
          existing.x = Math.floor(s.x / 32);
          existing.y = Math.floor(s.y / 32);
          existing.direction = s.direction;
          existing.isMoving = s.isMoving;
          changed = true;
        }
      });
      if (changed) {
        this.notify();
      }
    });
  }

  private mapNetStateToProfile(netState: PlayerNetState): UserProfile {
    return {
      id: netState.userId,
      name: netState.displayName,
      role: netState.role,
      title: netState.role === 'admin' ? 'Workspace Lead' : 'Team Member',
      status: 'online',
      currentMapId: netState.roomId,
      x: Math.floor(netState.x / 32),
      y: Math.floor(netState.y / 32),
      direction: netState.direction,
      isMoving: netState.isMoving,
      avatarConfig: netState.avatarConfig,
      isBot: false,
    };
  }

  getCurrentUser(): UserProfile {
    return { ...this.currentUser };
  }

  getOnlineUsers(): UserProfile[] {
    const liveList = Array.from(this.liveRemoteUsers.values());

    // Filter mock colleagues so they don't conflict with real connected players
    const filteredMocks = this.mockColleagues.filter((m) => {
      return (
        m.id !== this.currentUser.id &&
        !this.liveRemoteUsers.has(m.id)
      );
    });

    return [this.currentUser, ...liveList, ...filteredMocks];
  }

  updateCurrentUser(updates: Partial<UserProfile>): UserProfile {
    this.currentUser = { ...this.currentUser, ...updates };
    this.notify();
    return { ...this.currentUser };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  subscribe(callback: (users: UserProfile[]) => void): () => void {
    this.subscribers.push(callback);
    callback(this.getOnlineUsers());
    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback);
    };
  }

  subscribeConnectionState(callback: (state: ConnectionState) => void): () => void {
    this.stateSubscribers.push(callback);
    callback(this.connectionState);
    return () => {
      this.stateSubscribers = this.stateSubscribers.filter((cb) => cb !== callback);
    };
  }

  private notify() {
    const list = this.getOnlineUsers();
    this.subscribers.forEach((cb) => cb(list));
  }
}

export const presenceService = new RealtimePresenceService();
