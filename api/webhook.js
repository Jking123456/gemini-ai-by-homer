import FormData from "form-data";
import fetch from "node-fetch";

export const config = { api: { bodyParser: false } };

// Helper: random number string
function randomNumberString(length = 10) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}

// Helper: check if message asks for code
function isCodeRequest(prompt) {
  if (!prompt) return false;
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

// Helper: upload Telegram photo to freeimage API
async function uploadToFreeImage(fileUrl) {
  try {
    const fileRes = await fetch(fileUrl);
    const buffer = await fileRes.arrayBuffer();

    const form = new FormData();
    form.append("file", Buffer.from(buffer), "upload.jpg");

    const res = await fetch("https://api-library-kohi.onrender.com/api/freeimage", {
      method: "POST",
      body: form,
    });

    const json = await res.json();
    if (json?.status && json.data?.url) {
      return json.data.url;
    }
  } catch (err) {
    console.error("❌ Image upload failed:", err);
  }
  return "";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST")
      return res.status(405).json({ error: "Method Not Allowed" });

    // Read raw Telegram body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();

    let body = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      return res.status(200).end();
    }

    if (!body.message) return res.status(200).end();

    const msg = body.message;
    const chatId = msg.chat.id;
    const user = randomNumberString(10);
    const prompt = msg.text || msg.caption || "";
    const photos = msg.photo || [];

    // Send typing action
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    // Handle /start
    if (prompt === "/start") {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "👋 Hi! I’m your Gemini bot.\nSend me text or an image with a caption to analyze it.",
        }),
      });
      return res.status(200).end();
    }

    // Handle photo uploads
    let imageUrl = "";
    if (photos.length > 0) {
      const fileId = photos.at(-1).file_id;
      const fileInfo = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      ).then((r) => r.json());

      if (fileInfo.ok && fileInfo.result?.file_path) {
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.result.file_path}`;
        imageUrl = await uploadToFreeImage(fileUrl); // Upload to freeimage
      }
    }

    // Call Gemini API
    const apiUrl = new URL("https://api-library-kohi.onrender.com/api/gemini");
    apiUrl.searchParams.set("prompt", prompt || "Describe this image");
    if (imageUrl) apiUrl.searchParams.set("imageUrl", imageUrl);
    apiUrl.searchParams.set("user", user);

    const response = await fetch(apiUrl);
    const data = await response.json();

    let reply = data.data || data.response || "⚠️ No response received from Gemini API.";

    // Format as code if needed
    const sendBody = {
      chat_id: chatId,
      text: reply,
    };

    if (isCodeRequest(prompt)) {
      sendBody.text = `<pre><code>${reply
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</code></pre>`;
      sendBody.parse_mode = "HTML";
    }

    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendBody),
    });

    return res.status(200).end();
  } catch (error) {
    console.error("❌ Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
      }
