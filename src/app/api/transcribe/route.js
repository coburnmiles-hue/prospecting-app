// Transcribes audio using Gemini 2.0 Flash multimodal.
// Accepts { audioBase64: string, mimeType: string } and returns { transcript: string }.
import { getUserIdFromRequest } from "@/lib/auth";

export async function POST(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { audioBase64, mimeType } = await req.json();
    if (!audioBase64) return Response.json({ error: "audioBase64 is required" }, { status: 400 });

    const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
    if (!key) return Response.json({ error: "AI not configured" }, { status: 503 });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "audio/webm",
                data: audioBase64,
              },
            },
            {
              text: "Transcribe exactly what is spoken in this audio recording. Return only the transcribed text, nothing else. If there is no audible speech, return an empty string.",
            },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("Gemini transcribe error:", geminiRes.status, errText);
      return Response.json({ error: "Transcription failed" }, { status: 502 });
    }

    const data = await geminiRes.json();
    const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return Response.json({ transcript });
  } catch (err) {
    console.error("Transcribe route error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
