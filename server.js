const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// State
const rooms = {
  general: { name: "General", users: new Map() },
  random: { name: "Random", users: new Map() },
  tech: { name: "Tech", users: new Map() },
};

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

io.on("connection", (socket) => {
  let currentRoom = null;
  let username = null;

  // User joins with a username
  socket.on("set_username", (name, callback) => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed) return callback({ error: "Username cannot be empty." });

    // Check for duplicate across all rooms
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
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;

    io.to(currentRoom).emit("chat_message", {
      username,
      text: trimmed,
      timestamp: Date.now(),
      id: socket.id,
    });
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
});
