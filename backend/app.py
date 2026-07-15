"""
Black GPT — Backend
Flask + LangGraph + LangChain (Groq) + ChromaDB (memory) + HuggingFace embeddings
Streaming response support (ChatGPT jaisa line-by-line output)
"""

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
import os
import sys
import uuid
import logging
from datetime import datetime
from typing import TypedDict, List

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END

from sentence_transformers import SentenceTransformer
import chromadb

# ---------------------------------------------------
# 1) LOGGING SETUP
# ---------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("BlackGPT")

# ---------------------------------------------------
# 2) ENVIRONMENT SETUP
# ---------------------------------------------------
load_dotenv()


if os.getenv("LANGCHAIN_TRACING_V2") == "true":
    logger.info(f"LangSmith tracing ON — Project: {os.getenv('LANGCHAIN_PROJECT')}")
else:
    logger.info("LangSmith tracing OFF")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

if not GROQ_API_KEY:
    logger.error("GROQ_API_KEY .env file me nahi mili! Server band kar raha hu.")
    logger.error("Fix: backend/.env file banao aur GROQ_API_KEY=your_key daalo")
    sys.exit(1)

# ---------------------------------------------------
# 3) FLASK APP SETUP
# ---------------------------------------------------
app = Flask(__name__)
CORS(app)

MAX_MESSAGE_LENGTH = 4000
MAX_RECENT_HISTORY = 10
MAX_MEMORY_RESULTS = 3

# ---------------------------------------------------
# 4) LLM SETUP (Groq via LangChain)
# ---------------------------------------------------
llm = ChatGroq(
    api_key=GROQ_API_KEY,
    model=GROQ_MODEL,
    temperature=0.7,
    max_tokens=1024,
    timeout=30,
)

# ---------------------------------------------------
# 5) MEMORY SETUP (HuggingFace Embeddings + ChromaDB)
# ---------------------------------------------------
logger.info("Embedding model load ho raha hai (pehli baar thoda time lagega)...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")

chroma_client = chromadb.PersistentClient(path="chroma_db")
collection = chroma_client.get_or_create_collection(name="chat_memory")

recent_chats: dict[str, list[dict]] = {}

logger.info("Black GPT backend ready hai!")


def save_to_memory(session_id: str, role: str, text: str) -> None:
    try:
        embedding = embedder.encode(text).tolist()
        collection.add(
            ids=[str(uuid.uuid4())],
            embeddings=[embedding],
            documents=[text],
            metadatas=[{
                "session_id": session_id,
                "role": role,
                "timestamp": datetime.utcnow().isoformat(),
            }],
        )
    except Exception:
        logger.exception("ChromaDB me save karte waqt error aaya")


def get_relevant_memory(session_id: str, query: str, n_results: int = MAX_MEMORY_RESULTS) -> List[str]:
    try:
        query_embedding = embedder.encode(query).tolist()
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where={"session_id": session_id},
        )
        return results.get("documents", [[]])[0]
    except Exception:
        logger.exception("ChromaDB se memory fetch karte waqt error aaya")
        return []


def clear_session_memory(session_id: str) -> None:
    recent_chats.pop(session_id, None)
    try:
        collection.delete(where={"session_id": session_id})
    except Exception:
        logger.exception("ChromaDB se session memory clear karte waqt error aaya")


# ---------------------------------------------------
# 6) LANGGRAPH — sirf non-streaming helper endpoints (title gen) ke liye use hota hai
# ---------------------------------------------------

class ChatState(TypedDict):
    session_id: str
    user_message: str
    relevant_context: List[str]
    ai_reply: str


def fetch_memory_node(state: ChatState) -> ChatState:
    state["relevant_context"] = get_relevant_memory(state["session_id"], state["user_message"])
    return state


def generate_reply_node(state: ChatState) -> ChatState:
    session_id = state["session_id"]
    context_text = (
        "\n".join(f"- {c}" for c in state["relevant_context"])
        if state["relevant_context"]
        else "No relevant past context found."
    )
    system_prompt = (
        "You are Black GPT, a helpful and friendly AI assistant.\n"
        "Always reply in the SAME language and style the user writes in "
        "(English -> English, Hindi/Hinglish -> Hindi/Hinglish).\n"
        "Keep answers clear, concise, and well-formatted.\n\n"
        f"Relevant memory from earlier in this conversation:\n{context_text}"
    )
    messages = [SystemMessage(content=system_prompt)]
    history = recent_chats.get(session_id, [])
    for msg in history[-MAX_RECENT_HISTORY:]:
        cls = HumanMessage if msg["role"] == "user" else AIMessage
        messages.append(cls(content=msg["content"]))
    messages.append(HumanMessage(content=state["user_message"]))
    response = llm.invoke(messages)
    state["ai_reply"] = response.content
    return state


def save_memory_node(state: ChatState) -> ChatState:
    session_id = state["session_id"]
    save_to_memory(session_id, "user", state["user_message"])
    save_to_memory(session_id, "assistant", state["ai_reply"])
    recent_chats.setdefault(session_id, [])
    recent_chats[session_id].append({"role": "user", "content": state["user_message"]})
    recent_chats[session_id].append({"role": "assistant", "content": state["ai_reply"]})
    if len(recent_chats[session_id]) > MAX_RECENT_HISTORY * 2:
        recent_chats[session_id] = recent_chats[session_id][-MAX_RECENT_HISTORY * 2:]
    return state


