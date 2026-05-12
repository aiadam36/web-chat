# web-chat

Real-time multi-user chat app built with Node.js, Express, and Socket.io.

## Features
- Multiple chat rooms (#general, #random, #tech)
- Live online user count per room
- Typing indicators
- Join/leave notifications
- Username uniqueness enforcement
- Clean terminal-aesthetic UI

## Setup

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

For development with auto-reload:
```bash
npm run dev
```

## Adding More Rooms

In `server.js`, add an entry to the `rooms` object:

```js
const rooms = {
  general: { name: "General", users: new Map() },
  random:  { name: "Random",  users: new Map() },
  tech:    { name: "Tech",    users: new Map() },
  gaming:  { name: "Gaming",  users: new Map() }, // ← add like this
};
```
