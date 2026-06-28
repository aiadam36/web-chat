/* ── web-chat client ── */

// ── Boot: fetch server config, then initialise ──
let cfg = {
  defaultRoom:     "general",
  typingTimeoutMs: 2000,
  limits: { maxMessageLength: 500, maxUsernameLength: 20, minUsernameLength: 2 },
};

fetch("/config")
  .then((r) => r.json())
  .then((data) => { cfg = data; })
  .catch(() => { /* use defaults above if fetch fails */ });

const socket = io();

// ── DOM refs ──
const loginScreen   = document.getElementById("login-screen");
const chatScreen    = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username-input");
const joinBtn       = document.getElementById("join-btn");
const loginError    = document.getElementById("login-error");
const myUsername    = document.getElementById("my-username");
const roomList      = document.getElementById("room-list");
const currentRoomEl = document.getElementById("current-room-name");
const userCountEl   = document.getElementById("user-count");
const messagesEl    = document.getElementById("messages");
const typingEl      = document.getElementById("typing-indicator");
const msgInput      = document.getElementById("msg-input");
const sendBtn       = document.getElementById("send-btn");
const logoutBtn        = document.getElementById("logout-btn");
const sidebarEl        = document.getElementById("sidebar");
const sidebarOverlay   = document.getElementById("sidebar-overlay");
const sidebarToggleBtn = document.getElementById("sidebar-toggle");
const sidebarCloseBtn  = document.getElementById("sidebar-close");

// ── State ──
let myName      = "";
let currentRoom = null;
let typingTimer = null;
let isTyping    = false;
let typingUsers = new Set();

// ── Username persistence ──
const STORAGE_KEY = "webchat_username";

function saveCachedUsername(name) {
  try { localStorage.setItem(STORAGE_KEY, name); } catch {}
}

function loadCachedUsername() {
  try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

function clearCachedUsername() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ── Helpers ──
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showError(msg) {
  loginError.textContent = msg;
  usernameInput.classList.add("shake");
  usernameInput.addEventListener("animationend", () => usernameInput.classList.remove("shake"), { once: true });
}

function appendMessage({ username, text, timestamp, own = false, system = false, historic = false }) {
  const row = document.createElement("div");
  row.className = "msg" + (system ? " system" : own ? " own" : "") + (historic ? " historic" : "");

  if (system) {
    const t = document.createElement("span");
    t.className = "msg-text";
    t.textContent = text;
    row.appendChild(t);
  } else {
    const time = document.createElement("span");
    time.className = "msg-time";
    time.textContent = formatTime(timestamp);

    const user = document.createElement("span");
    user.className = "msg-user";
    user.textContent = username;
    user.title = username;

    const body = document.createElement("span");
    body.className = "msg-text";
    body.textContent = text;

    row.append(time, user, body);
  }

  messagesEl.appendChild(row);
  scrollToBottom();
}

function renderRoomList(rooms) {
  roomList.innerHTML = "";
  rooms.forEach((room) => {
    const li = document.createElement("li");
    if (room.id === currentRoom) li.classList.add("active");

    li.innerHTML = `
      <span class="room-hash">#</span>${room.name.toLowerCase()}
      <span class="room-count">${room.count}</span>
    `;
    li.title = `#${room.name}`;
    li.addEventListener("click", () => { joinRoom(room.id); closeSidebar(); });
    roomList.appendChild(li);
  });
}

function updateTypingIndicator() {
  if (typingUsers.size === 0) {
    typingEl.textContent = "";
    return;
  }
  const names = [...typingUsers];
  if (names.length === 1) {
    typingEl.textContent = `${names[0]} is typing…`;
  } else if (names.length === 2) {
    typingEl.textContent = `${names[0]} and ${names[1]} are typing…`;
  } else {
    typingEl.textContent = `several people are typing…`;
  }
}

// ── Actions ──
function joinRoom(roomId) {
  if (roomId === currentRoom) return;
  messagesEl.innerHTML = "";
  typingUsers.clear();
  updateTypingIndicator();

  socket.emit("join_room", roomId, (res) => {
    if (res?.error) return;
    currentRoom = roomId;
    currentRoomEl.textContent = roomId;
  });
}

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || !currentRoom) return;
  socket.emit("send_message", text);
  msgInput.value = "";
  stopTyping();
}

