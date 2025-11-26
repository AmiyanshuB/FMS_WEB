// src/lib/socket.js
import { io } from 'socket.io-client';

let socket = null;

/**
 * Connect (or return existing) Socket.io client.
 * Priority for base URL:
 *  1. Explicit serverUrl argument
 *  2. VITE_API_URL env (used on Netlify)
 *  3. window.location.origin (same-origin dev)
 */
export function connectSocket(serverUrl) {
  if (socket) return socket;

  let base = serverUrl;

  if (!base) {
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
        base = import.meta.env.VITE_API_URL;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!base && typeof window !== 'undefined') {
    base = window.location.origin;
  }

  if (!base) {
    console.warn('[socket] No base URL resolved, using default "/"');
    base = '/';
  }

  // normalise (remove trailing slash)
  base = base.replace(/\/$/, '');

  console.log('[socket] connecting to:', base);
  socket = io(base, {
    transports: ['websocket', 'polling'],
    withCredentials: false
  });
  return socket;
}

export function getSocket() {
  return socket;
}