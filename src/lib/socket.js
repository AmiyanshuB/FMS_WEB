// src/lib/socket.js
import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(serverUrl) {
  if (socket) return socket;

  // Prefer explicit serverUrl param, then VITE var, then same-origin fallback
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL : '';
  const url = serverUrl || envUrl || (location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : ''));

  console.log('[socket] connecting to:', url);
  socket = io(url, { autoConnect: true });
  return socket;
}

export function getSocket() { return socket; }