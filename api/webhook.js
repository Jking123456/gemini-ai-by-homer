// api/webhook.js
import fetch from "node-fetch";
import FormData from "form-data";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const message = req.body.message;
    if (!message) return res.status(200).send("No message received.");

    const chatId = message.chat.id;
    const text = message.text || message.caption || "";
    const photos = message.photo || [];

    // show typing...
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    });

    let publicImageUrl = "";

    // if user sent an image
    if (photos.length > 0) {
      const fileId = photos[photos.length - 1].file_id;

      // get Telegram file path
      const fileInfoRes = await fetch(
        `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
      );
      const fileInfo = await fileInfoRes.json();

      if (fileInfo.ok) {
        const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.result.file_path}`;

        // download the image from Telegram
        const fileBuffer = await fetch(fileUrl).then((r) => r.arrayBuffer());

        // upload to telegra.ph to make it public
        const form = new FormData();
        form.append("file", Buffer.from(fileBuffer), "image.jpg");

        const telegraphRes = await fetch("https://telegra.ph/upload", {
          method: "POST",
          body: form,
        });
        const telegraphData = await telegraphRes.json();

        if (telegraphData[0]?.src) {
          publicImageUrl = "https://telegra.ph" + telegraphData[0].src;
        }
      }
    }

    // random user ID
    const randomUser = Math.floor(100000 + Math.random() * 900000);

    // Gemini API endpoint
    const apiUrl = new URL("https://api-library-kohi.onrender.com/api/gemini");
    apiUrl.searchParams.set("prompt", text || "Describe this image");
    if (publicImageUrl) apiUrl.searchParams.set("imageUrl", publicImageUrl);
    apiUrl.searchParams.set("user", randomUser);

    const geminiRes = await fetch(apiUrl.toString());
    const geminiText = await geminiRes.text();

    let finalReply = "";
    try {
      const parsed = JSON.parse(geminiText);
      finalReply = parsed.data || parsed.message || "⚠️ No clear response.";
    } catch {
      finalReply = geminiText || "⚠️ No response received from Gemini API.";
    }

    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: finalReply,
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error in webhook:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
