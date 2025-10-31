// api/webhook.js
import fetch from "node-fetch";

// Function to generate a random string (8 chars)
function randomString(length = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const body = req.body;

  if (!body.message) return res.status(200).end();

  const chatId = body.message.chat.id;

  let prompt = "";
  let imageUrl = "";
  const user = randomString(10); // generate a random user id

  // Check if user sent text
  if (body.message.text) {
    prompt = body.message.text;
  }

  // Check if user sent a photo
  if (body.message.photo && body.message.photo.length > 0) {
    const fileId = body.message.photo[body.message.photo.length - 1].file_id;
    const fileRes = await fetch(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`
    );
    const fileData = await fileRes.json();
    imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileData.result.file_path}`;
  }

  // Show typing indicator
  await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });

  // Call your Gemini-like API
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
    console.error(error);
    await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "⚠️ Error analyzing input." }),
    });
  }

  res.status(200).end();
}
