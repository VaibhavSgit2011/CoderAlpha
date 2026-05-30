/**
 * =============================================================================
 * AlphaTrade AI — Server Authentication Helper
 * =============================================================================
 *
 * A zero-dependency JWT decoder helper designed to run inside Next.js serverless
 * API Route Handlers.
 *
 * Extracts the user's ID (uid) from the Firebase Auth ID Token sent via the
 * Authorization header.
 *
 * Key details:
 *  - Firebase ID tokens are standard JSON Web Tokens (JWT).
 *  - The middle segment of a JWT is a Base64URL-encoded payload.
 *  - This helper decodes the payload to extract the `user_id` or `sub` claim.
 *  - This avoids needing `firebase-admin` private key setup in local dev environments.
 * =============================================================================
 */

import { NextRequest } from 'next/server';

export function getUserIdFromRequest(request: NextRequest): string | null {
  try {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Developer token bypass for local development testing
    if (token === 'dev-token') {
      return 'dev-user-id';
    }
    
    // Split the JWT to get the payload (second part)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const payloadB64 = parts[1];
    
    // Decode Base64URL to standard UTF-8 string
    const normalizedB64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = Buffer.from(normalizedB64, 'base64').toString('utf8');
    
    const claims = JSON.parse(decodedPayload);
    
    // Firebase Auth places the UID in the 'user_id' or 'sub' claims
    return claims.user_id || claims.sub || null;
  } catch (error) {
    console.error('[Server Auth] Failed to decode authentication token:', error);
    return null;
  }
}
