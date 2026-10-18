/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MeetingRoomConfig } from '../types/game';

export interface IMeetingService {
  getRooms(): MeetingRoomConfig[];
  getRoom(roomId: string): MeetingRoomConfig | undefined;
  updateRoomUrl(roomId: string, newUrl: string): void;
  generateMeetingUrl(): Promise<string>;
}

export class MockMeetingService implements IMeetingService {
  private rooms: MeetingRoomConfig[] = [
    {
      id: 'boardroom_alpha',
      name: 'Executive Boardroom Alpha',
      meetUrl: 'https://meet.google.com/new',
      activeCount: 3,
      isLocked: false,
    },
    {
      id: 'rooftop_casual',
      name: 'Rooftop Garden 1-on-1 Table',
      meetUrl: 'https://meet.google.com/new',
      activeCount: 1,
      isLocked: false,
    },
    {
      id: 'focus_booth_1',
      name: 'Acoustic Phone Booth #1',
      meetUrl: 'https://meet.google.com/new',
      activeCount: 1,
      isLocked: true,
    },
  ];

  getRooms(): MeetingRoomConfig[] {
    return [...this.rooms];
  }

  getRoom(roomId: string): MeetingRoomConfig | undefined {
    return this.rooms.find((r) => r.id === roomId);
  }

  updateRoomUrl(roomId: string, newUrl: string): void {
    const room = this.rooms.find((r) => r.id === roomId);
    if (room) {
      room.meetUrl = newUrl;
    }
  }

  async generateMeetingUrl(): Promise<string> {
    // In Milestone 5, this will call the authenticated Google Meet REST API.
    // For Milestone 1, returns a fresh Google Meet launch link.
    return 'https://meet.google.com/new';
  }
}

export const meetingService = new MockMeetingService();
