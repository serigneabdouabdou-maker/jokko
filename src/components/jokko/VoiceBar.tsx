import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Input } from "@/components/ui/input";
import { JokkoMark } from "./JokkoMark";

export type VoiceState =
  | "repos"
  | "ecoute"
  | "transcription"
  | "comprehension"
  | "confirmation"
  | "succes"
  | "erreur";

/** undo : la réponse suit une écriture enregistrée, que le commerçant peut annuler. */
export type VoiceReply = { text: string; summary?: string; tone: "ok" | "error"; undo?: boolean };

const LABELS: Record<VoiceState, string> = {
  repos: "",
  ecoute: "J’écoute",
  transcription: "Transcription",
  comprehension: "Jokko comprend",
  confirmation: "Compris",
  succes: "Enregistré",
  erreur: "À revoir",
};

type VoiceBarProps = {
  state: VoiceState;
  reply: VoiceReply | null;
  stream: MediaStream | null;
  text: string;
  onText: (value: string) => void;
  onSend: (value: string) => void;
  onMic: () => void;
  /** Maintenir pour parler (conversation en direct) : true à l'appui, false au relâchement. */
  onHold?: (on: boolean) => void;
  /** Mot d'appel « Jokko » actif : on le rappelle dans l'aide. */
  wake?: boolean;
  onDismiss: () => void;
  onUndo?: () => void;
  /** « Jokko s'est trompé » : noter l'erreur et annuler. */
  onWrong?: () => void;
  live?: { phase: "connexion" | "ecoute" | "parle"; caption: string } | null;
};

const LIVE_LABELS = { connexion: "Connexion", ecoute: "En direct", parle: "Jokko parle" } as const;

export function VoiceBar({ state, reply, stream, text, onText, onSend, onMic, onHold, wake = false, onDismiss, onUndo, onWrong, live }: VoiceBarProps) {
  const [holding, setHolding] = useState(false);
  const press = (on: boolean) => {
    setHolding(on);
    onHold?.(on);
  };
  const root = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const busy = !live && (state === "transcription" || state === "comprehension");
  const listening = state === "ecoute" || Boolean(live);

  useEffect(() => {
    if (!listening) return;
    setSeconds(0);
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [listening]);

  useEffect(() => {
    const el = root.current;
    if (!stream || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const level = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
      smooth += (level - smooth) * 0.35;
      el.style.setProperty("--lvl", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--lvl", "0");
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="vbar" data-state={live ? "ecoute" : state} data-live={live?.phase} ref={root}>
      <div className="vreply-slot" aria-live="polite">
        {reply && (
          <div className="vreply" data-tone={reply.tone} key={reply.text}>
            <JokkoMark size={26} />
            <div className="vreply-body">
              <p>{reply.text}</p>
              {reply.summary && (
                <span className="vsum">
                  <Icon name="coche" size="sm" /> {reply.summary}
                </span>
              )}
            </div>
            {reply.undo && onUndo && (
              <div className="vacts">
                <button type="button" className="vundo" onClick={onUndo}>
                  <Icon name="annuler" size="sm" /> Annuler
                </button>
                {onWrong && (
                  <button type="button" className="vwrong" onClick={onWrong}>
                    Jokko s’est trompé
                  </button>
                )}
              </div>
            )}
            <button type="button" className="vclose" aria-label="Fermer la réponse" onClick={onDismiss}>
              <Icon name="fermer" size="sm" />
            </button>
          </div>
        )}
      </div>
      <form
        className="vrow"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && text.trim()) onSend(text.trim());
        }}
      >
        <button
          type="button"
          className="vmic"
          aria-label={live ? "Terminer la conversation" : listening ? "Arrêter l’écoute" : "Parler à Jokko"}
          aria-pressed={listening}
          disabled={busy}
          onClick={onMic}
        >
          <span className="vhalo" aria-hidden="true" />
          {listening ? <Icon name="stop" /> : <Icon name="micro" size="lg" />}
        </button>

        <div className="vmid">
          {listening ? (
            <div className="vlisten">
              <span className="vwave" aria-hidden="true">
                {[0.55, 0.9, 1, 0.75, 0.95, 0.6, 0.8].map((k, i) => (
                  <i key={i} style={{ ["--k" as string]: k }} />
                ))}
              </span>
              {live ? (
                <span className="vhint vcaption">{holding ? "Je t’écoute… relâche quand tu as fini." : live.caption || (live.phase === "connexion" ? "Jokko arrive…" : wake ? "Dis « Jokko », puis ta phrase…" : "Je t’écoute, parle normalement…")}</span>
              ) : (
                <span className="vhint">Je vous écoute… <b className="num">{clock}</b></span>
              )}
            </div>
          ) : busy ? (
            <div className="vlisten">
              <span className="vdots" aria-hidden="true"><i /><i /><i /></span>
              <span className="vhint">{state === "transcription" ? "Je transcris votre voix…" : "Jokko comprend la demande…"}</span>
            </div>
          ) : (
            <Input
              className="vinput"
              value={text}
              onChange={(e) => onText(e.target.value)}
              placeholder="Dites une vente, un stock, une dette…"
              aria-label="Commande pour Jokko"
            />
          )}
        </div>

        {(live || LABELS[state]) && (
          <span className="vstate" aria-live="polite">
            {state === "succes" && <Icon name="coche" size="sm" />}
            {state === "erreur" && <Icon name="erreur" size="sm" />}
            {live ? LIVE_LABELS[live.phase] : LABELS[state]}
          </span>
        )}

        {live && onHold ? (
          <button
            type="button"
            className={`vhold${holding ? " is-on" : ""}`}
            aria-label="Maintenir pour parler à Jokko"
            aria-pressed={holding}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              press(true);
            }}
            onPointerUp={() => press(false)}
            onPointerCancel={() => press(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Icon name="micro" size="sm" /> {holding ? "Je t’écoute" : "Maintenir"}
          </button>
        ) : (
          <button type="submit" className="vsend" aria-label="Envoyer à Jokko" disabled={busy || listening || !text.trim()}>
            <Icon name="envoyer" />
          </button>
        )}
        {state === "comprehension" && <span className="vprogress" aria-hidden="true" />}
      </form>
    </div>
  );
}
