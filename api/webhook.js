export const config = {
  api: {
    bodyParser: false,
  },
};

function randomNumberString(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
  return result;
}

// Escape MarkdownV2 special characters
function escapeMarkdown(text) {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/-/g, "\\-")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    // Parse Telegram raw JSON safely
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

    const chatId = body.message.chat.id;
    const user = randomNumberString(10);
    let prompt = "";
    let imageUrl = "";

    if (body.message.text) prompt = body.message.text;

    // Handle photo
    if (body.message.photo?.length > 0) {
      const fileId = body.message.photo.at(-1).file_id;
      const fileRes = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json();
      imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileData.result.file_path}`;
    }

    // Typing indicator
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    // Handle /start command
    if (prompt === "/start") {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "ðŸ‘‹ *Hi!* Iâ€™m your *Google Gemini Created by Homer Rebatis.*\n\nSend me a message or an image to analyze.",
          parse_mode: "Markdown",
        }),
      });
      return res.status(200).end();
    }

    // Call your Gemini API
    const apiUrl = `https://api-library-kohi.onrender.com/api/gemini?prompt=${encodeURIComponent(
      prompt
    )}&imageUrl=${encodeURIComponent(imageUrl)}&user=${user}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    const rawReply =
      data.data || data.response || "âš ï¸ No response received from Gemini API.";

    const reply = escapeMarkdown(rawReply);

    // Send reply as a code block
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `\`\`\`\n${reply}\n\`\`\``,
        parse_mode: "MarkdownV2",
      }),
    });

    return res.status(200).end();
  } catch (error) {
    console.error("âŒ Webhook Error:", error);
    res.status(500).json({ error: error.message });
  }
}
