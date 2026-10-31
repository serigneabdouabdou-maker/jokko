import type { LiveServerMessage, Session } from "@google/genai";
import { api } from "../data/supabase";
import type { ShopContext } from "./client";
import { audioContext, base64ToBytes, bytesToBase64, PcmPlayer, rateOf } from "./pcm";

export type LivePhase = "connexion" | "ecoute" | "parle";
export type LiveToolCall = { id?: string; name?: string; args?: Record<string, unknown> };

export type LiveHandlers = {
  onPhase: (phase: LivePhase) => void;
  onUser: (chunk: string) => void;
  onJokko: (chunk: string) => void;
  onTurnEnd: () => void;
  onTool: (call: LiveToolCall) => Record<string, unknown>;
  /** Appels d'outil annulés par Gemini (le commerçant a coupé la parole). */
  onToolCancel: (ids: string[]) => void;
  /** reconnect = la session arrive à sa limite de temps : on en rouvre une sans rien dire. */
  onEnd: (reason: string | null, reconnect?: boolean) => void;
};

export type LiveHandle = {
  readonly stream: MediaStream | null;
  readonly listening: boolean;
  stop: () => void;
  tell: (text: string) => void;
  /** Ajoute une information au contexte sans faire parler Jokko (ex. nouveau client ajouté à l'écran). */
  note: (text: string) => void;
  listen: () => Promise<MediaStream>;
};

export type LiveOptions = { microphone: boolean; greet: boolean; mute?: boolean };

export class LiveStartError extends Error {
  reason: "not_configured" | "unavailable" | "microphone";
  constructor(message: string, reason: LiveStartError["reason"]) {
    super(message);
    this.reason = reason;
  }
}

const CAPTURE_WORKLET = `
class JokkoCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.pos = 0;
    this.out = new Int16Array(640);
    this.n = 0;
    this.energy = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    while (this.pos < input.length) {
      const s = Math.max(-1, Math.min(1, input[Math.floor(this.pos)]));
      this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      this.energy += s * s;
      if (this.n === this.out.length) {
        this.port.postMessage({ pcm: this.out.buffer.slice(0), rms: Math.sqrt(this.energy / this.n) });
        this.n = 0;
        this.energy = 0;
      }
      this.pos += this.step;
    }
    this.pos -= input.length;
    return true;
  }
}
registerProcessor("jokko-capture", JokkoCapture);
`;

type LiveTicket = { token: string; model: string; config: Record<string, unknown>; at: number };

/** Empreinte des noms (clients, articles) : si elle change, le jeton préparé est périmé. */
function signature(context: ShopContext): string {
  return JSON.stringify([context.clients.map((c) => [c.id, c.name]), context.products.map((p) => [p.id, p.name])]);
}
let ticketSignature = "";

/** Un jeton Gemini est valable 90 s pour ouvrir une conversation : on le garde 70 s au plus. */
const TICKET_MS = 70_000;
let ticket: Promise<LiveTicket> | null = null;
let ticketAt = 0;
let genai: Promise<typeof import("@google/genai")> | null = null;

async function fetchTicket(context: ShopContext): Promise<LiveTicket> {
  let response: Response;
  try {
    response = await api("live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopContext: context }),
    });
  } catch {
    throw new LiveStartError("Jokko ne joint pas le serveur. Vérifie la connexion.", "unavailable");
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.status === 503) throw new LiveStartError("Gemini n’est pas configuré sur le serveur.", "not_configured");
  if (!response.ok || typeof body?.token !== "string" || typeof body.model !== "string") {
    throw new LiveStartError(typeof body?.message === "string" ? body.message : "La conversation en direct ne démarre pas pour le moment.", "unavailable");
  }
  return { token: body.token, model: body.model, config: (body.config ?? {}) as Record<string, unknown>, at: Date.now() };
}

/**
 * Préchauffe la conversation : le module Gemini et un jeton sont prêts AVANT que le commerçant
 * touche le micro. L'appui ne fait plus qu'ouvrir la ligne.
 */
export function prewarmLive(context: ShopContext) {
  genai ??= import("@google/genai");
  const sig = signature(context);
  if (ticket && Date.now() - ticketAt < TICKET_MS && sig === ticketSignature) return;
  ticketAt = Date.now();
  ticketSignature = sig;
  const next = fetchTicket(context);
  next.catch(() => {
    if (ticket === next) ticket = null;
  });
  ticket = next;
}

/** Prend le jeton préparé s'il est encore bon, sinon en demande un. Un jeton ne sert qu'une fois. */
async function takeTicket(context: ShopContext): Promise<LiveTicket> {
  const ready = ticket && Date.now() - ticketAt < TICKET_MS && signature(context) === ticketSignature ? ticket : null;
  ticket = null;
  if (ready) {
    try {
      return await ready;
    } catch {
      // jeton préparé raté : on en redemande un
    }
  }
  return fetchTicket(context);
}

