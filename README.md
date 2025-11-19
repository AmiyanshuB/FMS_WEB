# College Room Scheduler - With Auth & Realtime

This project is a Vite + React app extended with a simple Node/Express server that provides:
- file-based event persistence (`server/data/events.json`)
- simple hardcoded admin authentication (JWT)
- realtime updates via Socket.IO

## Run server
cd server
npm install
JWT_SECRET=some-secret npm start

Server defaults to port 4000.

## Run frontend
From project root:
npm install
npm run dev

The Vite dev server proxies `/api` and `/socket.io` to the server (see vite.config.js). If you run the server on a different host, update `src/lib/socket.js` to connect to that URL.

## Admin accounts (dev)
- admin1 / pass1
- admin2 / pass2

## Notes
- Credentials are plaintext and hardcoded for development purposes only.
- JWT secret should be set via environment variable in production.
- File-based persistence may not be safe under concurrent writes at scale.
