/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { AvatarConfig } from '../types/game';

export interface ConnectionTicketData {
  ticketId: string;
  userId: string;
  displayName: string;
  role: 'admin' | 'employee';
  avatarConfig: AvatarConfig;
  roomId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export class TicketService {
  private tickets: Map<string, ConnectionTicketData> = new Map();
  // Ticket TTL: 60 seconds
  public static readonly TICKET_TTL_MS = 60 * 1000;

  /**
   * Issues a short-lived ticket for an authenticated user to connect to a specific room.
   */
  public issueTicket(params: {
    userId: string;
    displayName: string;
    role: 'admin' | 'employee';
    avatarConfig: AvatarConfig;
    roomId: string;
  }): ConnectionTicketData {
    const ticketId = `tkt_${crypto.randomBytes(24).toString('hex')}`;
    const now = Date.now();
    const ticket: ConnectionTicketData = {
      ticketId,
      userId: params.userId,
      displayName: params.displayName || 'Colleague',
      role: params.role || 'employee',
      avatarConfig: params.avatarConfig,
      roomId: params.roomId || 'main_office',
      createdAt: now,
      expiresAt: now + TicketService.TICKET_TTL_MS,
      used: false,
    };

    this.tickets.set(ticketId, ticket);
    this.cleanExpired();
    return ticket;
  }

  /**
   * Consumes a ticket upon WebSocket handshake.
   * Ensures single-use and valid expiration.
   */
  public consumeTicket(ticketId: string, requestedRoomId?: string): ConnectionTicketData | null {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return null;
    }

    const now = Date.now();
    if (now > ticket.expiresAt || ticket.used) {
      this.tickets.delete(ticketId);
      return null;
    }

    if (requestedRoomId && ticket.roomId !== requestedRoomId) {
      return null;
    }

    // Mark as consumed immediately to prevent replay
    ticket.used = true;
    this.tickets.delete(ticketId);
    return ticket;
  }

  private cleanExpired() {
    const now = Date.now();
    for (const [id, t] of this.tickets.entries()) {
      if (now > t.expiresAt || t.used) {
        this.tickets.delete(id);
      }
    }
  }
}

export const ticketService = new TicketService();
