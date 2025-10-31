export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body;
    if (!body.message) return res.status(200).send("No message");

    const chatId = body.message.chat.id;
    const text = body.message.text || "";
    const photo = body.message.photo || [];
    const caption = body.message.caption || "";

    const baseUrl = "https://api-library-kohi.onrender.com/api/gemini";
    let prompt = encodeURIComponent(text || caption || "Describe this image");
    let imageUrl = "";

    // If image is attached
    if (photo.length > 0) {
      const fileId = photo[photo.length - 1].file_id;
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileData = await fileResponse.json();
      const filePath = fileData.result.file_path;
      imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
    }

    const randomUser = Math.floor(100000 + Math.random() * 900000);
    const apiUrl = `${baseUrl}?prompt=${prompt}&imageUrl=${imageUrl}&user=${randomUser}`;

    const response = await fetch(apiUrl);
    const textResponse = await response.text();

    let cleanMessage = "";

    try {
      const parsed = JSON.parse(textResponse);
      cleanMessage = parsed.data || parsed.message || parsed.response || "";
    } catch {
      cleanMessage = textResponse;
    }

    // Clean weird characters from API text
    cleanMessage = cleanMessage
      .replace(/\\n/g, "\n")
      .replace(/\nn/g, "\n")
      .replace(/n\*/g, "\n•")
      .replace(/\*/g, "")
      .replace(/\\u\d+/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanMessage) cleanMessage = "⚠️ No response received from Gemini API.";

    // Send the cleaned response
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
