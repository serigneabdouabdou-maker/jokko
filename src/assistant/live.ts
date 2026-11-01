import type { LiveServerMessage, Session } from "@google/genai";
import { api } from "../data/supabase";
import type { ShopContext } from "./client";
import { audioContext, base64ToBytes, bytesToBase64, PcmPlayer, rateOf } from "./pcm";
import { ClearSpeaker, type SpeechLang } from "./clearVoice";
import { CallGate, NoiseGate } from "./listenFilter";
import { matchRecorded, playRecorded, prefetchRecorded, recordedPlaying, stopRecorded } from "./recorded";
import { SPEED_NOTE, type SpeechSpeed } from "./greeting";

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
  /** Bouton « maintenir pour parler » : micro grand ouvert et la phrase compte même sans « Jokko ». */
  hold: (on: boolean) => void;
};

/** clear : chaque phrase de Jokko est lue par la voix claire de l'accueil (au lieu de la voix directe de Gemini). */
export type LiveOptions = {
  microphone: boolean;
  greet: boolean;
  mute?: boolean;
  clear?: boolean;
  lang?: () => SpeechLang;
  /** Jokko n'agit que si on l'appelle « Jokko » (ou bouton maintenu), puis 20 s de suite. */
  wake?: boolean;
  /** Filtre anti-bruit : « normal » ou « fort » (boutique très bruyante). */
  noise?: "normal" | "fort";
  /** Vitesse de parole choisie dans Réglages. */
  speed?: SpeechSpeed;
};

export class LiveStartError extends Error {
  reason: "not_configured" | "unavailable" | "microphone" | "quota";
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
  // Offre ou limite du jour : on passe en message vocal, avec l'explication du serveur.
  if (response.status === 402) throw new LiveStartError(typeof body?.message === "string" ? body.message : "La conversation en direct n’est pas disponible.", "quota");
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
  void prefetchRecorded(audioContext());
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
  const clear = options.clear && !options.mute ? new ClearSpeaker(player, options.lang ?? (() => "wo"), () => handlers.onPhase("parle")) : null;
  const lang = options.lang ?? (() => "wo" as SpeechLang);
  const noise = new NoiseGate(options.noise === "fort" ? 4.2 : 2.6, options.noise === "fort" ? 0.04 : 0.02);
  const calls = new CallGate(options.wake ?? true);
  let held = false;
  let quietUntil = 0;
  if (!options.mute) void prefetchRecorded(audio);

  // Le tour de Jokko en cours : on garde sa voix tant qu'on ne sait pas si on lui parlait,
  // et on regarde s'il dit une phrase enregistrée (alors on joue la belle voix, tout de suite).
  type Pending = { name?: string; id?: string; args?: Record<string, unknown> };
  let turn: { decided: boolean; addressed: boolean; audio: Array<[Uint8Array, number]>; text: string; tools: Pending[]; started: number; flushed: boolean } | null = null;
  let userPending: string[] = [];
  let swapTimer = 0;
  let toolTimer = 0;

  const newTurn = () => ({ decided: false, addressed: false, audio: [] as Array<[Uint8Array, number]>, text: "", tools: [] as Pending[], started: Date.now(), flushed: false });

  /** Joue la voix gardée de Jokko (aucune phrase enregistrée ne correspond). */
  const flushAudio = () => {
    if (!turn || turn.flushed || !turn.addressed) return;
    turn.flushed = true;
    window.clearTimeout(swapTimer);
    if (options.mute || clear) return;
    for (const [bytes, rate] of turn.audio) player.push(bytes, rate);
    if (turn.audio.length) handlers.onPhase("parle");
    turn.audio = [];
  };

  const answerTools = (list: Pending[], addressed: boolean) => {
    if (!live || !list.length) return;
    live.sendToolResponse({
      functionResponses: list.map((call) => ({
        id: call.id,
        name: call.name,
        response: addressed
          ? safeTool(handlers, { id: call.id, name: call.name, args: call.args })
          : { statut: "ignore", message: "On ne t'a pas appelé « Jokko » : cette phrase ne t'était pas adressée. Ne dis rien." },
      })),
    });
  };