function startTyping() {
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing", true);
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, cfg.typingTimeoutMs);
}

function stopTyping() {
  if (isTyping) {
    isTyping = false;
    socket.emit("typing", false);
  }
  clearTimeout(typingTimer);
}

// ── Login flow ──
function attemptJoin() {
  loginError.textContent = "";
  const name = usernameInput.value.trim();
  const { minUsernameLength, maxUsernameLength } = cfg.limits;
  if (!name) return showError("Enter a username.");
  if (name.length < minUsernameLength) return showError(`Too short (min ${minUsernameLength} chars).`);
  if (name.length > maxUsernameLength) return showError(`Too long (max ${maxUsernameLength} chars).`);

  socket.emit("set_username", name, (res) => {
    if (res.error) {
      if (loadCachedUsername().toLowerCase() === name.toLowerCase()) {
        clearCachedUsername();
      }
      return showError(res.error);
    }

    myName = name;
    myUsername.textContent = name;
    saveCachedUsername(name);

    loginScreen.classList.remove("active");
    chatScreen.classList.add("active");

    socket.emit("get_rooms", (rooms) => {
      renderRoomList(rooms);
      joinRoom(cfg.defaultRoom);
      msgInput.focus();
    });
  });
}

// Pre-fill username input if we have a cached name
const cached = loadCachedUsername();
if (cached) {
  usernameInput.value = cached;
  joinBtn.textContent = `join as ${cached} →`;
  usernameInput.addEventListener("input", () => {
    joinBtn.textContent = usernameInput.value.trim() === cached
      ? `join as ${cached} →`
      : "join →";
  }, { once: false });
}

joinBtn.addEventListener("click", attemptJoin);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptJoin();
});

// ── Message input ──
sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
msgInput.addEventListener("input", () => {
  if (msgInput.value.trim()) startTyping();
  else stopTyping();
});

// ── Mobile sidebar toggle ──
function openSidebar()  { sidebarEl.classList.add("open"); sidebarOverlay.classList.add("open"); }
function closeSidebar() { sidebarEl.classList.remove("open"); sidebarOverlay.classList.remove("open"); }

sidebarToggleBtn.addEventListener("click", () => {
  sidebarEl.classList.contains("open") ? closeSidebar() : openSidebar();
});
sidebarCloseBtn.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

logoutBtn.addEventListener("click", () => {
  clearCachedUsername();
  location.reload();
});

// ── Socket events ──

// History replay when joining a room
socket.on("room_history", (messages) => {
  if (!messages.length) return;
  appendMessage({ text: `— last ${messages.length} messages —`, system: true });
  messages.forEach((msg) => {
    const own = msg.username === myName;
    appendMessage({ ...msg, own, historic: true });
  });
  appendMessage({ text: "— now —", system: true });
});

socket.on("chat_message", (data) => {
  const own = data.username === myName;
  appendMessage({ ...data, own });
});

socket.on("system_message", (data) => {
  appendMessage({ text: data.text, timestamp: data.timestamp, system: true });
});

socket.on("user_count", (count) => {
  userCountEl.textContent = count;
});

socket.on("room_list", (rooms) => {
  renderRoomList(rooms);
});

socket.on("user_typing", ({ username, isTyping }) => {
  if (username === myName) return;
  if (isTyping) typingUsers.add(username);
  else typingUsers.delete(username);
  updateTypingIndicator();
});

socket.on("disconnect", () => {
  appendMessage({ text: "Connection lost. Reconnecting…", system: true });
});

socket.on("connect", () => {
  if (currentRoom && myName) {
    appendMessage({ text: "Reconnected.", system: true });
  }
});
