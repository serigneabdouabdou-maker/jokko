import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from sfx.synth import blip, click, envelope, pad
from real import bed, hit
Am = [110.0, 164.81, 220.0, 261.63, 329.63]; Dm = [146.83, 220.0, 293.66, 349.23]; Em = [164.81, 246.94, 329.63, 392.0]
C = [130.81, 196.0, 261.63, 329.63, 392.0, 523.25]; F = [174.61, 261.63, 349.23, 440.0, 523.25]; G = [196.0, 246.94, 293.66, 392.0, 493.88]

def score(mix, T):
    put = mix.put; S = T["s"]; dur = T["duration"]
    turn = S[2] + 3.7
    # musique (inchangée, un peu plus basse pour laisser vivre les ambiances)
    chords = [(0, Am), (S[1], Dm), (S[1] + 4.8, Em), (S[2], Am), (turn, C), (S[3], F), (S[4], G), (S[5], C), (S[5] + 4.6, F), (S[6], G), (S[6] + 4.4, C)]
    vol = envelope([(0, 0), (1.0, 0.5), (turn - 0.4, 0.45), (turn, 1.0), (dur - 2.0, 1.0), (dur, 0)])
    mix.put_stereo(0, *pad(dur, chords, volume=vol), gain=0.05)
    t, b, k = turn, 60 / 100, 0
    while t < dur - 2.2:
        put(t, blip(58, dur=0.3, tau=0.08), 0.2)
        if k % 2: put(t + b / 2, click(5200, dur=0.02), 0.025)
        t += b; k += 1
    # ---- ambiances réelles ----
    home = S[5] + 4.55               # Modou rentre chez lui (nuit)
    bed(mix, "amb", "night-village", 0, S[2] + 0.4, 0.16)          # boutique la nuit : grillons, village
    bed(mix, "amb", "clock", 0.3, S[1] + 0.3, 0.10)                 # l'horloge
    bed(mix, "amb", "busy-street", S[2] - 0.6, home + 0.6, 0.11, start=20)   # la journée, rue de Dakar
    bed(mix, "amb", "crowd", turn, home, 0.05, start=10)
    bed(mix, "amb", "crickets", home - 0.4, S[6] + 0.4, 0.10)       # à la maison, le soir
    bed(mix, "amb", "busy-street", S[6] - 0.4, dur - 0.3, 0.09, start=60)
    # ---- scène 2 : le stock part, les pages s'envolent, l'argent file ----
    hit(mix, S[1] - 0.3, "kit", "whoosh-medium-soft", 0.35)
    for i in range(5): hit(mix, S[1] + 0.5 + i * 0.35, "kenney", ["cloth_1", "cloth_2", "cloth_3", "cloth_4", "drop_leather"][i], 0.3)
    for i in range(4): hit(mix, S[1] + 2.75 + 1.3 + i * 0.2, "kenney", f"book_flip_{i % 3 + 1}", 0.32)
    for i in range(3): hit(mix, S[1] + 4.85 + 0.6 + i * 0.35, "kit", "money-notes", 0.28)
    hit(mix, S[1] + 5.3, "kenney", "handle_coins", 0.3)
    # ---- scène 3 : l'ami arrive, le déclic ----
    hit(mix, S[2] - 0.5, "kenney", "door_open_1", 0.4)
    for i in range(4): hit(mix, S[2] - 0.1 + i * 0.42, "kenney", f"footstep_{i}", 0.22)
    hit(mix, turn - 0.6, "kit", "riser-short-soft" if False else "whoosh-slow-soft", 0.3)
    hit(mix, turn, "kit", "notification-success-warm", 0.4)
    # ---- scène 4 : téléchargement, l'appli s'ouvre ----
    for i in range(6): hit(mix, S[3] + 0.5 + i * 0.22, "kit", "phone-keypad", 0.18)
    hit(mix, S[3] + 1.9, "kit", "notification-success-soft", 0.35)
    hit(mix, S[3] + 2.75, "kit", "foley-glass-touch", 0.35)
    hit(mix, S[3] + 3.1, "kit", "notification-success-sparkle", 0.32)
    # ---- scène 5 : la vente dite, puis enregistrée ----
    hit(mix, S[4] - 0.3, "kit", "whoosh-fast-soft", 0.3)
    hit(mix, S[4] + 5.65, "kit", "notification-success-chime", 0.42)
    hit(mix, S[4] + 5.7, "kit", "money-coin-drop", 0.25)
    # ---- scène 6 : trois cartes, puis notification à la maison ----
    for i in range(3): hit(mix, S[5] + 0.35 + i * 0.55, "kit", "foley-card-slide", 0.35)
    hit(mix, home + 0.5, "kenney", "door_close_1", 0.3)
    hit(mix, home + 1.0, "kit", "phone-vibrate-hand", 0.4)
    hit(mix, home + 1.05, "kit", "notification-message-in-soft", 0.35)
    # ---- scène 7 : calendrier, bénéfice, caisse ----
    for i in range(2): hit(mix, S[6] + 0.25 + i * 0.5, "kenney", f"book_flip_{i + 1}", 0.32)
    hit(mix, S[6] + 2.75, "kit", "money-register", 0.45)
    hit(mix, S[6] + 2.8, "kenney", "handle_coins_2", 0.3)
    # ---- fin : logo ----
    end = S[6] + 4.4
    hit(mix, end - 0.2, "kit", "whoosh-medium-medium", 0.35)
    hit(mix, end + 0.35, "kit", "sting-warm-long", 0.45)
