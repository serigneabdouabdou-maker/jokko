import json, sys, importlib.util
sys.path.insert(0, "/root/claude-motion")
from sfx.mix import Mix
T = json.load(open("timing.json"))
spec = importlib.util.spec_from_file_location("c", "audio/cues.py"); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
mix = Mix(T["duration"]); m.score(mix, T); print(mix.master(target_lufs=-20.0)); mix.write("audio/music.wav")
