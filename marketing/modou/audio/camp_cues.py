import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sfx.synth import blip, click, envelope, pad, impact
from real import bed, hit
C = [130.81, 196.0, 261.63, 329.63, 392.0, 523.25]; F = [174.61, 261.63, 349.23, 440.0, 523.25]
G = [196.0, 246.94, 293.66, 392.0, 493.88]; Am = [110.0, 164.81, 220.0, 261.63, 329.63]

def score(mix, T, B=False):
    put = mix.put; S = T["s"]; D = T["d"]; dur = T["duration"]
    c1, c2, c3, c4 = S[1] - 0.2, S[2] - 0.25, S[3] - 0.3, S[4] - 0.3
    chords = [(0, Am if B else C), (c1, F), (c2, C), (c2 + 4, G), (c3, Am), (c4, F), (c4 + 1.6, C)]
    vol = envelope([(0, 0.6), (c1, 1.0), (dur - 1.5, 1.0), (dur, 0)])
    mix.put_stereo(0, *pad(dur, chords, volume=vol), gain=0.055)
    # rythme : démarre fort sur « Wax rekk »
    t, b, k = c1, 60 / 112, 0
    while t < dur - 1.6:
        if not (c3 <= t < c4): put(t, blip(56, dur=0.3, tau=0.08), 0.26)
        put(t + b / 2, click(5200, dur=0.02), 0.03)
        if k % 2: put(t + b * 0.75, click(3800, dur=0.02), 0.022)
        t += b; k += 1
    # ambiances réelles
    bed(mix, "amb", "busy-street", 0, c1 + 0.3, 0.16, fade=0.3, start=30)
    bed(mix, "amb", "crowd", 0, c1 + 0.3, 0.06, fade=0.3, start=15)
    bed(mix, "amb", "crickets", c3 - 0.1, c4 + 0.4, 0.14, fade=0.4)
    bed(mix, "amb", "busy-street", c4, dur, 0.06, fade=0.8, start=80)
    # scène 1
    if not B:
        hit(mix, S[0] + 0.45, "kit", "notification-message-out-soft", 0.35)
        for i in range(2): hit(mix, S[0] + 0.95 + i * 0.55, "kit", "foley-card-touch", 0.3)
        hit(mix, S[0] + 1.0, "kenney", "drop_leather", 0.25)
    else:
        for i in range(3): hit(mix, 0.55 + i * 0.25, "kit", "pop-soft" if False else "foley-paper-touch", 0.3)
    hit(mix, 0.2, "kit", "whoosh-fast-medium", 0.3)
    # scène 2 : claque du titre
    hit(mix, c1 + 0.02, "kit", "whoosh-fast-hard", 0.35)
    put(c1 + 0.08, impact(0.9), 0.3)
    put(c1 + 0.58, impact(0.7), 0.24)
    # scène 3 : 4 tuiles
    step = max(0.5, (D[2] - 1.4) / 4)
    hit(mix, c2 - 0.05, "kit", "whoosh-medium-soft", 0.3)
    for i in range(4): hit(mix, c2 + 0.2 + i * step, "kit", "foley-card-slide", 0.35)
    hit(mix, c2 + D[2] - 1.15, "kit", "notification-success-pluck", 0.3)
    # scène 4 : le soir
    hit(mix, c3 + 0.55, "kit", "phone-vibrate-hand", 0.45)
    hit(mix, c3 + 0.6, "kit", "notification-message-in-soft", 0.4)
    hit(mix, c3 + 1.35, "kit", "money-coin-stack", 0.3)
    # scène 5 : fin
    hit(mix, c4 - 0.1, "kit", "whoosh-medium-medium", 0.3)
    hit(mix, c4 + 0.3, "kit", "sting-warm-short", 0.4)
    hit(mix, c4 + 1.45, "kit", "notification-success-bubble", 0.4)
    hit(mix, c4 + 1.5, "kit", "money-register", 0.3)
