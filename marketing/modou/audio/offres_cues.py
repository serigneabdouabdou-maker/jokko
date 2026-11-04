from sfx.synth import blip, chime, click, envelope, impact, pad, pop, riser, whoosh
# Musique joyeuse et confiante : Do / Fa / Sol / La mineur, tempo 104.
C = [130.81, 196.0, 261.63, 329.63, 392.0, 523.25]; F = [174.61, 261.63, 349.23, 440.0, 523.25]
G = [196.0, 246.94, 293.66, 392.0, 493.88]; Am = [110.0, 164.81, 220.0, 261.63, 329.63]
def score(mix, T):
    put = mix.put; S = T["s"]; D = T["d"]; dur = T["duration"]
    sc = lambda k: S[k] - 0.4
    chords = [(0, C), (sc(1), F), (sc(2), C), (sc(2) + 6, G), (sc(3), F), (sc(3) + 6.5, G), (sc(4), Am), (sc(4) + 7, F), (sc(5), G), (sc(6), C)]
    vol = envelope([(0, 0), (0.8, 0.9), (dur - 2.0, 1.0), (dur, 0)])
    mix.put_stereo(0, *pad(dur, chords, volume=vol), gain=0.06)
    t, b, k = 0.4, 60 / 104, 0
    while t < dur - 2.3:
        put(t, blip(58, dur=0.3, tau=0.08), 0.22)
        put(t + b / 2, click(5200, dur=0.02), 0.03)
        if k % 2: put(t + b * 0.75, click(3800, dur=0.02), 0.022)
        t += b; k += 1
    # 1. trois cartes en éventail
    for i in range(3): put(0.3 + i * 0.15, whoosh(0.35, 600, 3200, peak=0.4), 0.08); put(0.55 + i * 0.15, pop(700 + i * 150, 380), 0.18)
    # 2. le cadeau s'ouvre
    g = sc(1)
    put(g - 0.2, whoosh(0.6, 400, 2600, peak=0.5), 0.12)
    put(g + 0.7, riser(0.4), 0.1); put(g + 1.05, impact(0.8), 0.2); put(g + 1.1, chime([1046.5, 1318.5, 1568.0, 2093.0], dur=1.4, tau=0.5), 0.15)
    for i in range(8): put(g + 1.15 + i * 0.07, click(3000 + i * 260, dur=0.02), 0.05)
    # 3-5. chaque carte : arrivée, prix qui monte, coches
    for c in range(3):
        a = sc(2 + c); span = D[2 + c]
        put(a - 0.1, whoosh(0.6, 400, 2800, peak=0.5), 0.13); put(a + 0.35, pop(600 + c * 120, 320), 0.2)
        if c:
            for i in range(10): put(a + 0.6 + i * 0.12, blip(900 + i * 70, dur=0.05, tau=0.02), 0.045)
            put(a + 1.8, chime([1568.0, 2093.0], dur=0.7, tau=0.25), 0.12)
        for j in range(5):
            put(a + 1.6 + j * (span - 2.6) / 5, pop(900 + j * 90, 500, dur=0.1), 0.15)
    # 6. Wave
    w = sc(5)
    put(w - 0.1, whoosh(0.6, 400, 2800, peak=0.5), 0.12)
    for i in range(3): put(w + 0.1 + i * 0.15, pop(800 + i * 140, 400), 0.16)
    put(w + 0.6, chime([1174.66, 1567.98], dur=0.7, tau=0.25), 0.14)
    put(w + 2.6, whoosh(0.6, 800, 4000, peak=0.5), 0.1)
    # 7. fin
    e = sc(6)
    put(e - 0.4, whoosh(0.8, 400, 3200, peak=0.6), 0.15); put(e, impact(1.0), 0.22); put(e + 0.35, pop(1100, 550), 0.2)
    put(e + 1.2, chime([523.25, 659.25, 783.99, 1046.5], dur=2.6, tau=1.0), 0.15)
