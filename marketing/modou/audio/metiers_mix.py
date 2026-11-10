"""Bande son de l'épisode « Jokko pour chaque métier » : musique afro-pop légère (balafon, basse, percussions),
bruitages des scènes, voix Sulafat par-dessus (la musique baisse quand Modou parle), puis -14 LUFS avec ffmpeg.
Usage : python3 audio/metiers_mix.py <dossier des voix .wav> <sortie.wav>
Entrées : metiers-script.json, metiers-timing.json (écrit par ce script si absent : début de chaque phrase)."""
import json, sys, wave, os
import numpy as np

SR = 44100
rng = np.random.default_rng(7)
VOIX, OUT = sys.argv[1], sys.argv[2]
script = json.load(open("metiers-script.json"))


def read_wav(path):
    with wave.open(path) as w:
        rate, n = w.getframerate(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if rate != SR:
        t_old = np.arange(len(x)) / rate
        x = np.interp(np.arange(int(len(x) * SR / rate)) / SR, t_old, x)
    # retire les silences au début et à la fin (seuil doux)
    idx = np.where(np.abs(x) > 0.02)[0]
    if len(idx):
        x = x[max(0, idx[0] - int(0.04 * SR)): idx[-1] + int(0.12 * SR)]
    return x


voices = [read_wav(os.path.join(VOIX, f"{s['slug']}.wav")) for s in script]
D = [len(v) / SR for v in voices]

# ----- Minutage : pauses plus longues quand on change de scène -----
S, t = [], 1.7
for i, s in enumerate(script):
    S.append(round(t, 3))
    nxt = script[i + 1]["scene"] if i + 1 < len(script) else None
    t += D[i] + (0.35 if nxt == s["scene"] else 1.05)
duration = round(t + 3.6, 2)
json.dump({"s": S, "d": [round(x, 3) for x in D], "duration": duration}, open("metiers-timing.json", "w"))
N = int(duration * SR)
music = np.zeros((N, 2), np.float32)
fx = np.zeros((N, 2), np.float32)
voice = np.zeros(N, np.float32)


def put(buf, t0, sig, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= len(buf) or i + len(sig) <= 0:
        return
    sig = sig[: len(buf) - i] if i >= 0 else sig[-i:]
    i = max(0, i)
    if buf.ndim == 1:
        buf[i: i + len(sig)] += sig * gain
    else:
        buf[i: i + len(sig), 0] += sig * gain * (1 - max(0, pan))
        buf[i: i + len(sig), 1] += sig * gain * (1 + min(0, pan))


def env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / r)


def note(f):  # fréquence d'une note MIDI
    return 440 * 2 ** ((f - 69) / 12)


# ----- Instruments -----
def kick(): n = int(0.35 * SR); t = np.arange(n) / SR; f = 50 + 90 * np.exp(-t * 35); return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def clap(): n = int(0.18 * SR); return rng.normal(0, 1, n) * env(n, 0.002, 0.045) * 0.6
def shaker(): n = int(0.06 * SR); x = rng.normal(0, 1, n); x = np.diff(np.concatenate([[0], x])); return x * env(n, 0.003, 0.018) * 0.35
def balafon(f, dur=0.45):  # lame de bois : fondamentale + harmoniques inharmoniques, attaque sèche
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 18) + 0.15 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 40)) * env(n, 0.002, 0.16)
def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * np.minimum(1, t / 0.01) * np.exp(-t * 2.2)
def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for f in freqs:
        for d in (-0.15, 0.15):
            x += np.sin(2 * np.pi * f * (1 + d / 100) * t + rng.uniform(0, 6))
    a = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6)
    return x / (len(freqs) * 2) * a
def whoosh(dur=0.6, up=True):
    n = int(dur * SR); x = rng.normal(0, 1, n); t = np.arange(n) / SR
    # filtre passe-bas qui s'ouvre : moyenne glissante de taille décroissante
    out = np.zeros(n); k = np.linspace(40, 3, n) if up else np.linspace(3, 40, n)
    c = np.cumsum(np.concatenate([[0], x]))
    for i in range(n):
        w = int(k[i]); out[i] = (c[i + 1] - c[max(0, i + 1 - w)]) / max(1, w)
    return out * np.sin(np.pi * t / dur) ** 2 * 1.6
