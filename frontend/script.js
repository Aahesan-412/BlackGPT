const API_URL = "https://blackgpt-a5xz.onrender.com/chat";
const NEW_CHAT_URL = "https://blackgpt-a5xz.onrender.com/new-chat";
const TITLE_URL = "https://blackgpt-a5xz.onrender.com/generate-title";
const STORAGE_KEY = "blackgpt_conversations";

const chatWindow = document.getElementById("chatWindow");
const welcomeScreen = document.getElementById("welcomeScreen");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const menuBtn = document.getElementById("menuBtn");
const newChatBtn = document.getElementById("newChatBtn");
const historyList = document.getElementById("historyList");
const contextMenu = document.getElementById("contextMenu");
const ctxRename = document.getElementById("ctxRename");
const ctxDelete = document.getElementById("ctxDelete");

const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const fileChip = document.getElementById("fileChip");
const fileChipName = document.getElementById("fileChipName");
const fileChipRemove = document.getElementById("fileChipRemove");
const micBtn = document.getElementById("micBtn");

let isSending = false;
let conversations = [];
let activeConversationId = null;
let contextTargetId = null;
let attachedFileName = null;

// ---------- localStorage ----------
function loadConversations() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      conversations = data.conversations || [];
      activeConversationId = data.activeConversationId || null;
    } catch {
      conversations = [];
    }
  }
}

function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ conversations, activeConversationId }));
}

function generateId() {
  return "conv_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function createConversation() {
  const conv = { id: generateId(), title: "New Chat", messages: [] };
  conversations.unshift(conv);
  activeConversationId = conv.id;
  saveConversations();
  renderHistoryList();
  renderChatWindow();
}

function getActiveConversation() {
  return conversations.find((c) => c.id === activeConversationId);
}

// ---------- Sidebar render ----------
function renderHistoryList() {
  historyList.innerHTML = "";
  conversations.forEach((conv) => {
    const item = document.createElement("div");
    item.className = "history-item" + (conv.id === activeConversationId ? " active" : "");
    item.dataset.id = conv.id;
    item.textContent = conv.title;

    item.addEventListener("click", () => switchConversation(conv.id));
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openContextMenu(e.pageX, e.pageY, conv.id);
    });

    historyList.appendChild(item);
  });
}

function switchConversation(id) {
  activeConversationId = id;
  saveConversations();
  renderHistoryList();
  renderChatWindow();
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
}

// ---------- Right-click context menu ----------
function openContextMenu(x, y, convId) {
  contextTargetId = convId;
  contextMenu.style.top = y + "px";
  contextMenu.style.left = x + "px";
  contextMenu.classList.add("show");
}
function closeContextMenu() {
  contextMenu.classList.remove("show");
  contextTargetId = null;
}
document.addEventListener("click", closeContextMenu);
document.addEventListener("scroll", closeContextMenu, true);

ctxRename.addEventListener("click", () => {
  if (!contextTargetId) return;
  renameConversation(contextTargetId);
  closeContextMenu();
});
ctxDelete.addEventListener("click", () => {
  if (!contextTargetId) return;
  deleteConversation(contextTargetId);
  closeContextMenu();
});

function renameConversation(id) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  const item = historyList.querySelector(`[data-id="${id}"]`);
  if (!item) return;

  const input = document.createElement("input");
  input.className = "history-title-input";
  input.value = conv.title;
  item.textContent = "";
  item.appendChild(input);
  input.focus();
  input.select();

  function save() {
    conv.title = input.value.trim() || conv.title;
    saveConversations();
    renderHistoryList();
  }
  input.addEventListener("blur", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") renderHistoryList();
  });
}

async function deleteConversation(id) {
  if (!confirm("Ye chat delete karna hai?")) return;
  try {
    await fetch(NEW_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: id }),
    });
  } catch (err) {
    console.warn("Backend memory clear nahi ho payi:", err);
  }

  conversations = conversations.filter((c) => c.id !== id);
  if (activeConversationId === id) {
    activeConversationId = conversations.length > 0 ? conversations[0].id : null;
  }
  saveConversations();
  renderHistoryList();

  if (!activeConversationId) createConversation();
  else renderChatWindow();
}

// ---------- Chat window ----------
function renderChatWindow() {
  const conv = getActiveConversation();
  chatWindow.innerHTML = "";
  if (!conv || conv.messages.length === 0) {
    chatWindow.appendChild(welcomeScreen);
    welcomeScreen.style.display = "block";
    return;
  }
  conv.messages.forEach((msg) => addMessageToDOM(msg.text, msg.role));
}

