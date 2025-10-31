// api/webhook.js
export const config = { api: { bodyParser: false } };

// Simple in-memory memory store (ephemeral — not persistent across cold starts)
const MEMORY = new Map();

// Helpers
function randomNumberString(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
  return result;
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Decide if a prompt is requesting code (simple heuristic)
function isCodeRequest(prompt) {
  if (!prompt) return false;
  const p = prompt.toLowerCase();
  const keywords = [
    "code",
    "function",
    "class",
    "script",
    "npm",
    "install",
    "python",
    "javascript",
    "typescript",
    "java",
    "c++",
    "c#",
    "ruby",
    "php",
    "bash",
    "sh",
    "dockerfile",
    "docker",
    "kotlin",
    "go ",
    "rust",
    "sql",
    "implement",
    "create",
    "snippet",
    "example",
  ];
  return keywords.some((k) => p.includes(k));
}

// Split long text into Telegram-safe chunks (~4000 chars)
function splitMessage(text, maxLen = 3800) {
  if (!text) return [""];
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks;
}

// Upload telegram file URL bytes to telegra.ph to make publicly accessible
async function uploadToTelegraph(botToken, fileUrl) {
  try {
    const arr = await fetch(fileUrl);
    if (!arr.ok) throw new Error("Failed to download file from Telegram");
    const buffer = await arr.arrayBuffer();
    // Node's global FormData (Node >=18) can accept Buffer
    const form = new FormData();
    form.append("file", Buffer.from(buffer), {
      filename: "image.jpg",
      contentType: "image/jpeg",
    });

    const teleRes = await fetch("https://telegra.ph/upload", {
      method: "POST",
      body: form,
    });
    const teleJson = await teleRes.json();
    if (Array.isArray(teleJson) && teleJson[0]?.src) {
      return "https://telegra.ph" + teleJson[0].src;
    } else {
      console.error("Telegraph upload failed:", teleJson);
      return "";
    }
  } catch (e) {
    console.error("uploadToTelegraph error:", e);
    return "";
  }
}

// Basic memory functions (ephemeral)
function memoryAppend(userKey, text, maxItems = 20) {
  const list = MEMORY.get(userKey) || [];
  list.push({ t: Date.now(), text });
  if (list.length > maxItems) list.shift();
  MEMORY.set(userKey, list);
}
function memoryGet(userKey) {
  return (MEMORY.get(userKey) || []).map((x) => x.text).join("\n");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();

    // Read raw body (Vercel serverless)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    let body = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return res.status(200).end(); // ignore invalid payloads
    }

    const update = body;
    if (!update?.message) return res.status(200).end();

    const message = update.message;
    const chatId = message.chat.id;
    const fromId = message.from?.id || chatId;
    const promptText = (message.text || message.caption || "").trim();
    const photos = message.photo || [];

    // Show typing
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    // Commands
    if (promptText === "/start") {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text:
            "👋 Hi! I’m your ChatGPT-style bot.\n\nSend text or an image + caption (e.g., 'what is this?').\n\nCommands: /start /help /clear_memory",
        }),
      });
      return res.status(200).end();
    }

    if (promptText === "/help") {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text:
            "Usage:\n- Send text to chat with AI.\n- Send an image with a caption to analyze (e.g., 'what is this?').\n- Ask for code and I'll wrap it in a code block.\n- /clear_memory to clear conversation memory (ephemeral).",
        }),
      });
      return res.status(200).end();
    }

    if (promptText === "/clear_memory") {
      MEMORY.delete(String(fromId));
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "✅ Memory cleared (ephemeral)." }),
      });
      return res.status(200).end();
    }

    // Build prompt: include ephemeral memory if any
    const userMemory = memoryGet(String(fromId));
    let prompt = promptText || "";
    if (userMemory) {
      prompt = `Conversation memory:\n${userMemory}\n\nUser: ${prompt}`;
    }

    // If photo present, download Telegram file, upload to telegra.ph and get public URL
    let publicImageUrl = "";
    if (photos.length > 0) {
      const fileId = photos.at(-1).file_id;
      // get file path
      const fileInfoRes = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileInfo = await fileInfoRes.json();
      if (fileInfo.ok && fileInfo.result?.file_path) {
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.result.file_path}`;
        publicImageUrl = await uploadToTelegraph(process.env.BOT_TOKEN, fileUrl);
      }
    }

    // Generate numeric user id
    const user = String(Math.floor(100000 + Math.random() * 900000));

    // Decide which AI provider to call
    const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();

    let aiReply = "";
    if (AI_PROVIDER === "openai") {
      // OpenAI flow (if you want to use it)
      if (!process.env.OPENAI_API_KEY) {
        aiReply = "⚠️ OPENAI_API_KEY is not set in environment variables.";
      } else {
        // Build OpenAI prompt (simple single-turn)
        const openPrompt = prompt || (publicImageUrl ? `Describe this image: ${publicImageUrl}` : "");
        // Call OpenAI completion/chat API (example with Chat Completions)
        const openRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [{ role: "user", content: openPrompt }],
            max_tokens: 800,
          }),
        });
        const openJson = await openRes.json();
        aiReply = openJson?.choices?.[0]?.message?.content || JSON.stringify(openJson);
      }
    } else {
      // Default: Gemini / custom endpoint (expects ?prompt=&imageUrl=&user=)
      const geminiBase = process.env.GEMINI_API_URL || "https://api-library-kohi.onrender.com/api/gemini";
      // Build URL safely
      const url = new URL(geminiBase);
      url.searchParams.set("prompt", prompt || (publicImageUrl ? `Describe this image` : ""));
      if (publicImageUrl) url.searchParams.set("imageUrl", publicImageUrl);
      url.searchParams.set("user", user);

      const gemRes = await fetch(url.toString(), { method: "GET" });
      const raw = await gemRes.text();
      try {
        const parsed = JSON.parse(raw);
        aiReply = parsed.data || parsed.response || parsed.message || raw;
      } catch {
        aiReply = raw;
      }
    }

    aiReply = (aiReply || "").toString();

    // Save to ephemeral memory (only if prompt non-empty)
    if (promptText) memoryAppend(String(fromId), `${promptText}`);

    // If code request: send as code block using HTML (<pre><code>)
    if (isCodeRequest(promptText)) {
      // Escape HTML inside code block
      const escaped = escapeHtml(aiReply);
      const parts = splitMessage(escaped, 3800);
      for (const part of parts) {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `<pre><code>${part}</code></pre>`,
            parse_mode: "HTML",
          }),
        });
      }
      return res.status(200).end();
    }

    // Normal message: send plain text, split if long
    const cleaned = aiReply
      .replace(/\\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const chunks = splitMessage(cleaned, 3800);
    for (const c of chunks) {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: c }),
      });
    }

    return res.status(200).end();
  } catch (err) {
    console.error("Webhook Error:", err);
    // If possible, notify the chat user about the error (best-effort)
    try {
      const chatId = (req.body?.message?.chat?.id) || null;
      if (chatId) {
        await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "⚠️ Internal error processing your message.",
          }),
        });
      }
    } catch (e) {
      console.error("Failed to send error message to user:", e);
    }
    return res.status(500).end();
  }
  }