def pop(f=900):
    n = int(0.12 * SR); t = np.arange(n) / SR; fr = f * (1 + 0.8 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env(n, 0.001, 0.035)
def chime(freqs, dur=1.6):
    n = int(dur * SR); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * t) * np.exp(-t * (2 + i)) for i, f in enumerate(freqs)) / len(freqs) * np.minimum(1, t / 0.004)


# ----- Musique : Do – La mineur – Fa – Sol, 100 BPM, balafon en motif -----
BPM = 100; beat = 60 / BPM; bar = 4 * beat
CHORDS = [(48, [60, 64, 67]), (45, [57, 60, 64]), (41, [57, 60, 65]), (43, [59, 62, 67])]
start, end = 0.15, duration - 1.2
nbars = int((end - start) / bar) + 1
for b in range(nbars):
    t0 = start + b * bar
    root, tri = CHORDS[b % 4]
    put(music, t0, pad([note(m) for m in tri], bar + 0.3), 0.07)
    if t0 > 1.5:
        for k in range(4):
            put(music, t0 + k * beat, bass(note(root - 12 + (7 if k == 2 else 0)), beat * 0.95), 0.22)
    # motif de balafon (croches syncopées)
    pattern = [0, 2, 1, 2, 0, 1, 2, 1]
    for k, p in enumerate(pattern):
        if k in (3, 7) and b % 2:
            continue
        put(music, t0 + k * beat / 2 + (0.02 if k % 2 else 0), balafon(note(tri[p] + 12)), 0.09, pan=(-0.35 if k % 2 else 0.35))
    if t0 > 1.5:  # percussions après le logo
        for k in range(4):
            put(music, t0 + k * beat, kick(), 0.55)
            if k in (1, 3):
                put(music, t0 + k * beat, clap(), 0.18, pan=0.1)
        for k in range(16):
            put(music, t0 + k * beat / 4, shaker(), 0.12 if k % 2 else 0.07, pan=-0.3)
# fondu de la musique au début et à la fin
fade = np.ones(N, np.float32); ti = np.arange(N) / SR
fade *= np.clip(ti / 0.4, 0, 1) * np.clip((duration - ti) / 1.8, 0, 1)
music *= fade[:, None]

# ----- Bruitages calés sur l'image (mêmes règles que metiers.html) -----
def scene_start(name):
    for i, s in enumerate(script):
        if s["scene"] == name:
            return S[i] - 0.45
    return None
put(fx, 0.0, whoosh(0.5), 0.10); put(fx, 0.25, chime([523.25, 659.25, 783.99, 1046.5], 1.8), 0.16)
put(fx, 1.55, whoosh(0.6), 0.10)
for i in range(8):
    put(fx, S[1] + 0.15 + i * 0.18, pop(700 + i * 90), 0.16, pan=(-0.4 + i * 0.11))
for name in ["pharmacie", "couture", "quincaillerie", "vetements", "reparation", "restauration", "boulangerie", "alimentation"]:
    a = scene_start(name)
    put(fx, a - 0.15, whoosh(0.7), 0.16)
    put(fx, a + 0.35, pop(1200), 0.10)
    for j in range(3):
        put(fx, a + 1.4 + j * 0.25, pop(900 + j * 150), 0.12, pan=(j - 1) * 0.3)
e = scene_start("fin")
put(fx, e - 0.1, whoosh(0.7), 0.14)
put(fx, e + 0.3, chime([783.99, 987.77, 1174.66, 1567.98], 2.2), 0.18)
for i in range(6):
    put(fx, e + 1.1 + i * 0.1, pop(1000 + i * 80), 0.10)
put(fx, e + 1.5, chime([1046.5, 1318.5], 1.2), 0.12)

# ----- Voix + baisse de la musique sous la voix -----
for i, v in enumerate(voices):
    put(voice, S[i], v, 1.0)
lvl = np.convolve(np.abs(voice), np.ones(int(0.12 * SR)) / int(0.12 * SR), mode="same")
duck = 1 - 0.55 * np.clip(lvl / 0.05, 0, 1)
duck = np.convolve(duck, np.ones(int(0.2 * SR)) / int(0.2 * SR), mode="same")
mix = music * duck[:, None] * 0.8 + fx + np.stack([voice, voice], 1) * 0.95
mix /= max(1e-6, np.abs(mix).max()) / 0.95
with wave.open(OUT, "w") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
print(json.dumps({"duree": duration, "phrases": [round(x, 2) for x in D]}))
