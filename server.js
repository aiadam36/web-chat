const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

// ── Config ──
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

const PORT         = process.env.PORT || config.port;
const DATA_DIR     = path.join(__dirname, "data");
const MAX_HISTORY  = config.history.maxStored;
const HISTORY_SEND = config.history.maxSentOnJoin;
const MAX_MSG_LEN  = config.limits.maxMessageLength;
const MAX_USR_LEN  = config.limits.maxUsernameLength;
const MIN_USR_LEN  = config.limits.minUsernameLength;
const DEFAULT_ROOM = config.defaultRoom;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ── Ensure data/ directory exists ──
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── Serve static files ──
app.use(express.static(path.join(__dirname, "public")));

// ── Expose config to the client ──
// The client fetches /config to get the values it needs (defaultRoom, limits, typingTimeoutMs, etc.)
app.get("/config", (_req, res) => {
  res.json({
    defaultRoom:     config.defaultRoom,
    accentColor:     config.accentColor,
    typingTimeoutMs: config.typingTimeoutMs,
    limits:          config.limits,
  });
});

// ── Build rooms from config ──
const rooms = {};
for (const { id, name } of config.rooms) {
  rooms[id] = { name, users: new Map() };
}

// Validate defaultRoom exists
if (!rooms[DEFAULT_ROOM]) {
  console.warn(`[warn] defaultRoom "${DEFAULT_ROOM}" not found in rooms list. Falling back to first room.`);
}

// ── JSON persistence helpers ──

function historyPath(roomId) {
  return path.join(DATA_DIR, `${roomId}.json`);
}

function loadHistory(roomId) {
  const file = historyPath(roomId);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    console.warn(`[warn] Could not parse ${file}, starting fresh.`);
    return [];
  }
}

function saveMessage(roomId, message) {
  const file = historyPath(roomId);
  let history = loadHistory(roomId);
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }
  fs.writeFileSync(file, JSON.stringify(history, null, 2), "utf8");
}

// ── Room helpers ──

function getRoomList() {
  return Object.entries(rooms).map(([id, room]) => ({
    id,
    name: room.name,
    count: room.users.size,
  }));
}

function broadcastRoomList() {
  io.emit("room_list", getRoomList());
}

// ── Socket.io ──

io.on("connection", (socket) => {
  let currentRoom = null;
  let username = null;

  // Set username
  socket.on("set_username", (name, callback) => {
    const trimmed = name.trim().slice(0, MAX_USR_LEN);
    if (!trimmed || trimmed.length < MIN_USR_LEN) {
      return callback({ error: `Username must be ${MIN_USR_LEN}–${MAX_USR_LEN} characters.` });
    }

    for (const room of Object.values(rooms)) {
      for (const [, u] of room.users) {
        if (u.toLowerCase() === trimmed.toLowerCase()) {
          return callback({ error: "Username already taken." });
        }
      }
    }

    username = trimmed;
    callback({ ok: true });
  });

  // Join a room
  socket.on("join_room", (roomId, callback) => {
    if (!username) return callback?.({ error: "Set a username first." });
    if (!rooms[roomId]) return callback?.({ error: "Room not found." });

    if (currentRoom) {
      socket.leave(currentRoom);
      rooms[currentRoom].users.delete(socket.id);
      io.to(currentRoom).emit("system_message", {
        text: `${username} left the room.`,
        timestamp: Date.now(),
      });
      io.to(currentRoom).emit("user_count", rooms[currentRoom].users.size);
    }

    currentRoom = roomId;
    socket.join(currentRoom);
    rooms[currentRoom].users.set(socket.id, username);

    const history = loadHistory(roomId).slice(-HISTORY_SEND);
    socket.emit("room_history", history);

    io.to(currentRoom).emit("system_message", {
      text: `${username} joined the room.`,
      timestamp: Date.now(),
    });
    io.to(currentRoom).emit("user_count", rooms[currentRoom].users.size);

    broadcastRoomList();
    callback?.({ ok: true });
  });

  // Send message
  socket.on("send_message", (text) => {
    if (!username || !currentRoom) return;
    const trimmed = text.trim().slice(0, MAX_MSG_LEN);
    if (!trimmed) return;

    const message = {
      username,
      text: trimmed,
      timestamp: Date.now(),
      id: socket.id,
    };

    io.to(currentRoom).emit("chat_message", message);
    saveMessage(currentRoom, message);
  });

  // Typing indicator
  socket.on("typing", (isTyping) => {
    if (!username || !currentRoom) return;
    socket.to(currentRoom).emit("user_typing", { username, isTyping });
  });

  // Get room list
  socket.on("get_rooms", (callback) => {
    callback(getRoomList());
  });

  // Disconnect
  socket.on("disconnect", () => {
    if (currentRoom && username) {
      rooms[currentRoom].users.delete(socket.id);
      io.to(currentRoom).emit("system_message", {
        text: `${username} disconnected.`,
        timestamp: Date.now(),
      });
      io.to(currentRoom).emit("user_count", rooms[currentRoom].users.size);
      broadcastRoomList();
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 web-chat running at http://localhost:${PORT}`);
  console.log(`   Rooms: ${config.rooms.map(r => "#" + r.id).join(", ")}`);
  console.log(`   Default room: #${DEFAULT_ROOM}`);
  console.log(`   History stored in: ${DATA_DIR}\n`);
});