  /** On sait maintenant si la phrase était pour Jokko. */
  const decide = (addressed: boolean) => {
    if (!turn || turn.decided) return;
    turn.decided = true;
    turn.addressed = addressed;
    window.clearTimeout(toolTimer);
    if (addressed) {
      for (const chunk of userPending) handlers.onUser(chunk);
      userPending = [];
      if (turn.text) {
        handlers.onJokko(turn.text);
        clear?.add(turn.text);
      }
      const tools = turn.tools;
      turn.tools = [];
      answerTools(tools, true);
      // Courte attente pour voir si c'est une phrase enregistrée ; sinon la voix directe part.
      window.clearTimeout(swapTimer);
      swapTimer = window.setTimeout(flushAudio, Math.max(0, 260 - (Date.now() - turn.started)));
    } else {
      userPending = [];
      const tools = turn.tools;
      turn.tools = [];
      answerTools(tools, false);
      turn.audio = [];
    }
  };
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
    clear?.reset();
    player.stop();
    stopRecorded();
    window.clearTimeout(swapTimer);
    window.clearTimeout(toolTimer);
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
    // Les 280 dernières ms sont gardées : quand la porte s'ouvre, le début du mot n'est pas coupé.
    const preroll: ArrayBuffer[] = [];
    const silence = new Uint8Array(1280).buffer;
    const sendPcm = (pcm: ArrayBuffer) => live?.sendRealtimeInput({ audio: { data: bytesToBase64(new Uint8Array(pcm)), mimeType: "audio/pcm;rate=16000" } });
    let wasSending = false;
    node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      if (!open || !live) return;
      // Pendant que Jokko parle (et 0,4 s après), le micro n'envoie pas sa propre voix à Gemini :
      // sinon le haut-parleur revient dans le micro et brouille la conversation. Le bouton « Maintenir » passe outre.
      if (!held && (player.playing || recordedPlaying())) quietUntil = Date.now() + 400;
      if (!held && Date.now() < quietUntil) {
        wasSending = false;
        preroll.length = 0;
        return;
      }
      const decision = noise.frame(event.data.rms, Date.now(), held);
      if (decision === "send") {
        if (!wasSending) for (const old of preroll.splice(0)) sendPcm(old);
        wasSending = true;
        sendPcm(event.data.pcm);
        return;
      }
      wasSending = false;
      preroll.push(event.data.pcm);
      if (preroll.length > 7) preroll.shift();
      if (decision === "silence") sendPcm(silence);
    };
    source.connect(node);
    node.connect(audio.destination);
  };

  const onmessage = (message: LiveServerMessage) => {
    const content = message.serverContent;
    const now = Date.now();
    if (content?.interrupted) {
      clear?.reset();
      player.stop();
      handlers.onPhase("ecoute");
    }
    if (content?.inputTranscription?.text) {
      const chunk = content.inputTranscription.text;
      calls.heard(chunk, now);
      if (turn?.decided && turn.addressed) handlers.onUser(chunk);
      else userPending.push(chunk);
      if (turn && !turn.decided && calls.addressed(now)) decide(true);
    }
    const parts = content?.modelTurn?.parts ?? [];
    const said = content?.outputTranscription?.text ?? "";
    if (parts.length || said || message.toolCall?.functionCalls?.length) {
      turn ??= newTurn();
      if (!turn.decided && calls.addressed(now)) decide(true);
    }
    for (const part of parts) {
      if (!part.inlineData?.data || !turn) continue;
      if (turn.decided && !turn.addressed) continue;
      const clip: [Uint8Array, number] = [base64ToBytes(part.inlineData.data), rateOf(part.inlineData.mimeType)];
      if (turn.flushed) {
        if (!options.mute && !clear) {
          player.push(clip[0], clip[1]);
          handlers.onPhase("parle");
        }
      } else turn.audio.push(clip);
    }
    if (said && turn) {
      turn.text += said;
      if (turn.decided && turn.addressed) {
        handlers.onJokko(said);
        clear?.add(said);
      }
    }
    if (message.toolCall?.functionCalls?.length && live && turn) {
      const list = message.toolCall.functionCalls.map((call) => ({ id: call.id, name: call.name, args: call.args }));
      if (turn.decided) answerTools(list, turn.addressed);
      else {
        turn.tools.push(...list);
        // La transcription arrive parfois juste après : on attend un peu avant de dire « pas pour toi ».
        window.clearTimeout(toolTimer);
        toolTimer = window.setTimeout(() => decide(calls.addressed(Date.now())), 1200);
      }
    }
    if (content?.turnComplete) {
      if (turn && !turn.decided) decide(calls.addressed(now));
      if (turn?.addressed) {
        // Phrase enregistrée ? Elle part avec la belle voix, à la place de la voix directe.
        const recorded = !turn.flushed && !options.mute && !clear ? matchRecorded(turn.text) : null;
        if (recorded && playRecorded(audio, recorded, () => handlers.onPhase("ecoute"))) {
          window.clearTimeout(swapTimer);
          turn.flushed = true;
          turn.audio = [];
          handlers.onPhase("parle");
        } else flushAudio();
        clear?.flush();
        calls.answered(Date.now());
        handlers.onTurnEnd();
      }
      calls.endTurn();
      userPending = [];
      turn = null;
    }
    if (message.toolCallCancellation?.ids?.length) handlers.onToolCancel(message.toolCallCancellation.ids);
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
  // Vitesse de parole choisie par le commerçant (consigne silencieuse, Jokko ne répond pas).
  live.sendClientContent({ turns: [{ role: "user", parts: [{ text: SPEED_NOTE[options.speed ?? "normal"] }] }], turnComplete: false });
  handlers.onPhase("ecoute");
  if (options.greet && !options.mute && lang() === "wo" && playRecorded(audio, "Asalaa maalekum ! Maa ngi lay déglu.", () => handlers.onPhase("ecoute"))) {
    handlers.onPhase("parle");
    calls.answered(Date.now());
  } else if (options.greet) {
    calls.force();
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
      calls.force();
      clear?.reset();
      player.stop();
      live.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
    },
    note: (text: string) => {
      if (!open || !live) return;
      live.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: false });
    },
    hold: (on: boolean) => {
      held = on;
      calls.hold(on);
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
