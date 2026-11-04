from sfx.synth import blip, chime, click, envelope, impact, pad, pop, riser, whoosh, scratch
# Do mineur pour le problème, Do / Fa / Sol majeur quand Jokko arrive.
Am = [110.0, 164.81, 220.0, 261.63, 329.63]; Dm = [146.83, 220.0, 293.66, 349.23]; Em = [164.81, 246.94, 329.63, 392.0]
C = [130.81, 196.0, 261.63, 329.63, 392.0, 523.25]; F = [174.61, 261.63, 349.23, 440.0, 523.25]; G = [196.0, 246.94, 293.66, 392.0, 493.88]
def score(mix, T):
    put = mix.put; S = T["s"]; dur = T["duration"]
    turn = S[2] + 3.7          # « Jéemal Jokko ! »
    chords = [(0, Am), (S[1], Dm), (S[1] + 4.8, Em), (S[2], Am), (turn, C), (S[3], F), (S[4], G), (S[5], C), (S[5] + 4.6, F), (S[6], G), (S[6] + 4.4, C)]
    vol = envelope([(0, 0), (1.0, 0.55), (turn - 0.4, 0.5), (turn, 1.1), (dur - 2.0, 1.05), (dur, 0)])
    mix.put_stereo(0, *pad(dur, chords, volume=vol), gain=0.055)
    # pulsation douce : lente pendant le problème, plus vive après
    t, b = 1.0, 60 / 76
    while t < turn - 0.3:
        put(t, blip(55, dur=0.35, tau=0.12), 0.18); t += b * 2
    t, b = turn, 60 / 100
    k = 0
    while t < dur - 2.2:
        put(t, blip(58, dur=0.3, tau=0.08), 0.24)
        put(t + b / 2, click(5200, dur=0.02), 0.03)
        if k % 2: put(t + b * 0.75, click(3800, dur=0.02), 0.025)
        t += b; k += 1
    # scène 1 : horloge, soupir de la nuit
    for i in range(10): put(0.8 + i * 0.6, click(3000 if i % 2 else 2400, dur=0.015), 0.05)
    for i, a in enumerate([1.2, 1.75, 2.3, 2.85, 3.4]): put(a, pop(420 - i * 20, 300, dur=0.14), 0.12)
    # scène 2 : stock qui disparaît, pages qui s'envolent, billets qui partent
    put(S[1] - 0.5, whoosh(0.6, 300, 1800, peak=0.5), 0.14)
    for i in range(5): put(S[1] + 0.5 + i * 0.35, pop(500 - i * 40, 250, dur=0.12), 0.14)
    put(S[1] + 2.75, whoosh(0.5, 400, 2400, peak=0.5), 0.12)
    for i in range(4): put(S[1] + 2.75 + 1.3 + i * 0.2, whoosh(0.35, 1200, 5200, peak=0.4), 0.08)
    put(S[1] + 4.85, whoosh(0.5, 400, 2400, peak=0.5), 0.12)
    for i in range(7): put(S[1] + 4.85 + 0.6 + i * 0.18, blip(2200 + i * 90, dur=0.12, tau=0.04), 0.05)
    # scène 3 : l'ami arrive, le déclic
    put(S[2] - 0.4, whoosh(0.7, 300, 2000, peak=0.5), 0.12)
    put(turn - 1.0, riser(1.0), 0.14); put(turn, impact(1.0), 0.28); put(turn + 0.05, pop(800, 400), 0.2)
    # scène 4 : téléchargement, icône, toucher, ouverture
    put(S[3] - 0.4, whoosh(0.6, 400, 2600, peak=0.5), 0.12)
    for i in range(6): put(S[3] + 0.5 + i * 0.22, click(2600 + i * 200, dur=0.02), 0.06)
    put(S[3] + 1.9, chime([1046.5, 1568.0], dur=0.8, tau=0.3), 0.12)
    put(S[3] + 2.15, pop(700, 1100, dur=0.12), 0.2)
    put(S[3] + 2.75, click(1800, dur=0.03), 0.2)
    put(S[3] + 3.1, chime([784.0, 1174.66, 1568.0], dur=1.2, tau=0.45), 0.13)
    # scène 5 : la phrase dite, puis « c'est enregistré »
    put(S[4] - 0.4, whoosh(0.6, 400, 2600, peak=0.5), 0.12)
    put(S[4] + 5.15, whoosh(0.5, 500, 3000, peak=0.5), 0.12)
    put(S[4] + 5.65, chime([1318.5, 1760.0, 2093.0], dur=1.3, tau=0.45), 0.15); put(S[4] + 5.65, pop(900, 450), 0.22)
    # scène 6 : trois cartes, puis notification à la maison
    for i in range(3): put(S[5] - 0.25 + i * 0.55, whoosh(0.35, 600, 3200, peak=0.4), 0.09); put(S[5] + 0.35 + i * 0.55, pop(800 + i * 140, 400), 0.2)
    note = S[5] + 4.55 + 1.0
    put(note, chime([1174.66, 1567.98], dur=0.7, tau=0.25), 0.15)
    for i in range(3): put(note + 0.05 + i * 0.12, click(180, dur=0.05), 0.12)
    # scène 7 : le calendrier tourne, le bénéfice monte, « ka-ching »
    for i in range(2): put(S[6] - 0.45 + 0.7 + i * 0.5, scratch(0.18) if callable(scratch) else click(900), 0.12)
    for i in range(14): put(S[6] - 0.45 + 1.6 + i * 0.11, blip(900 + i * 60, dur=0.06, tau=0.02), 0.05)
    put(S[6] - 0.45 + 3.2, chime([2093.0, 2637.0], dur=0.9, tau=0.3), 0.14); put(S[6] - 0.45 + 3.2, click(4200, dur=0.04), 0.2)
    # fin : logo
    end = S[6] + 4.4
    put(end - 0.5, whoosh(0.8, 400, 3200, peak=0.6), 0.15); put(end - 0.1, impact(1.0), 0.22)
    put(end + 0.35, pop(1100, 550), 0.2)
    put(end + 1.4, chime([523.25, 659.25, 783.99, 1046.5], dur=2.6, tau=1.0), 0.15)
