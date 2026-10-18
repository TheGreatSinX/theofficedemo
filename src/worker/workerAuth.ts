/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Workers-native identity verification for the multiplayer ticket endpoint.
 *
 * This is the Cloudflare Workers port of `src/multiplayer/serverAuth.ts` (which
 * is Node-only because it uses `crypto.createVerify` with X.509 certificates).
 * The semantics are identical:
 *  - With a Firebase ID token (Authorization: Bearer ...): the RS256 signature
 *    is verified with WebCrypto against Google's published secure-token JWKS,
 *    and the standard claims are validated. The user id always comes from the
 *    verified `sub` claim, and the role is looked up in Firestore with the
 *    caller's own credentials (so Firestore rules decide what they may see) —
 *    the role in the request body is never trusted.
 *  - Without a token (local/dev deployments where Firebase auth is not
 *    configured) tickets are still issued, but the caller can never claim the
 *    admin role through this endpoint.
 */

import firebaseConfig from '../../firebase-applet-config.json';

const SECURE_TOKEN_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const KEY_CACHE_TTL_MS = 55 * 60 * 1000;

interface JwksKey {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

interface JwksCache {
  fetchedAt: number;
  keys: Map<string, CryptoKey>;
}

let jwksCache: JwksCache | null = null;

export interface FirebaseIdTokenPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  name?: string;
  email?: string;
}

function base64UrlToBytes(b64url: string): Uint8Array | null {
  try {
    const normalized = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function decodeJsonPart(part: string): unknown {
  const bytes = base64UrlToBytes(part);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Fetches Google's secure-token signing keys (JWKS) and imports them as
 * WebCrypto RSA verification keys. Cached in the isolate with a TTL; callers
 * may force a refresh when a token references an unknown `kid`.
 */
export async function fetchSecureTokenKeys(force = false): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (!force && jwksCache && now - jwksCache.fetchedAt < KEY_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(SECURE_TOKEN_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Secure token JWKS fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { keys?: JwksKey[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (
      typeof jwk.kid !== 'string' ||
      jwk.kty !== 'RSA' ||
      jwk.alg !== 'RS256' ||
      typeof jwk.n !== 'string' ||
      typeof jwk.e !== 'string'
    ) {
      continue;
    }
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      keys.set(jwk.kid, key);
    } catch {
      // Skip malformed keys; the remaining keys still work.
    }
  }
  jwksCache = { fetchedAt: now, keys };
  return keys;
}

/**
 * Verifies a Firebase ID token signature and standard claims.
 * Returns the decoded payload on success, or null when invalid.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdTokenPayload | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = decodeJsonPart(headerB64) as { alg?: string; kid?: string } | null;
    if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    const signature = base64UrlToBytes(signatureB64);
    if (!signature) return null;

    let keys = await fetchSecureTokenKeys();
    let key = keys.get(header.kid);
    if (!key) {
      // Certificate may have rotated; force one refresh before giving up.
      keys = await fetchSecureTokenKeys(true);
      key = keys.get(header.kid);
    }
    if (!key) return null;

    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signatureValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      signature as BufferSource,
      signedData as BufferSource
    );
    if (!signatureValid) return null;

    const payload = decodeJsonPart(payloadB64) as FirebaseIdTokenPayload | null;
    if (!payload) return null;

    const projectId = String(firebaseConfig.projectId);
    const now = Math.floor(Date.now() / 1000);

    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return payload;
  } catch (err) {
    console.warn('[workerAuth] Firebase ID token verification failed:', err);
    return null;
  }
}

/**
 * Looks up the caller's role from Firestore using the caller's own ID token
 * (Firestore security rules decide whether the read is allowed). Checks the
 * `admins` whitelist first, then `users/{uid}`.
 */
export async function lookupRoleFromFirestore(
  uid: string,
  idToken: string
): Promise<'admin' | 'employee' | null> {
  const projectId = String(firebaseConfig.projectId);
  const databaseId =
    (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || '(default)';
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodeURIComponent(
    databaseId
  )}/documents`;

  // 1. Admin whitelist document
  try {
    const res = await fetch(`${base}/admins/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) return 'admin';
  } catch {
    // network failure — fall through to the users lookup
  }

  // 2. User profile document
  try {
    const res = await fetch(`${base}/users/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const doc = (await res.json()) as {
        fields?: { role?: { stringValue?: string }; status?: { stringValue?: string } };
      };
      const role = doc?.fields?.role?.stringValue;
      const status = doc?.fields?.status?.stringValue;
      if (status === 'disabled') return null;
      if (role === 'admin') return 'admin';
      if (role === 'employee') return 'employee';
      return 'employee';
    }
  } catch {
    // ignore — default below
  }

  return null;
}

export interface VerifiedTicketIdentity {
  userId: string;
  displayName?: string;
  role: 'admin' | 'employee';
  verified: boolean;
}

export interface TicketIdentityResult {
  identity?: VerifiedTicketIdentity;
  error?: { status: number; message: string };
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}

/**
 * Resolves the identity for a ticket request.
 *  - With a valid ID token: userId = verified `sub`, role from Firestore.
 *  - Without a token: userId from the body (legacy/dev), role forced to
 *    `employee` — admin permissions can never be self-asserted.
 */
export async function resolveTicketIdentity(
  authorizationHeader: string | undefined,
  body: { userId?: unknown; displayName?: unknown; role?: unknown; status?: unknown }
): Promise<TicketIdentityResult> {
  const token = extractBearerToken(authorizationHeader);

  if (!token) {
    const userId =
      typeof body.userId === 'string' && body.userId.trim().length > 0 ? body.userId.trim() : null;
    if (!userId) {
      return { error: { status: 400, message: 'Missing or invalid userId' } };
    }
    return {
      identity: {
        userId,
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        role: 'employee',
        verified: false,
      },
    };
  }

  const payload = await verifyFirebaseIdToken(token);
  if (!payload || !payload.sub) {
    return { error: { status: 401, message: 'Invalid or expired authentication token' } };
  }

  const firestoreRole = await lookupRoleFromFirestore(payload.sub, token);
  return {
    identity: {
      userId: payload.sub,
      displayName:
        payload.name ?? (typeof body.displayName === 'string' ? body.displayName : undefined),
      role: firestoreRole ?? 'employee',
      verified: true,
    },
  };
}
