// api/webhook.js
export const config = { api: { bodyParser: false } };

// Simple ephemeral memory
const MEMORY = new Map();

// Helper: random numeric ID
function randomNumberString(length = 10) {
return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

// Helper: escape for <pre><code>
function escapeHtml(text) {
return text
? text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">")
: "";
}

// Helper: detect if user asks for code
function isCodeRequest(prompt) {
if (!prompt) return false;
const keywords = ["code", "function", "script", "example", "show me", "create"];
return keywords.some((k) => prompt.toLowerCase().includes(k));
}

// Helper: split Telegram-safe messages
function splitMessage(text, max = 3800) {
const chunks = [];
for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
return chunks;
}

// Upload image to telegra.ph for public access
async function uploadToTelegraph(fileUrl) {
try {
const fileRes = await fetch(fileUrl);
const buffer = await fileRes.arrayBuffer();
const form = new FormData();
form.append("file", Buffer.from(buffer), { filename: "image.jpg" });

```
const uploadRes = await fetch("https://telegra.ph/upload", {
  method: "POST",
  body: form,
});
const json = await uploadRes.json();
if (Array.isArray(json) && json[0]?.src) {
  return "https://telegra.ph" + json[0].src;
}
```

} catch (err) {
console.error("Telegraph upload failed:", err);
}
return "";
}

// Memory handling
function memoryAppend(user, msg) {
const arr = MEMORY.get(user) || [];
arr.push(msg);
if (arr.length > 10) arr.shift();
MEMORY.set(user, arr);
}

function memoryGet(user) {
return (MEMORY.get(user) || []).join("\n");
}

export default async function handler(req, res) {
try {
if (req.method !== "POST") return res.status(405).end();

```
const chunks = [];
for await (const c of req) chunks.push(c);
const raw = Buffer.concat(chunks).toString();
let body;
try {
  body = JSON.parse(raw);
} catch {
  return res.status(200).end();
}

const msg = body.message;
if (!msg) return res.status(200).end();

const chatId = msg.chat.id;
const text = msg.text || msg.caption || "";
const userId = String(msg.from?.id || chatId);
const photos = msg.photo || [];

// Typing...
await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, action: "typing" }),
});

// Commands
if (text === "/start") {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "👋 Hi! I'm your AI assistant.\n\nSend text or an image with a caption to analyze it.",
    }),
  });
  return res.status(200).end();
}

if (text === "/help") {
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "💡 *Help:*\n- Send text for chat\n- Send image + caption for image analysis\n- I detect code and format it automatically.",
      parse_mode: "Markdown",
    }),
  });
  return res.status(200).end();
}

if (text === "/clear_memory") {
  MEMORY.delete(userId);
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "✅ Memory cleared.",
    }),
  });
  return res.status(200).end();
}

// Memory context
const history = memoryGet(userId);
let prompt = history ? `${history}\nUser: ${text}` : text;

// Handle image
let imageUrl = "";
if (photos.length > 0) {
  const fileId = photos.at(-1).file_id;
  const fileInfo = await fetch(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
  ).then((r) => r.json());
  if (fileInfo.ok) {
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.result.file_path}`;
    imageUrl = await uploadToTelegraph(fileUrl);
  }
}

// Build API request
const apiBase = process.env.GEMINI_API_URL || "https://api-library-kohi.onrender.com/api/gemini";
const userRand = randomNumberString(8);
const url = new URL(apiBase);
url.searchParams.set("prompt", prompt || "Describe this image");
if (imageUrl) url.searchParams.set("imageUrl", imageUrl);
url.searchParams.set("user", userRand);

const aiRes = await fetch(url.toString());
const rawText = await aiRes.text();

let reply = "";
try {
  const json = JSON.parse(rawText);
  reply = json.data || json.response || json.message || rawText;
} catch {
  reply = rawText;
}

if (!reply) reply = "⚠️ No response received from Gemini API.";

// Update memory
memoryAppend(userId, `User: ${text}`);
memoryAppend(userId, `Bot: ${reply}`);

// Send message — code block or normal
if (isCodeRequest(text)) {
  const escaped = escapeHtml(reply);
  for (const part of splitMessage(escaped)) {
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
} else {
  for (const part of splitMessage(reply)) {
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: part }),
    });
  }
}

res.status(200).end();
```

} catch (err) {
console.error("Webhook error:", err);
res.status(500).end();
}
}
  
