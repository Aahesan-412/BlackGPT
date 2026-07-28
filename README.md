# ⚡ Black GPT

A ChatGPT-style AI-powered conversational chatbot — built from scratch, fully responsive, context-aware, and deployed live in production using entirely free and open-source tools.

🔗 **Live Demo:** https://blacckgpt.netlify.app/
🔗 **Backend API:** https://blackgpt-a5xz.onrender.com
💻 **Source Code:** https://github.com/Aahesan-412/BlackGPT

---

## 📖 About the Project

Black GPT is a full-stack conversational AI application that replicates the core ChatGPT experience — natural language understanding, real-time streaming responses, conversation memory, editable messages, and a clean, ChatGPT-inspired interface.

It was built as a technical assessment project with a specific constraint: build a production-quality AI chatbot using only **free and open-source tools**, instead of paid APIs like OpenAI or Anthropic. Every layer of the stack — the language model, the frontend, and the hosting infrastructure — runs entirely on free tiers, while still delivering a fast, real-world, production-grade user experience.

The project covers the full lifecycle of building an AI product: designing the conversation architecture, implementing streaming responses, handling memory and context, building a responsive UI from scratch, debugging real production issues (CORS, deployment memory limits, response buffering), and deploying it live for public use.

---

## ✨ Features

### Core Chat Experience
- **Conversational AI** — Natural, human-like responses powered by Meta's Llama 3.3 (70B parameter model), served through Groq's high-speed inference API
- **Streaming responses** — Replies are generated and displayed in real time as they're produced, rather than waiting for the full response
- **Context-aware memory** — The bot remembers earlier messages within the same conversation, enabling coherent follow-up questions and natural multi-turn dialogue
- **Automatic language matching** — Detects and replies in the same language the user writes in (English, Hindi, or Hinglish) without being explicitly told to

### Conversation Management
- **Auto-generated chat titles** — Every new conversation automatically receives a short, AI-generated title summarizing its content, instead of displaying the raw first message
- **Rename conversations** — Right-click any chat in the sidebar to rename it inline
- **Delete conversations** — Remove any conversation, with its associated memory cleared from the backend as well
- **Edit sent messages** — Edit any previously sent message; the AI regenerates its response from that point onward, discarding the outdated downstream conversation — the same behavior as ChatGPT and Claude
- **Persistent chat history** — All conversations are saved in the browser's local storage, so they remain available even after closing and reopening the browser, without requiring user accounts or a backend database

### Input & Accessibility
- **Voice input** — Speak messages directly using the browser's built-in speech recognition (Web Speech API)
- **File attachment** — Attach text-based files (.txt, .csv, .py, .js, .md) so the AI can read and respond based on their contents
- **Keyboard shortcuts** — Enter to send, Shift+Enter for a new line, matching standard chat UX conventions

### Interface
- **Fully responsive design** — Optimized layouts and interactions for desktop, tablet, and mobile screens
- **Dark theme UI** — A custom-designed dark interface with an amber accent, inspired by ChatGPT and Claude but visually distinct
- **Typing indicator** — Animated dots shown while the AI is generating a response
- **Collapsible sidebar on mobile** — A hamburger-menu-driven sidebar for small screens

---

## 🛠️ Tech Stack

### Backend
| Tool | Purpose |
|---|---|
| **Python + Flask** | Lightweight web framework used to build the REST API and handle streaming HTTP responses |
| **Groq API (Llama 3.3 70B)** | The language model powering all conversational responses — chosen specifically for its very low-latency inference, which is essential for a real-time chat feel |
| **LangChain** | Structures prompts, manages conversation message objects, and provides a standardized interface to the Groq LLM |
| **LangGraph** | Models the conversation flow as a graph (fetch context → generate reply → save memory), making the request pipeline explicit and easy to extend |
| **LangSmith** | Provides observability into production — traces every LLM call including prompts, responses, and latency, used for debugging issues like malformed titles |
| **Gunicorn** | Production-grade WSGI server used to run the Flask app when deployed |