export async function startLive(context: ShopContext, handlers: LiveHandlers, options: LiveOptions): Promise<LiveHandle> {
  handlers.onPhase("connexion");
  // Micro, jeton et module Gemini en même temps, pas l'un après l'autre.
  const micro = options.microphone ? openMicrophone() : Promise.resolve(null);
  micro.catch(() => undefined);
  const sdk = (genai ??= import("@google/genai"));
  let session: LiveTicket;
  try {
    session = await takeTicket(context);
  } catch (error) {
    void micro.then((m) => m?.getTracks().forEach((t) => t.stop())).catch(() => undefined);
    throw error;
  }

  const audio = audioContext();
  if (audio.state === "suspended") await audio.resume().catch(() => undefined);
  const player = new PcmPlayer(audio);
  let media: MediaStream | null = await micro;
  let open = false;
  let ended = false;
  let live: Session | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let node: AudioWorkletNode | null = null;

  const finish = (reason: string | null, reconnect = false) => {
    if (ended) return;
    ended = true;
    open = false;
    player.stop();
    node?.port.close();
    node?.disconnect();
    source?.disconnect();
    media?.getTracks().forEach((track) => track.stop());
    try {
      live?.close();
    } catch {
      // déjà fermé
    }
    handlers.onEnd(reason, reconnect);
  };

  player.onIdle = () => {
    if (open) handlers.onPhase("ecoute");
  };

  const listenTo = async (stream: MediaStream) => {
    try {
      const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "text/javascript" }));
      await audio.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
    } catch {
      // le module est déjà chargé dans ce contexte audio
    }
    source = audio.createMediaStreamSource(stream);
    node = new AudioWorkletNode(audio, "jokko-capture");
    node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      if (!open || !live) return;
      live.sendRealtimeInput({ audio: { data: bytesToBase64(new Uint8Array(event.data.pcm)), mimeType: "audio/pcm;rate=16000" } });
    };
    source.connect(node);
    node.connect(audio.destination);
  };

  const onmessage = (message: LiveServerMessage) => {
    const content = message.serverContent;
    if (content?.interrupted) {
      player.stop();
      handlers.onPhase("ecoute");
    }
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && !options.mute) {
        player.push(base64ToBytes(part.inlineData.data), rateOf(part.inlineData.mimeType));
        handlers.onPhase("parle");
      }
    }
    if (content?.inputTranscription?.text) handlers.onUser(content.inputTranscription.text);
    if (content?.outputTranscription?.text) handlers.onJokko(content.outputTranscription.text);
    if (content?.turnComplete) handlers.onTurnEnd();
    if (message.toolCallCancellation?.ids?.length) handlers.onToolCancel(message.toolCallCancellation.ids);
    if (message.toolCall?.functionCalls?.length && live) {
      live.sendToolResponse({
        functionResponses: message.toolCall.functionCalls.map((call) => ({
          id: call.id,
          name: call.name,
          response: safeTool(handlers, { id: call.id, name: call.name, args: call.args }),
        })),
      });
    }
    if (message.goAway) finish(null, true);
  };

  try {
    const { GoogleGenAI } = await sdk;
    const ai = new GoogleGenAI({ apiKey: session.token, httpOptions: { apiVersion: "v1alpha" } });
    live = await ai.live.connect({
      model: session.model,
      config: session.config,
      callbacks: {
        onmessage,
        onerror: () => finish(media ? "La conversation a été coupée. Relance le micro." : null),
        onclose: (event: CloseEvent) => finish(event.code === 1000 || !media ? null : "La conversation a été coupée. Relance le micro."),
      },
    });
  } catch {
    media?.getTracks().forEach((track) => track.stop());
    throw new LiveStartError("La conversation en direct ne démarre pas pour le moment.", "unavailable");
  }

  if (media) await listenTo(media);
  open = true;
  handlers.onPhase("ecoute");
  if (options.greet) {
    live.sendClientContent({
      turns: [{ role: "user", parts: [{ text: "(La conversation commence. Salue le commerçant en une phrase très courte, dans la langue de la boutique, et dis que tu l'écoutes. En wolof, dis exactement : « Asalaa maalekum ! Maa ngi lay déglu. »)" }] }],
      turnComplete: true,
    });
  }

  return {
    get stream() {
      return media;
    },
    get listening() {
      return media !== null;
    },
    stop: () => finish(null),
    tell: (text: string) => {
      if (!open || !live) return;
      player.stop();
      live.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
    },
    note: (text: string) => {
      if (!open || !live) return;
      live.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: false });
    },
    listen: async () => {
      if (media) return media;
      const stream = await openMicrophone();
      if (ended) {
        stream.getTracks().forEach((track) => track.stop());
        throw new LiveStartError("La conversation est terminée.", "unavailable");
      }
      media = stream;
      await listenTo(stream);
      return stream;
    },
  };
}

async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch {
    throw new LiveStartError("Le micro n’est pas autorisé. Autorise-le dans le navigateur.", "microphone");
  }
}

function safeTool(handlers: LiveHandlers, call: LiveToolCall): Record<string, unknown> {
  try {
    return handlers.onTool(call);
  } catch {
    return { statut: "erreur" };
  }
}
