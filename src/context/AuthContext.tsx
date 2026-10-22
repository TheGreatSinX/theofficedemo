/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import { AvatarConfig, UserProfile } from '../types/game';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  role: 'admin' | 'employee';
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateUserProfile: (updates: {
    displayName?: string;
    title?: string;
    avatarConfig?: AvatarConfig;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BOOTSTRAP_ADMIN_EMAIL = 'landverseauto@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<'admin' | 'employee'>('employee');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load or initialize user profile document in Firestore
  const syncUserProfile = async (firebaseUser: User): Promise<void> => {
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const adminDocRef = doc(db, 'admins', firebaseUser.uid);

    try {
      // 1. Check if user is in trusted /admins collection or matches bootstrapped developer email
      let isVerifiedAdmin = false;
      if (firebaseUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
        isVerifiedAdmin = true;
      } else {
        const adminSnap = await getDoc(adminDocRef);
        if (adminSnap.exists()) {
          isVerifiedAdmin = true;
        }
      }

      // If bootstrapped admin, ensure /admins document exists
      if (isVerifiedAdmin) {
        try {
          const adminSnap = await getDoc(adminDocRef);
          if (!adminSnap.exists()) {
            await setDoc(adminDocRef, {
              uid: firebaseUser.uid,
              grantedBy: 'system_bootstrap',
              grantedAt: serverTimestamp(),
            });
          }
        } catch {
          // May be caught by rules if already set
        }
      }

      // 2. Fetch or create users/{uid} profile
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const resolvedRole: 'admin' | 'employee' = isVerifiedAdmin ? 'admin' : (data.role || 'employee');

        // Check if account is disabled
        if (data.status === 'disabled') {
          setError('Your account has been suspended by an administrator.');
          await fbSignOut(auth);
          setUser(null);
          setProfile(null);
          return;
        }

        const loadedProfile: UserProfile = {
          id: firebaseUser.uid,
          name: data.displayName || firebaseUser.displayName || 'Colleague',
          role: resolvedRole,
          title: data.title || (resolvedRole === 'admin' ? 'Workspace Lead' : 'Team Member'),
          status: 'online',
          currentMapId: 'main_office',
          x: 8,
          y: 11,
          direction: 'down',
          isMoving: false,
          avatarConfig: data.avatarConfig || {
            skinColor: '#f8c291',
            hairStyle: 'short',
            hairColor: '#3d2714',
            shirtColor: resolvedRole === 'admin' ? '#7c3aed' : '#2563eb',
            pantsColor: '#1e293b',
            accessory: resolvedRole === 'admin' ? 'badge' : 'none',
            characterId: 'office_worker',
          },
        };

        setProfile(loadedProfile);
        setRole(resolvedRole);
      } else {
        // Create new user profile document
        const newRole: 'admin' | 'employee' = isVerifiedAdmin ? 'admin' : 'employee';
        const initialAvatar: AvatarConfig = {
          skinColor: '#f8c291',
          hairStyle: 'short',
          hairColor: '#3d2714',
          shirtColor: newRole === 'admin' ? '#7c3aed' : '#2563eb',
          pantsColor: '#1e293b',
          accessory: newRole === 'admin' ? 'badge' : 'none',
          characterId: 'office_worker',
        };

        const newDocPayload = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Colleague',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || '',
          role: newRole,
          status: 'active',
          title: newRole === 'admin' ? 'Workspace Lead' : 'Team Member',
          avatarConfig: initialAvatar,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(userDocRef, newDocPayload);

        setProfile({
          id: firebaseUser.uid,
          name: newDocPayload.displayName,
          role: newRole,
          title: newDocPayload.title,
          status: 'online',
          currentMapId: 'main_office',
          x: 8,
          y: 11,
          direction: 'down',
          isMoving: false,
          avatarConfig: initialAvatar,
        });
        setRole(newRole);
      }
    } catch (err) {
      console.error('Failed to sync user profile:', err);
      handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setError(null);
      if (fbUser) {
        setUser(fbUser);
        try {
          await syncUserProfile(fbUser);
        } catch (err: unknown) {
          setError((err as Error).message || 'Failed to authenticate profile.');
        }
      } else {
        setUser(null);
        setProfile(null);
        setRole('employee');
      }
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      await syncUserProfile(result.user);
    } catch (err: unknown) {
      setError((err as Error).message || 'Google sign-in failed.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
      setUser(null);
      setProfile(null);
      setRole('employee');
    } catch (err: unknown) {
      setError((err as Error).message || 'Sign out failed.');
    }
  };

  const updateUserProfile = async (updates: {
    displayName?: string;
    title?: string;
    avatarConfig?: AvatarConfig;
  }) => {
    if (!user || !profile) return;
    const userDocRef = doc(db, 'users', user.uid);
    try {
      const payload: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (updates.displayName !== undefined) payload.displayName = updates.displayName;
      if (updates.title !== undefined) payload.title = updates.title;
      if (updates.avatarConfig !== undefined) payload.avatarConfig = updates.avatarConfig;

      await updateDoc(userDocRef, payload);

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: updates.displayName !== undefined ? updates.displayName : prev.name,
              title: updates.title !== undefined ? updates.title : prev.title,
              avatarConfig: updates.avatarConfig !== undefined ? updates.avatarConfig : prev.avatarConfig,
            }
          : null
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await syncUserProfile(user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        isAdmin: role === 'admin',
        isLoading,
        error,
        signInWithGoogle,
        signOut,
        updateUserProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
