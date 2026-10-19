/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, ShieldCheck, AlertCircle, X, Sparkles } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { signInWithGoogle, isLoading, error } = useAuth();

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
      onClose();
    } catch {
      // Error handled by AuthContext state
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none"
      onClick={onClose}
    >
      <div
        className="rpg-window w-full max-w-md p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="rpg-window-title flex items-center justify-between pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rpg-chip rpg-chip-gold !text-[11px] flex items-center justify-center">
              G
            </div>
            <div>
              <h2 className="pixel-title text-[10px]">Sign In to GatherGrid</h2>
              <p className="text-xs text-rpg-dim">Virtual Office & Pixel Workplace</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rpg-btn rpg-btn-danger p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="rpg-inset rpg-edge-red p-3 text-rpg-red text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rpg-red shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Informational description */}
        <div className="rpg-inset space-y-3 text-xs text-rpg-text leading-relaxed p-3.5">
          <div className="flex items-center gap-2 text-rpg-gold font-semibold">
            <ShieldCheck className="w-4 h-4 text-rpg-gold" />
            <span>Secure Firebase Authentication & RBAC</span>
          </div>
          <p className="text-rpg-dim text-[11px]">
            New accounts receive standard Employee permissions. Administrator privileges are granted via verified email whitelist (<span className="text-rpg-text font-mono">landverseauto@gmail.com</span>) or Firestore admin assignment.
          </p>
        </div>

        {/* Google Sign In Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="rpg-btn rpg-btn-light w-full py-3 px-4 font-semibold text-xs flex items-center justify-center gap-3 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{isLoading ? 'Connecting to Firebase...' : 'Sign In with Google'}</span>
        </button>

        {/* Footer info */}
        <div className="text-center text-[11px] text-rpg-dim flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3 text-rpg-gold" />
          <span>Session securely restored across browser tabs</span>
        </div>
      </div>
    </div>
  );
};