### Frontend
| Tool | Purpose |
|---|---|
| **HTML, CSS, JavaScript** | Built without any frontend framework, keeping the app lightweight, dependency-free, and fast to load |
| **Fetch API + ReadableStream** | Consumes the backend's streamed responses and renders them incrementally as they arrive |
| **Web Speech API** | Powers the voice input feature natively in the browser, with no external service required |
| **LocalStorage API** | Stores conversation history client-side, so each user's chats persist privately on their own device without a backend database |

### Deployment
| Platform | Role |
|---|---|
| **Render** | Hosts the Flask backend as a live, always-accessible web service |
| **Netlify** | Hosts the static frontend independently from the backend, deployed via continuous deployment from GitHub |

---

## 🚀 How It Works (Architecture)

1. **User sends a message** — typed or spoken — through the chat interface.
2. **Frontend sends the request** to the Flask backend, including the message and a unique session ID identifying that conversation.
3. **Backend builds a prompt** using LangChain — combining a system prompt (behavior + language-matching instructions), the recent conversation history for that session, and the new message.
4. **The prompt is sent to Groq's LLM**, and the response is streamed back to the client token by token, rendered live in the chat window as it's generated.
5. **On the first exchange of a new conversation**, a second lightweight LLM call is triggered in the background to generate a short, descriptive title for that chat — the sidebar updates automatically once it's ready.
6. **If a user edits a previous message**, the conversation is truncated at that point locally, and a fresh request is sent with the edited message — the AI regenerates its response, and the sidebar/chat view update to reflect the new, shorter history.
7. **The full conversation is stored in the browser's local storage**, keyed by a unique conversation ID, so chats persist across page reloads and browser restarts without needing a backend database or user accounts.
8. **Every LLM call is traced through LangSmith**, giving full visibility into prompts, responses, and performance — this was used throughout development to debug issues like empty AI-generated titles.

---

## 📂 Project Structure

blackgpt/
├── backend/
│ ├── app.py # Flask app — routes, LLM logic, streaming, title generation
│ ├── requirements.txt # Python dependencies
│ └── Procfile # Production start command (Gunicorn)
│
├── frontend/
│ ├── index.html # App layout — sidebar, chat window, input area
│ ├── style.css # Styling, responsive layout, animations
│ └── script.js # Chat logic, streaming, memory, voice input, file attach, message editing
│
└── README.md


---

## 🔌 API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/` | GET | Health check — confirms the backend is live |
| `/chat` | POST | Main chat endpoint — accepts a message and session ID, streams back the AI's response |
| `/generate-title` | POST | Generates a short, meaningful title for a conversation based on its first exchange |
| `/new-chat` | POST | Clears the memory associated with a given session ID (used on delete/new chat) |

---

## 🧩 Key Engineering Decisions

- **No paid APIs** — Groq was chosen over OpenAI specifically because it offers free, high-speed inference on strong open-source models like Llama 3.3.
- **No backend database** — Since chat privacy per-device was a priority and the scope didn't require cross-device sync, conversations are stored in the browser's local storage instead of a server-side database, simplifying the architecture significantly.
- **Streaming over polling** — Responses are streamed using Flask's `Response` with `stream_with_context`, giving a real-time typing effect similar to ChatGPT rather than waiting for the full response.
- **LangGraph for structure** — Even though the conversation logic is relatively simple, LangGraph was used to explicitly model it as a graph (fetch → generate → save), making the flow transparent and straightforward to extend with future steps.

---

## 📌 Known Limitations

- The backend runs on Render's free tier, so the first request after a period of inactivity may take a few extra seconds while the server "wakes up" (cold start).
- Chat history is stored per-browser/device via local storage — it is not synced across devices and is cleared if the browser's site data is cleared.
- File attachment currently supports text-based files only (.txt, .csv, .py, .js, .md); binary formats like PDF or Word documents are not yet supported.
- No user authentication — the app is designed for single-device, private use rather than multi-user accounts.

---

## 📄 License

This project was built as part of a technical assessment and is free to use for reference and learning purposes.