/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientMessage, ServerMessage, validateClientMessage } from './protocol';

export interface IMultiplayerTransport {
  connect(endpointUrl: string): Promise<void>;
  send(message: ClientMessage): void;
  close(): void;
  isOpen(): boolean;
  onOpen(callback: () => void): void;
  onMessage(callback: (msg: ServerMessage) => void): void;
  onClose(callback: (code: number, reason: string) => void): void;
  onError(callback: (err: unknown) => void): void;
}

export class WebSocketTransport implements IMultiplayerTransport {
  private socket: WebSocket | null = null;
  private openListeners: Array<() => void> = [];
  private messageListeners: Array<(msg: ServerMessage) => void> = [];
  private closeListeners: Array<(code: number, reason: string) => void> = [];
  private errorListeners: Array<(err: unknown) => void> = [];

  public connect(endpointUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.close();

      try {
        const ws = new WebSocket(endpointUrl);
        this.socket = ws;

        let opened = false;

        ws.onopen = () => {
          opened = true;
          this.openListeners.forEach((cb) => cb());
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.messageListeners.forEach((cb) => cb(data));
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = (event) => {
          this.closeListeners.forEach((cb) => cb(event.code, event.reason));
          if (!opened) {
            reject(new Error(`WebSocket connection closed before opening: ${event.code}`));
          }
        };

        ws.onerror = (err) => {
          this.errorListeners.forEach((cb) => cb(err));
          if (!opened) {
            reject(err);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public send(message: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  public close(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore
      }
      this.socket = null;
    }
  }

  public isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  public onOpen(callback: () => void): void {
    this.openListeners.push(callback);
  }

  public onMessage(callback: (msg: ServerMessage) => void): void {
    this.messageListeners.push(callback);
  }

  public onClose(callback: (code: number, reason: string) => void): void {
    this.closeListeners.push(callback);
  }

  public onError(callback: (err: unknown) => void): void {
    this.errorListeners.push(callback);
  }
}
