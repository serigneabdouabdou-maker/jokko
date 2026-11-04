import sys
sys.path.insert(0, "/root/claude-motion")
from sfx.mix import Mix
from sfx.synth import blip, chime, click, envelope, impact, pad, pop, riser, whoosh
C = [130.81, 196.0, 261.63, 329.63, 392.0, 523.25]; F = [174.61, 261.63, 349.23, 440.0, 523.25]; G = [196.0, 246.94, 293.66, 392.0, 493.88]
def intro():
    d = 5.0; m = Mix(d); p = m.put
    m.put_stereo(0, *pad(d, [(0, C), (2.4, F)], volume=envelope([(0, 0), (0.4, 1), (d - 0.6, 1), (d, 0)])), gain=0.06)
    p(0.0, whoosh(0.55, 300, 3000, peak=0.5), 0.18); p(0.3, impact(1.0), 0.3); p(0.4, pop(700, 1200, dur=0.14), 0.3)
    p(0.75, chime([784.0, 1046.5, 1568.0], dur=1.6, tau=0.6), 0.16)
    for i in range(8): p(0.85 + i * 0.09, blip(1200 + i * 110, dur=0.06, tau=0.02), 0.05)
    for i in range(4): p(1.75 + i * 0.22, pop(800 + i * 140, 400), 0.24)
    t = 0.6
    while t < d - 0.6: p(t, blip(58, dur=0.3, tau=0.08), 0.22); p(t + 0.3, click(5200, dur=0.02), 0.03); t += 0.6
    p(d - 0.5, whoosh(0.5, 3000, 300, peak=0.4), 0.18); p(d - 0.08, click(900, dur=0.04), 0.15)
    print(m.master(target_lufs=-14.0)); m.write("audio/intro.wav")
def fin():
    d = 6.5; m = Mix(d); p = m.put
    m.put_stereo(0, *pad(d, [(0, F), (2.0, G), (4.2, C)], volume=envelope([(0, 0), (0.4, 1), (d - 1.0, 1), (d, 0)])), gain=0.06)
    p(0.0, whoosh(0.5, 300, 3000, peak=0.5), 0.18); p(0.3, pop(700, 1200, dur=0.14), 0.28)
    p(0.7, chime([784.0, 1046.5], dur=1.2, tau=0.5), 0.13)
    for i in range(3): p(1.55 + i * 0.45, pop(900 + i * 160, 450), 0.24)
    t = 0.6
    while t < d - 0.9: p(t, blip(58, dur=0.3, tau=0.08), 0.22); p(t + 0.3, click(5200, dur=0.02), 0.03); t += 0.6
    p(d - 0.75, whoosh(0.7, 3000, 300, peak=0.5), 0.18); p(d - 0.1, impact(0.9), 0.25)
    p(d - 1.6, chime([523.25, 659.25, 783.99, 1046.5], dur=1.6, tau=0.7), 0.14)
    print(m.master(target_lufs=-14.0)); m.write("audio/fin.wav")
intro(); fin()
