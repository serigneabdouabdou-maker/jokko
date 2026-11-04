"""Vrais sons pour les pubs Jokko.
Ambiances réelles : moodist (CC0 / licence Pixabay) ; bruitages réels : Kenney RPG Audio (CC0) ;
bruitages modélisés de qualité : wyzowl/sfx-kit (CC0)."""
import os, subprocess, numpy as np
SR = 48000
H = os.path.expanduser("~")
LIB = {"amb": f"{H}/moodist/public/sounds", "kenney": f"{H}/kenney-rpg", "kit": f"{H}/sfx-kit/sounds"}
_cache = {}

def find(lib, name):
    root = LIB[lib]
    for d, _, fs in os.walk(root):
        for f in fs:
            if os.path.splitext(f)[0] == name: return os.path.join(d, f)
    raise FileNotFoundError(f"{lib}:{name}")

def load(lib, name, start=0.0, dur=None):
    """Charge un son en mono 48 kHz (numpy float), normalisé au pic 0,9."""
    k = (lib, name, start, dur)
    if k in _cache: return _cache[k]
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", find(lib, name)]
    if dur: cmd += ["-t", str(dur)]
    cmd += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).astype(np.float64)
    if len(x): x = x / (np.abs(x).max() + 1e-9) * 0.9
    _cache[k] = x
    return x

def bed(mix, lib, name, t0, t1, gain, fade=1.2, start=5.0):
    """Ambiance de fond entre t0 et t1, avec fondus (prend le milieu du fichier, pas le début)."""
    x = load(lib, name, start, t1 - t0).copy()
    n = len(x); f = int(fade * SR)
    if n > 2 * f:
        x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    mix.put(t0, x, gain)

def hit(mix, t, lib, name, gain, pan=0.0):
    """Bruitage calé sur son pic mesuré à l'instant t."""
    x = load(lib, name)
    peak = int(np.argmax(np.abs(x))) / SR
    mix.put(max(0, t - peak), x, gain, pan)