graph = StateGraph(ChatState)
graph.add_node("fetch_memory", fetch_memory_node)
graph.add_node("generate_reply", generate_reply_node)
graph.add_node("save_memory", save_memory_node)
graph.set_entry_point("fetch_memory")
graph.add_edge("fetch_memory", "generate_reply")
graph.add_edge("generate_reply", "save_memory")
graph.add_edge("save_memory", END)

chatbot_graph = graph.compile()

# ---------------------------------------------------
# 7) FLASK ROUTES
# ---------------------------------------------------

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "ok",
        "message": "Black GPT backend chal raha hai ✅",
        "model": GROQ_MODEL,
    })


@app.route("/chat", methods=["POST"])
def chat():
    """Main chat endpoint — STREAMING response deta hai (ChatGPT jaisa, chunk-by-chunk)."""
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    session_id = data.get("session_id") or "default"

    if not user_message:
        return jsonify({"error": "Message khali nahi ho sakta."}), 400

    if len(user_message) > MAX_MESSAGE_LENGTH:
        return jsonify({"error": f"Message bahut lamba hai (max {MAX_MESSAGE_LENGTH} characters)."}), 400

    logger.info(f"[{session_id}] User: {user_message[:80]}")

    def generate_stream():
        full_reply = ""
        try:
            relevant_context = get_relevant_memory(session_id, user_message)
            context_text = (
                "\n".join(f"- {c}" for c in relevant_context)
                if relevant_context
                else "No relevant past context found."
            )

            system_prompt = (
                "You are Black GPT, a helpful and friendly AI assistant.\n"
                "Always reply in the SAME language and style the user writes in "
                "(English -> English, Hindi/Hinglish -> Hindi/Hinglish).\n"
                "Keep answers clear, concise, and well-formatted.\n\n"
                f"Relevant memory from earlier in this conversation:\n{context_text}"
            )

            messages = [SystemMessage(content=system_prompt)]

            history = recent_chats.get(session_id, [])
            for msg in history[-MAX_RECENT_HISTORY:]:
                cls = HumanMessage if msg["role"] == "user" else AIMessage
                messages.append(cls(content=msg["content"]))

            messages.append(HumanMessage(content=user_message))

            for chunk in llm.stream(messages):
                token = chunk.content
                if token:
                    full_reply += token
                    yield token

            save_to_memory(session_id, "user", user_message)
            save_to_memory(session_id, "assistant", full_reply)

            recent_chats.setdefault(session_id, [])
            recent_chats[session_id].append({"role": "user", "content": user_message})
            recent_chats[session_id].append({"role": "assistant", "content": full_reply})

            if len(recent_chats[session_id]) > MAX_RECENT_HISTORY * 2:
                recent_chats[session_id] = recent_chats[session_id][-MAX_RECENT_HISTORY * 2:]

            logger.info(f"[{session_id}] Bot: {full_reply[:80]}")

        except Exception as e:
            error_msg = str(e).lower()
            logger.exception(f"[{session_id}] Streaming me error aaya")

            if "api_key" in error_msg or "authentication" in error_msg or "401" in error_msg:
                yield "\n\n⚠️ Groq API key galat hai ya missing hai. .env file check karo."
            elif "rate limit" in error_msg or "429" in error_msg:
                yield "\n\n⚠️ Bahut zyada requests ho gayi. Thodi der ruk kar try karo."
            else:
                yield f"\n\n⚠️ Server me kuch gadbad ho gayi: {str(e)}"

    return Response(stream_with_context(generate_stream()), mimetype="text/plain")


@app.route("/generate-title", methods=["POST"])
def generate_title():
    """User ke message + AI reply se ek chhota meaningful title banata hai (ChatGPT jaisa)."""
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    ai_reply = (data.get("reply") or "").strip()
    session_id = data.get("session_id") or ""

    if not user_message:
        return jsonify({"title": "New Chat"})

    try:
        title_prompt = [
            SystemMessage(content=(
                "Summarize this conversation in a short chat title, 3 to 5 words maximum. "
                "Do not use quotes. Do not add punctuation at the end. "
                "Do not add any prefix like 'Title:'. Reply with ONLY the title text."
            )),
            HumanMessage(content=f"User said: {user_message}\nAssistant replied: {ai_reply[:300]}")
        ]

        response = llm.invoke(title_prompt)
        title = (response.content or "").strip().strip('"').strip("'").strip()

        if not title:
            raise ValueError("LLM ne empty title return kiya")

        if len(title) > 50:
            title = title[:50].rsplit(" ", 1)[0] + "..."

        logger.info(f"[{session_id}] Title generated: '{title}'")
        return jsonify({"title": title})

    except Exception as e:
        logger.exception(f"[{session_id}] Title generate karte waqt error aaya: {e}")
        # Smart fallback: seedha message copy nahi, sirf pehle 4 words capitalize
        words = user_message.split()[:4]
        fallback = " ".join(words).capitalize()
        if len(user_message.split()) > 4:
            fallback += "..."
        return jsonify({"title": fallback or "New Chat"})


@app.route("/new-chat", methods=["POST"])
def new_chat():
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id") or "default"

    clear_session_memory(session_id)
    logger.info(f"[{session_id}] Naya chat shuru hua, memory clear ho gayi.")

    return jsonify({"status": "Naya chat shuru ho gaya!"})


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Ye endpoint exist nahi karta."}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error."}), 500


# ---------------------------------------------------
# 8) RUN SERVER
# ---------------------------------------------------
if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 5000))
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(debug=debug_mode, host=host, port=port)