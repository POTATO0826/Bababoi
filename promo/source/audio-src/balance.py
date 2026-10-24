# Music vs effects at each cue: RMS in a 150 ms window after the event, full band and 0.8–4.5 kHz (where clicks live).
#   python3 balance.py <sound-data.json> <stems dir>
import json, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile
d = json.load(open(sys.argv[1]))
sr, m = wavfile.read(sys.argv[2] + "/music.wav")
_, s = wavfile.read(sys.argv[2] + "/sfx.wav")
b, a = signal.butter(2, [800 / (sr / 2), 4500 / (sr / 2)], "band")
mb, sb = signal.lfilter(b, a, m.mean(1)), signal.lfilter(b, a, s.mean(1))
db = lambda x: 20 * np.log10(np.sqrt(np.mean(x**2)) + 1e-9)
rows = []
for c in d["cues"]:
    i0 = int(c["f"] / 30 * sr)
    i1 = i0 + int(0.15 * sr)
    rows.append((c["f"], c["k"], db(s[i0:i1].mean(1)) - db(m[i0:i1].mean(1)), db(sb[i0:i1]) - db(mb[i0:i1])))
for f, k, full, band in rows:
    print(f"f{f:4d} {k:9s}  sfx−music {full:+6.1f} dB full · {band:+6.1f} dB at 0.8–4.5 kHz")
