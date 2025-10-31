export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body;

    if (!body.message) {
      return res.status(200).send("No message");
    }

    const chatId = body.message.chat.id;
    const text = body.message.text || "";
    const photo = body.message.photo || [];
    const caption = body.message.caption || "";

    // Base Gemini API
    const baseUrl = "https://api-library-kohi.onrender.com/api/gemini";
    let prompt = encodeURIComponent(text || caption || "Describe this image");
    let imageUrl = "";

    // If the user sent an image
    if (photo.length > 0) {
      const fileId = photo[photo.length - 1].file_id;
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileResponse.json();
      const filePath = fileData.result.file_path;
      imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
    }

    // Generate random user (numbers only)
    const randomUser = Math.floor(100000 + Math.random() * 900000);

    // Construct Gemini API URL
    const apiUrl = `${baseUrl}?prompt=${prompt}&imageUrl=${imageUrl}&user=${randomUser}`;

    // Fetch response from Gemini API
    const response = await fetch(apiUrl);
    const textResponse = await response.text();

    // Send raw response for debugging
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🧾 *Gemini Raw Response:*\n\n\`\`\`\n${textResponse.slice(0, 3500)}\n\`\`\``,
        parse_mode: "MarkdownV2",
      }),
    });

    // Try to parse JSON
    let data;
    try {
      data = JSON.parse(textResponse);
    } catch {
      data = { status: false, data: textResponse };
    }

    const replyText =
      data?.data || data?.response || "⚠️ No response received from Gemini API.";

    const reply = escapeMarkdown(replyText);

    // Send final Gemini result to Telegram
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `\`\`\`\n${reply}\n\`\`\``,
        parse_mode: "MarkdownV2",
      }),
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Escape Markdown to avoid Telegram formatting errors
function escapeMarkdown(text) {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
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
