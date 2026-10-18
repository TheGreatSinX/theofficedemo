/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatMessage, SpeechBubble } from '../types/game';

export interface IChatService {
  getMessages(): ChatMessage[];
  sendMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage;
  subscribeMessages(callback: (messages: ChatMessage[], newMsg: ChatMessage) => void): () => void;
  emitSpeechBubble(bubble: Omit<SpeechBubble, 'id' | 'createdAt'>): SpeechBubble;
  subscribeSpeechBubbles(callback: (bubble: SpeechBubble) => void): () => void;
}

export class MockChatService implements IChatService {
  private messages: ChatMessage[] = [
    {
      id: 'm1',
      senderId: 'user_marcus',
      senderName: 'Marcus Brody',
      channel: 'broadcast',
      text: 'Good morning team! Standup in the Executive Boardroom in 15 minutes. Google Meet link is live.',
      timestamp: '09:45 AM',
      role: 'admin',
    },
    {
      id: 'm2',
      senderId: 'user_sarah',
      senderName: 'Sarah Chen',
      channel: 'room',
      text: 'I updated the whiteboard with the Sprint 1 requirements. Check out the stickies!',
      timestamp: '09:48 AM',
      role: 'employee',
    },
    {
      id: 'm3',
      senderId: 'user_elena',
      senderName: 'Elena Rostova',
      channel: 'local',
      text: 'Deploying the staging build now!',
      timestamp: '09:50 AM',
      role: 'employee',
    },
    {
      id: 'm4',
      senderId: 'user_liam',
      senderName: 'Liam Patel',
      channel: 'local',
      text: 'Grabbing a quick espresso at the breakroom ☕',
      timestamp: '09:52 AM',
      role: 'employee',
    },
  ];

  private messageSubscribers: Array<(messages: ChatMessage[], newMsg: ChatMessage) => void> = [];
  private bubbleSubscribers: Array<(bubble: SpeechBubble) => void> = [];

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  sendMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const newMsg: ChatMessage = {
      ...msg,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    this.messages.push(newMsg);
    this.messageSubscribers.forEach((cb) => cb([...this.messages], newMsg));

    // If channel is 'local' or 'room', also emit a speech bubble above the sender's avatar!
    if (msg.channel === 'local' || msg.channel === 'room') {
      this.emitSpeechBubble({
        senderId: msg.senderId,
        senderName: msg.senderName,
        text: msg.text,
        durationMs: 4500,
      });
    }

    return newMsg;
  }

  subscribeMessages(callback: (messages: ChatMessage[], newMsg: ChatMessage) => void): () => void {
    this.messageSubscribers.push(callback);
    callback([...this.messages], this.messages[this.messages.length - 1]);
    return () => {
      this.messageSubscribers = this.messageSubscribers.filter((cb) => cb !== callback);
    };
  }

  emitSpeechBubble(bubbleData: Omit<SpeechBubble, 'id' | 'createdAt'>): SpeechBubble {
    const bubble: SpeechBubble = {
      ...bubbleData,
      id: `bubble_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: Date.now(),
      durationMs: bubbleData.durationMs || 4500,
    };

    this.bubbleSubscribers.forEach((cb) => cb(bubble));
    return bubble;
  }

  subscribeSpeechBubbles(callback: (bubble: SpeechBubble) => void): () => void {
    this.bubbleSubscribers.push(callback);
    return () => {
      this.bubbleSubscribers = this.bubbleSubscribers.filter((cb) => cb !== callback);
    };
  }
}

export const chatService = new MockChatService();
