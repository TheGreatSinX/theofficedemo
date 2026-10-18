/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-side identity verification for the multiplayer ticket endpoint.
 *
 * When the client supplies a Firebase ID token (Authorization: Bearer ...) we
 * verify its RS256 signature against Google's published secure-token
 * certificates and validate the standard claims. The user id always comes
 * from the verified `sub` claim, and the role is looked up in Firestore with
 * the caller's own credentials (so Firestore rules decide what they may see) —
 * the role in the request body is never trusted.
 *
 * Requests without a token (local/dev deployments where Firebase auth is not
 * configured) still work for backwards compatibility, but can never claim the
 * admin role through this endpoint.
 */

import crypto from 'crypto';
import firebaseConfig from '../../firebase-applet-config.json';

const SECURE_TOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const CERT_CACHE_TTL_MS = 55 * 60 * 1000;

interface CertCache {
  fetchedAt: number;
  certs: Record<string, string>;
}

let certCache: CertCache | null = null;

export async function fetchSecureTokenCerts(force = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!force && certCache && now - certCache.fetchedAt < CERT_CACHE_TTL_MS) {
    return certCache.certs;
  }
  const res = await fetch(SECURE_TOKEN_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Secure token certificates fetch failed: HTTP ${res.status}`);
  }
  const certs = (await res.json()) as Record<string, string>;
  certCache = { fetchedAt: now, certs };
  return certs;
}

export interface FirebaseIdTokenPayload {
  aud?: string;
  iss?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  name?: string;
  email?: string;
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

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    let certs = await fetchSecureTokenCerts();
    let certPem = certs[header.kid];
    if (!certPem) {
      // Certificate may have rotated; force one refresh before giving up.
      certs = await fetchSecureTokenCerts(true);
      certPem = certs[header.kid];
    }
    if (!certPem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const signatureValid = verifier.verify(certPem, Buffer.from(signatureB64, 'base64url'));
    if (!signatureValid) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as FirebaseIdTokenPayload;
    const projectId = String(firebaseConfig.projectId);
    const now = Math.floor(Date.now() / 1000);

    if (payload.aud !== projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (typeof payload.iat !== 'number' || payload.iat > now + 60) return null;
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

    return payload;
  } catch (err) {
    console.warn('[serverAuth] Firebase ID token verification failed:', err);
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
