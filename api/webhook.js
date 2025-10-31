function randomNumberString(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) result += Math.floor(Math.random() * 10);
  return result;
}

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
    if (req.method !== "POST") return res.status(405).end();

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();

    const body = JSON.parse(rawBody || "{}");
    if (!body.message) return res.status(200).end();

    const chatId = body.message.chat.id;
    const user = randomNumberString(10);
    let prompt = "";
    let imageUrl = "";

    if (body.message.text) prompt = body.message.text;

    // If the message has a photo
    if (body.message.photo?.length > 0) {
      const fileId = body.message.photo.at(-1).file_id;
      const fileRes = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileRes.json();
      imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileData.result.file_path}`;
    }

    // Send "typing" action
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    // /start message
    if (prompt === "/start") {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "👋 *Hi!* I’m your *Gemini AI Bot.*\n\nSend me a message or image to analyze.",
          parse_mode: "Markdown",
        }),
      });
      return res.status(200).end();
    }

    // Call your Gemini API
    const apiUrl = `https://api-library-kohi.onrender.com/api/gemini?prompt=${encodeURIComponent(
      prompt
    )}&imageUrl=${encodeURIComponent(imageUrl || "")}&user=${user}`;

    const response = await fetch(apiUrl);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { status: false, data: text };
    }

    const replyText =
      data?.data || data?.response || "⚠️ No response received from Gemini API.";

    const reply = escapeMarkdown(replyText);

    // Send formatted response
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
    console.error("❌ Webhook Error:", error);

    // Send error message to chat
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "⚠️ Error processing your message or image.",
      }),
    });

    return res.status(500).end();
  }
}
