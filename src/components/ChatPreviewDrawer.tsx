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
    <div className="absolute bottom-4 left-4 z-30 w-80 md:w-96 select-none">
      {/* Collapse Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-slate-900/95 hover:bg-slate-900 border border-slate-700/80 rounded-t-xl cursor-pointer flex items-center justify-between shadow-xl backdrop-blur transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          <span>Team Communications</span>
          <span className="text-[10px] text-slate-400 font-mono font-normal">
            ({messages.length} msgs)
          </span>
        </div>
        <button className="text-slate-400 hover:text-white">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Chat Drawer */}
      {isOpen && (
        <div className="bg-slate-900/95 border-x border-b border-slate-700/80 rounded-b-xl shadow-2xl backdrop-blur flex flex-col h-80">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/40 text-[11px]">
            <button
              onClick={() => {
                setActiveTab('local');
                onClearDirectUser();
              }}
              className={`flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'local'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Nearby Proximity Chat (Triggers Speech Bubbles)"
            >
              <Volume2 className="w-3 h-3 text-emerald-400" />
              #local
            </button>
            <button
              onClick={() => {
                setActiveTab('room');
                onClearDirectUser();
              }}
              className={`flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'room'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
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
              className={`flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'broadcast'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="w-3 h-3" />
              #announcements
            </button>
            <button
              onClick={() => setActiveTab('direct')}
              className={`flex-1 py-2 px-1 text-center font-medium transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'direct'
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900/50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3 h-3" />
              {selectedDirectUser ? selectedDirectUser.name.split(' ')[0] : 'Direct'}
            </button>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 text-xs">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-[11px]">
                No messages yet in this channel.
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isMe = msg.senderId === currentUser.id;
                return (
                  <div key={msg.id} className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`font-semibold ${isMe ? 'text-indigo-400' : 'text-slate-200'}`}>
                        {msg.senderName}
                      </span>
                      {msg.role === 'admin' && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                          ADMIN
                        </span>
                      )}
                      <span className="text-slate-500 font-mono">{msg.timestamp}</span>
                    </div>
                    <p className="text-slate-300 bg-slate-800/60 p-2 rounded-lg leading-relaxed text-[11px] border border-slate-700/40">
                      {msg.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Message Input Form */}
          <form onSubmit={handleSend} className="p-2 border-t border-slate-800 bg-slate-950/60 flex gap-1.5">
            <input
              type="text"
              placeholder={`Message in #${activeTab}... (Type to chat)`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onFocus={() => onFocusInput(true)}
              onBlur={() => onFocusInput(false)}
              className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