function addMessageToDOM(text, sender) {
  welcomeScreen.style.display = "none";
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return bubble; // streaming ke liye zaroori — ismein hi live text bharega
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "message-row bot";
  row.id = "typingRow";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  row.appendChild(bubble);
  chatWindow.appendChild(row);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function removeTyping() {
  const typingRow = document.getElementById("typingRow");
  if (typingRow) typingRow.remove();
}

function setLoadingState(loading) {
  isSending = loading;
  sendBtn.disabled = loading;
  userInput.disabled = loading;
}

// ---------- Attach file ----------
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    attachedFileName = fileInput.files[0].name;
    fileChipName.textContent = "📎 " + attachedFileName;
    fileChip.style.display = "flex";
  }
});

fileChipRemove.addEventListener("click", () => {
  attachedFileName = null;
  fileInput.value = "";
  fileChip.style.display = "none";
});

// ---------- Mic (Web Speech API) ----------
let recognition = null;
let isRecording = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-IN";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value += (userInput.value ? " " : "") + transcript;
    userInput.dispatchEvent(new Event("input"));
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove("recording");
  };

  recognition.onerror = () => {
    isRecording = false;
    micBtn.classList.remove("recording");
  };
} else {
  micBtn.title = "Voice input is browser me supported nahi hai (Chrome try karo)";
}

micBtn.addEventListener("click", () => {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
    isRecording = false;
    micBtn.classList.remove("recording");
  } else {
    recognition.start();
    isRecording = true;
    micBtn.classList.add("recording");
  }
});

// ---------- AI se meaningful chat title banwana ----------
async function generateConversationTitle(convId, userMessage, aiReply) {
  console.log("Title generation triggered for conversation:", convId); // Debugging line
  try {
    const response = await fetch(TITLE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, reply: aiReply, session_id: convId }),
    });

    const data = await response.json();
    console.log("Response from title API:", data); // Debugging line
    
    const conv = conversations.find((c) => c.id === convId);
    if (conv && data.title) {
      conv.title = data.title;
      saveConversations();
      renderHistoryList();
      console.log("Title successfully updated to:", data.title);
    }
  } catch (err) {
    console.warn("Title generate nahi ho paya:", err);
  }
}
// ---------- Message bhejna (STREAMING) ----------
// ---------- Message bhejna (STREAMING) ----------

async function sendMessage() {
  console.log("SEND MESSAGE FUNCTION CALLED");
  let text = userInput.value.trim();
  if (attachedFileName) {
    text = text ? `${text}\n\n📎 Attached: ${attachedFileName}` : `📎 Attached: ${attachedFileName}`;
  }
  if (!text || isSending) return;

  let conv = getActiveConversation();
  if (!conv) {
    createConversation();
    conv = getActiveConversation();
  }

  // FORCE CHECK: Agar title abhi bhi "New Chat" hai, to hume title generate karna hai
  const needsTitleUpdate = (conv.title === "New Chat");

  conv.messages.push({ role: "user", text });
  addMessageToDOM(text, "user");
  renderHistoryList();
  saveConversations();


  userInput.value = "";
  userInput.style.height = "auto";
  attachedFileName = null;
  fileInput.value = "";
  fileChip.style.display = "none";

  setLoadingState(true);
  showTyping();

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: conv.id }),
    });

    removeTyping();

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => ({}));
      const errText = "⚠️ " + (data.error || "Kuch gadbad ho gayi, dobara try karo.");
      conv.messages.push({ role: "bot", text: errText });
      addMessageToDOM(errText, "bot");
      saveConversations();
      return;
    }

    // ---- Streaming reader ----
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const botBubble = addMessageToDOM("", "bot");
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      fullText += chunkText;
      botBubble.textContent = fullText;
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    conv.messages.push({ role: "bot", text: fullText });
    saveConversations();

    // Agar chat ka title abhi tak default "New Chat" hai, to use generate karo!
    if (needsTitleUpdate) {
      console.log("Calling title generator because title is 'New Chat'...");
      setTimeout(() => {
        generateConversationTitle(conv.id, text, fullText);
      }, 500);
    }

  } catch (err) {
    removeTyping();
    const errText = "⚠️ Backend se connect nahi ho paya. Flask server chal raha hai?";
    conv.messages.push({ role: "bot", text: errText });
    addMessageToDOM(errText, "bot");
    saveConversations();
  } finally {
    setLoadingState(false);
    userInput.focus();
  }
}

// ---------- Event Listeners ----------
userInput.addEventListener("input", () => {
  userInput.style.height = "auto";
  userInput.style.height = userInput.scrollHeight + "px";
});

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  overlay.classList.toggle("show");
});
overlay.addEventListener("click", () => {
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
});

newChatBtn.addEventListener("click", () => {
  createConversation();
  sidebar.classList.remove("open");
  overlay.classList.remove("show");
});

window.addEventListener("DOMContentLoaded", () => {
  loadConversations();
  if (conversations.length === 0) {
    createConversation();
  } else {
    if (!getActiveConversation()) activeConversationId = conversations[0].id;
    renderHistoryList();
    renderChatWindow();
  }
});