// api/webhook.js
export const config = {
  api: { bodyParser: false },
};

function randomNumberString(length = 10) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

// Detect if prompt asks for code (supports all major languages)
function isCodePrompt(prompt = "") {
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
    "go",
    "rust",
    "sql",
    "implement",
    "create",
    "snippet",
    "example",
  ];
  return keywords.some((k) => prompt.toLowerCase().includes(k));
}

// Escape HTML characters for Telegram
function escapeHtml(text = "") {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Split long messages safely
function splitMessage(text, max = 3800) {
  const parts = [];
  for (let i = 0; i < text.length; i += max) parts.push(text.slice(i, i + max));
  return parts;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method Not Allowed" });

    // Parse raw Telegram update
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();

    let body = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return res.status(200).end();
    }

    const msg = body.message;
    if (!msg) return res.status(200).end();

    const chatId = msg.chat.id;
    const user = randomNumberString(10);
    let prompt = msg.text || msg.caption || "";
    let imageUrl = "";

    // Handle image input
    if (msg.photo?.length > 0) {
      const fileId = msg.photo.at(-1).file_id;
      const fileRes = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json();
      imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileData.result.file_path}`;
    }

    // Show typing
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    // /start command
    if (prompt === "/start") {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "👋 Hi! I’m your AI bot. I can chat, analyze images, and generate code for *any* language with formatting!",
          parse_mode: "Markdown",
        }),
      });
      return res.status(200).end();
    }

    // Call Gemini API
    const apiUrl = `https://api-library-kohi.onrender.com/api/gemini?prompt=${encodeURIComponent(
      prompt
    )}&imageUrl=${encodeURIComponent(imageUrl)}&user=${user}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    const reply =
      data.data ||
      data.response ||
      data.message ||
      "⚠️ No response received from Gemini API.";

    // Format message based on content
    if (isCodePrompt(prompt)) {
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
          body: JSON.stringify({
            chat_id: chatId,
            text: part,
          }),
        });
      }
    }

    res.status(200).end();
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
                  }
    
