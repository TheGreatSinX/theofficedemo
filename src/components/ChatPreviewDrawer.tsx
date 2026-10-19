/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, ChevronDown, ChevronUp, Hash, User, Volume2 } from 'lucide-react';
import { UserProfile, ChatMessage } from '../types/game';
import { chatService } from '../services/ChatService';
import { sounds } from '../game/soundEffects';

interface ChatPreviewDrawerProps {
  currentUser: UserProfile;
  selectedDirectUser: UserProfile | null;
  onClearDirectUser: () => void;
  onFocusInput: (isFocused: boolean) => void;
  onSendLocalMessage?: (text: string) => void;
}

export const ChatPreviewDrawer: React.FC<ChatPreviewDrawerProps> = ({
  currentUser,
  selectedDirectUser,
  onClearDirectUser,
  onFocusInput,
  onSendLocalMessage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'broadcast' | 'room' | 'local' | 'direct'>('local');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(chatService.getMessages());

  useEffect(() => {
    const unsub = chatService.subscribeMessages((allMsgs) => {
      setMessages([...allMsgs]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (selectedDirectUser) {
      setActiveTab('direct');
      setIsOpen(true);
    }
  }, [selectedDirectUser]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    chatService.sendMessage({
      senderId: currentUser.id,
      senderName: currentUser.name,
      channel: activeTab,
      recipientId: activeTab === 'direct' ? selectedDirectUser?.id : undefined,
      text: inputText.trim(),
      role: currentUser.role,
    });

    if (activeTab === 'local' && onSendLocalMessage) {
      onSendLocalMessage(inputText.trim());
    }

    setInputText('');
    sounds.playInteract();
  };

  const filteredMessages = messages.filter((msg) => {
    if (activeTab === 'broadcast') return msg.channel === 'broadcast';
    if (activeTab === 'room') return msg.channel === 'room';
    if (activeTab === 'local') return msg.channel === 'local';
    if (activeTab === 'direct') {
      return (
        msg.channel === 'direct' &&
        (!selectedDirectUser ||
          msg.senderId === selectedDirectUser.id ||
          msg.recipientId === selectedDirectUser.id)
      );
    }
    return true;
  });

  return (
    <div className="rpg-window absolute bottom-4 left-4 z-30 w-80 md:w-96 select-none">
      {/* Collapse Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="rpg-window-title px-4 py-2 cursor-pointer flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-rpg-text">
          <MessageSquare className="w-3.5 h-3.5 text-rpg-gold" />
          <span>Team Communications</span>
          <span className="text-[10px] text-rpg-dim font-mono font-normal">
            ({messages.length} msgs)
          </span>
        </div>
        <button className="rpg-btn rpg-btn-plain p-0.5 cursor-pointer">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Chat Drawer */}
      {isOpen && (
        <div className="flex flex-col h-80">
          {/* Tabs */}
          <div className="flex border-b border-rpg-line text-[11px]">
            <button
              onClick={() => {
                setActiveTab('local');
                onClearDirectUser();
              }}
              className={`rpg-tab flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'local'
                  ? 'rpg-tab-active font-semibold'
                  : ''
              }`}
              title="Nearby Proximity Chat (Triggers Speech Bubbles)"
            >
              <Volume2 className="w-3 h-3 text-rpg-green" />
              #local
            </button>
            <button
              onClick={() => {
                setActiveTab('room');
                onClearDirectUser();
              }}
              className={`rpg-tab flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'room'
                  ? 'rpg-tab-active font-semibold'
                  : ''
              }`}
            >
              <Hash className="w-3 h-3" />
              #room
            </button>
            <button
              onClick={() => {
                setActiveTab('broadcast');
                onClearDirectUser();
              }}
              className={`rpg-tab flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'broadcast'
                  ? 'rpg-tab-active font-semibold'
                  : ''
              }`}
            >
              <Hash className="w-3 h-3" />
              #announcements
            </button>
            <button
              onClick={() => setActiveTab('direct')}
              className={`rpg-tab flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'direct'
                  ? 'rpg-tab-active font-semibold'
                  : ''
              }`}
            >
              <User className="w-3 h-3" />
              {selectedDirectUser ? selectedDirectUser.name.split(' ')[0] : 'Direct'}
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-rpg-dim text-[11px]">
                No messages yet in this channel.
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isMe = msg.senderId === currentUser.id;
                return (
                  <div key={msg.id} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`font-semibold ${isMe ? 'text-rpg-gold' : 'text-rpg-text'}`}>
                        {msg.senderName}
                      </span>
                      {msg.role === 'admin' && (
                        <span className="rpg-chip rpg-chip-gold text-[9px] px-1 py-0.2">
                          ADMIN
                        </span>
                      )}
                      <span className="text-rpg-dim font-mono">{msg.timestamp}</span>
                    </div>
                    <p className="rpg-inset text-rpg-text p-2 leading-relaxed text-[11px]">
                      {msg.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Message Input Form */}
          <form onSubmit={handleSend} className="p-2 border-t border-rpg-line flex gap-1.5">
            <input
              type="text"
              placeholder={`Message in #${activeTab}... (Type to chat)`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => onFocusInput(true)}
              onBlur={() => onFocusInput(false)}
              className="rpg-input flex-1 px-3 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rpg-btn rpg-btn-gold px-3 py-1.5 cursor-pointer flex items-center justify-center"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
