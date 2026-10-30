import type { AssistantLanguage } from "./client";
import { audioContext, PcmPlayer, rateOf } from "./pcm";

let current: { stop: () => void } | null = null;

export function stopVoice() {
  current?.stop();
  current = null;
}

export async function playVoice(text: string, language: AssistantLanguage): Promise<boolean> {
  stopVoice();
  const controller = new AbortController();
  let player: PcmPlayer | null = null;
  let stopped = false;
  const handle = {
    stop() {
      stopped = true;
      controller.abort();
      player?.stop();
    },
  };
  current = handle;

  let response: Response;
  try {
    response = await fetch("/api/assistant/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 400), language }),
      signal: controller.signal,
    });
  } catch {
    return stopped;
  }
  if (response.status !== 200 || !response.body) return false;

  const context = audioContext();
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  player = new PcmPlayer(context);
  const rate = rateOf(response.headers.get("content-type"));
  const reader = response.body.getReader();
  let played = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || stopped || current !== handle) break;
      player.push(value, rate);
      played = true;
    }
  } catch {
    return played || stopped;
  }
  return played || stopped;
}
