// backend/routes/voice-agent.ts
import { Router } from "express";
import { WebSocketServer, WebSocket } from "ws";
import { DeepgramClient } from "@deepgram/sdk";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { callLogsTable, settingsTable } from "./telephony.js";
import { eq } from "drizzle-orm";
import twilio from "twilio";
import fetch from "node-fetch";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepgram = new DeepgramClient(process.env.DEEPGRAM_API_KEY);
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // Rachel by default

// In-memory store for active calls
const activeCalls = new Map<string, CallSession>();

class CallSession {
  callSid: string;
  callerNumber: string;
  orgId: number;
  history: { role: "system" | "user" | "assistant"; content: string }[];
  detectedLanguage: string;
  isTransferred: boolean;

  constructor(callSid: string, callerNumber: string, orgId: number, settings: any) {
    this.callSid = callSid;
    this.callerNumber = callerNumber;
    this.orgId = orgId;
    this.detectedLanguage = "uk";
    this.isTransferred = false;

    this.history = [{
      role: "system",
      content: `Ти — професійний адміністратор готелю.
Твоя мета — допомагати гостям, відповідати на запитання та консультувати щодо номерів.
Спілкуйся коротко (1-2 речення). Завжди відповідай тією мовою, якою до тебе звертаються.
Якщо гість хоче забронювати номер або скаржиться, скажи, що переводиш дзвінок на менеджера.
Дані готелю: ${settings.greetingMessage || "Готель ДОГОДА"}.`
    }];
  }
}

// 1. Endpoint для прийому вхідного дзвінка від Twilio
router.post("/twilio/incoming", async (req, res) => {
  const { CallSid, From, To } = req.body;
  const host = req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] === "https" ? "wss" : "ws";

  console.log(`[Twilio] Incoming call ${CallSid} from ${From}`);

  const [org] = await db.select().from(settingsTable).where(eq(settingsTable.mainNumber, To));
  const orgId = org ? org.organizationId : 1;

  activeCalls.set(CallSid, new CallSession(CallSid, From, orgId, org || {}));

  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({
    url: `${protocol}://${host}/api/telephony/twilio/stream?callSid=${CallSid}`,
    track: "inbound_track"
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// 2. Setup WebSocket Server for Media Streams (called from index.ts)
export function setupVoiceWebsocket(server: any) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: any, socket: any, head: any) => {
    if (request.url?.startsWith("/api/telephony/twilio/stream")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  wss.on("connection", (ws: WebSocket, req: any) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const callSid = url.searchParams.get("callSid");

    if (!callSid || !activeCalls.has(callSid)) {
      ws.close(1008, "Call session not found");
      return;
    }

    const session = activeCalls.get(callSid)!;
    handleMediaStream(ws, session);
  });
}

// 3. Handle the actual audio streaming
async function handleMediaStream(ws: WebSocket, session: CallSession) {
  let streamSid = "";

  // Deepgram v5 API: client.listen.v1.connect(options)
  const dgConnection = await deepgram.listen.v1.connect({
    model: "nova-2",
    language: "uk",
    detect_language: "true",
    encoding: "mulaw",
    sample_rate: "8000",
    interim_results: "false",
    endpointing: "500",
  });

  dgConnection.on("open", () => {
    console.log(`[Deepgram] Connected for call ${session.callSid}`);
    generateAndPlayResponse(ws, streamSid, "Вітаю! Чим можу вам допомогти?", session);
  });

  dgConnection.on("message", async (data: any) => {
    if (data.type !== "Results") return;

    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript || !data.is_final) return;

    console.log(`[User]: ${transcript}`);
    session.history.push({ role: "user", content: transcript });

    if (data.channel?.alternatives?.[0]?.languages?.length > 0) {
      session.detectedLanguage = data.channel.alternatives[0].languages[0].language;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: session.history,
        max_tokens: 150,
        temperature: 0.7,
      });

      const aiText = completion.choices[0].message.content || "";
      console.log(`[AI]: ${aiText}`);
      session.history.push({ role: "assistant", content: aiText });

      if (aiText.toLowerCase().includes("перевод") || aiText.toLowerCase().includes("з'єдную")) {
        session.isTransferred = true;
        ws.send(JSON.stringify({
          event: "mark",
          streamSid,
          mark: { name: "transfer_call" }
        }));
      } else {
        await generateAndPlayResponse(ws, streamSid, aiText, session);
      }
    } catch (err) {
      console.error("[AI Error]", err);
    }
  });

  // Handle incoming Twilio messages
  ws.on("message", (message: Buffer | string) => {
    const msg = JSON.parse(message.toString());

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      console.log(`[Twilio] Stream started: ${streamSid}`);
    } else if (msg.event === "media") {
      const payload = Buffer.from(msg.media.payload, "base64");
      dgConnection.socket?.send(payload);
    } else if (msg.event === "stop") {
      console.log(`[Twilio] Stream stopped: ${streamSid}`);
      dgConnection.socket?.close();
      activeCalls.delete(session.callSid);
      logCallToDB(session);
    }
  });

  ws.on("close", () => {
    dgConnection.socket?.close();
    activeCalls.delete(session.callSid);
  });
}

// 4. Generate Speech via ElevenLabs and send to Twilio
async function generateAndPlayResponse(
  ws: WebSocket,
  streamSid: string,
  text: string,
  _session: CallSession
) {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "xi-api-key": ELEVENLABS_API_KEY || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!response.ok) throw new Error(`ElevenLabs error: ${response.statusText}`);

    // Note: in production convert MP3 → mulaw 8000Hz via ffmpeg before sending.
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    ws.send(JSON.stringify({
      event: "media",
      streamSid,
      media: { payload: buffer.toString("base64") },
    }));
  } catch (err) {
    console.error("[TTS Error]", err);
  }
}

// 5. Save call to DB when finished
async function logCallToDB(session: CallSession) {
  try {
    const fullTranscript = session.history
      .filter(m => m.role !== "system")
      .map(m => `${m.role === "user" ? "Гість" : "AI"}: ${m.content}`)
      .join("\n");

    await db.insert(callLogsTable).values({
      organizationId: session.orgId,
      direction: "inbound",
      callerNumber: session.callerNumber,
      status: session.isTransferred ? "transferred" : "completed",
      notes: `AI Transcript:\n${fullTranscript}`,
      startedAt: new Date(),
      endedAt: new Date(),
    });
  } catch (err) {
    console.error("[DB Error]", err);
  }
}

export default router;
