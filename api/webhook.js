// api/webhook.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body;
    if (!body.message) return res.status(200).send("No message");

    const chatId = body.message.chat.id;
    const text = body.message.text || body.message.caption || "";
    const photo = body.message.photo || [];

    // Send typing action
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    let imageUrl = "";
    if (photo.length > 0) {
      // Get the highest quality photo
      const fileId = photo[photo.length - 1].file_id;

      // Fetch file info from Telegram
      const fileRes = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json();

      if (fileData.ok && fileData.result?.file_path) {
        imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    // Random user ID
    const randomUser = Math.floor(100000 + Math.random() * 900000);

    // Build Gemini API URL safely
    const apiUrl = new URL("https://api-library-kohi.onrender.com/api/gemini");
    apiUrl.searchParams.set("prompt", text || "Describe this image");
    if (imageUrl) apiUrl.searchParams.set("imageUrl", imageUrl);
    apiUrl.searchParams.set("user", randomUser);

    // Call Gemini API
    const response = await fetch(apiUrl.toString());
    const textResponse = await response.text();

    let cleanMessage = "";

    try {
      const parsed = JSON.parse(textResponse);
      cleanMessage = parsed.data || parsed.message || parsed.response || "";
    } catch {
      cleanMessage = textResponse;
    }

    cleanMessage = cleanMessage
      .replace(/\\n/g, "\n")
      .replace(/\nn/g, "\n")
      .replace(/n\*/g, "\n•")
      .replace(/\*/g, "")
      .replace(/\\u\d+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanMessage) cleanMessage = "⚠️ No response received from Gemini API.";

    // Send clean message
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: cleanMessage,
      }),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}
