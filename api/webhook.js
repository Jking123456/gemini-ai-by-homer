// api/webhook.js
import fetch from "node-fetch";
export const config = {
  api: {
    bodyParser: false,
  },
};


// Function to generate random numeric string (default 10 digits)
function randomNumberString(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10); // numbers only
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const body = req.body;

  if (!body.message) return res.status(200).end();

  const chatId = body.message.chat.id;
  const user = randomNumberString(10); // random numbers only
  let prompt = "";
  let imageUrl = "";

  // If the message has text
  if (body.message.text) {
    prompt = body.message.text;
  }

  // If the message has a photo
  if (body.message.photo && body.message.photo.length > 0) {
    const fileId = body.message.photo[body.message.photo.length - 1].file_id;

    // Get Telegram file path
    const fileRes = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileData.result.file_path}`;
  }

  // Show typing action
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });

  // Call your API
  try {
    const apiUrl = `https://api-library-kohi.onrender.com/api/gemini?prompt=${encodeURIComponent(
      prompt
    )}&imageUrl=${encodeURIComponent(imageUrl)}&user=${user}`;

    const response = await fetch(apiUrl);
    const data = await response.json();

    const reply = data.response || "No response received.";

    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
  } catch (error) {
    console.error("Error:", error);
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "⚠️ Error analyzing your message or image.",
      }),
    });
  }

  res.status(200).end();
}
