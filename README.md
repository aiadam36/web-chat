# web-chat

Real-time multi-user chat app built with Node.js, Express, and Socket.io.

## Features
- Multiple chat rooms
- Live online user count per room
- Typing indicators
- Join/leave notifications
- Username uniqueness enforcement
- Clean aesthetic UI
- Chat history persistency
- Wide customization support

## Setup

```bash
npm install
npm start
```

Take a look at `config.json` too!

This is default value:

```js
{
  "port": 3000,
  "accentColor": "#e8ff47",
  "defaultRoom": "general",
  "rooms": [
    { "id": "general", "name": "General" },
    { "id": "random",  "name": "Random"  },
    { "id": "tech",    "name": "Tech"    }
  ],
  "history": {
    "maxStored": 1000,
    "maxSentOnJoin": 50
  },
  "limits": {
    "maxMessageLength": 500,
    "maxUsernameLength": 20,
    "minUsernameLength": 2
  },
  "typingTimeoutMs": 2000
}
```

## Contributing

Feel free to fork and open PR
