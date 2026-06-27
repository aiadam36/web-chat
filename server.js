const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const MAX_HISTORY = 1000; // max messages kept per room file
const HISTORY_SEND = 50;  // messages sent to a joining user

// ── Ensure data/ directory exists ──
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ── Serve static files ──
app.use(express.static(path.join(__dirname, "public")));

// ── Room definitions ──
const rooms = {
  general: { name: "General", users: new Map() },
  random:  { name: "Random",  users: new Map() },
  tech:    { name: "Tech",    users: new Map() },
};

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

  // Trim to MAX_HISTORY (keep the newest messages)
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }

  fs.writeFileSync(file, JSON.stringify(history, null, 2), "utf8");
}

// ── Seed history files for any new rooms that don't have one yet ──
for (const roomId of Object.keys(rooms)) {
  loadHistory(roomId); // touch-check; file is created lazily on first message
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
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return callback({ error: "Username cannot be empty." });

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

  // Join a room — sends last HISTORY_SEND messages to the joining socket
  socket.on("join_room", (roomId, callback) => {
    if (!username) return callback?.({ error: "Set a username first." });
    if (!rooms[roomId]) return callback?.({ error: "Room not found." });

    // Leave current room
    if (currentRoom) {
      socket.leave(currentRoom);
      rooms[currentRoom].users.delete(socket.id);
      io.to(currentRoom).emit("system_message", {
        text: `${username} left the room.`,
        timestamp: Date.now(),
      });
      io.to(currentRoom).emit("user_count", rooms[currentRoom].users.size);
    }

    // Join new room
    currentRoom = roomId;
    socket.join(currentRoom);
    rooms[currentRoom].users.set(socket.id, username);

    // Send history to the joining socket only
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

  // Send message — broadcast + persist
  socket.on("send_message", (text) => {
    if (!username || !currentRoom) return;
    const trimmed = text.trim().slice(0, 500);
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
  console.log(`\n🚀 web-chat running at http://localhost:${PORT}\n`);
  console.log(`   History stored in: ${DATA_DIR}\n`);
});
