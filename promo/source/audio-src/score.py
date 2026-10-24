# WareOrb promo v3b · music and sound design, synthesised in code (no samples, no voice).
#   python3 score.py <sound-data.json> <out dir>
# Reads the film's own cues and curves (export-sound.mjs → window.soundData), so a retimed beat takes its sound with it.
# Writes music.wav and sfx.wav (stems) and WareOrb-promo-score.wav (the mix), 48 kHz stereo float32.
#
# One room, one palette (struck tones, a marimba-like bar, air, wood clicks, a felt sub), fewer events than beats.
# 120 BPM in D major; the groove enters with "Capture stock.", breathes out on the approval hold, and resolves on the
# mark fill. SFX sit above the music (the music ducks under them).
import json, os, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
FPS = 30
data = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
T = data["T"]
NFR = data["frames"]
DUR = NFR / FPS
N = int(SR * DUR)
rng = np.random.default_rng(20261024)
ft = lambda f: f / FPS  # frame → seconds
BEAT = 0.5  # 120 BPM


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def lp(x, f, order=2):
    b, a = signal.butter(order, min(f, SR / 2 - 200) / (SR / 2))
    return signal.lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), "high")
    return signal.lfilter(b, a, x)


def bp(x, f, q=1.0):
    b, a = signal.iirpeak(min(f, SR / 2 - 300) / (SR / 2), q)
    return signal.lfilter(b, a, x)


def sweep_bp(x, f0, f1, q=1.2, blocks=32):
    n = len(x)
    out = np.zeros(n)
    L = n // blocks + 1
    for i in range(blocks):
        a, b = i * L, min(n, (i + 1) * L)
        if a >= n:
            break
        f = f0 * (f1 / f0) ** (i / max(1, blocks - 1))
        seg = bp(x[max(0, a - 512) : b], f, q)
        out[a:b] = seg[-(b - a) :]
    return out


def env_ad(n, a, d):
    """attack (s) then exponential decay with time-constant d (s)"""
    t = tt(n)
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)


# ── materials (mono) ───────────────────────────────────────────────────────
def strike(f, dur=1.2, bright=1.0, decay=0.35):
    """a struck glass-like tone: fundamental + inharmonic partials with faster decays + a tiny noise transient"""
    n = int(SR * dur)
    t = tt(n)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / decay)
    s += 0.32 * bright * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / (decay * 0.35))
    s += 0.14 * bright * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t / (decay * 0.18))
    tr = lp(hp(rng.standard_normal(n), 2500), 9000) * np.exp(-t * 250) * 0.25
    return (s + tr) * np.minimum(1, t / 0.002)


def bar(f, dur=0.6, vel=1.0):
    """a marimba-like bar: partials ≈ 1 : 3.93 : 10.6, mallet thump, short tail (pitched runs stay above F4)"""
    n = int(SR * dur)
    t = tt(n)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.22)
    s += 0.28 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.05)
    s += 0.07 * np.sin(2 * np.pi * f * 10.6 * t) * np.exp(-t / 0.015)
    thump = lp(rng.standard_normal(n), 900) * np.exp(-t * 180) * 0.25
    return (s + thump) * vel * np.minimum(1, t / 0.0015)


def air(dur, f0, f1, q=1.3, peak=0.45):
    """filtered air whose centre glides f0 → f1; envelope peaks at `peak` of the duration"""
    n = int(SR * dur)
    x = sweep_bp(rng.standard_normal(n), f0, f1, q)
    x = lp(x, 7000)
    u = tt(n) / dur
    e = np.where(u < peak, (u / peak) ** 1.6, ((1 - u) / (1 - peak)) ** 1.3)
    x = x * e
    return x / (np.abs(x).max() + 1e-9)


def click(f=2400, dur=0.05, body=210):
    """a small tactile click: a filtered snap + a muted body knock"""
    n = int(SR * dur)
    t = tt(n)
    snap = bp(rng.standard_normal(n), f, 2.5) * np.exp(-t * 520)
    knock = np.sin(2 * np.pi * body * t * (1 + 0.25 * np.exp(-t * 120))) * np.exp(-t * 70)
    return snap * 0.6 + knock * 0.55


def sub(f=55, dur=0.8, drop=1.8):
    """a felt low hit: sine with a pitch drop, gently saturated"""
    n = int(SR * dur)
    t = tt(n)
    ph = np.cumsum(2 * np.pi * f * (1 + drop * np.exp(-t * 30)) / SR)
    s = np.sin(ph) * np.exp(-t / 0.22)
    return np.tanh(s * 1.6) / np.tanh(1.6) * np.minimum(1, t / 0.003)


def kick(dur=0.35):
    n = int(SR * dur)
    t = tt(n)
    ph = np.cumsum(2 * np.pi * (46 + 75 * np.exp(-t * 38)) / SR)
    s = np.sin(ph) * np.exp(-t / 0.09)
    return np.tanh(s * 1.3) * np.minimum(1, t / 0.002)


def tick(dur=0.03):
    n = int(SR * dur)
    t = tt(n)
    return hp(rng.standard_normal(n), 7000) * np.exp(-t * 240)


def pad_note(f, dur, a=0.6, r=0.9, cutoff=1800):
    """a soft pad voice: two detuned triangle-ish voices (odd harmonics), low-passed, slow attack and release"""
    n = int(SR * dur)
    t = tt(n)
    s = np.zeros(n)
    for det in (-0.0035, 0.0035):
        for h, g in ((1, 1.0), (3, 1 / 9), (5, 1 / 25)):
            s += g * np.sin(2 * np.pi * f * (1 + det) * h * t + rng.uniform(0, 6.28))
    e = np.minimum(1, t / a) * np.minimum(1, np.maximum(0, (dur - t)) / r)
    return lp(s * e, cutoff)


def bass_note(f, dur, vel=1.0):
    n = int(SR * dur)
    t = tt(n)
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)
    e = np.minimum(1, t / 0.012) * np.exp(-t / 0.9) * np.minimum(1, np.maximum(0, dur - t) / 0.08)
    return lp(s * e, 600) * vel


# ── buses ──────────────────────────────────────────────────────────────────
class Bus:
    def __init__(self):
        self.dry = np.zeros((N + SR * 3, 2))
        self.wet = np.zeros((N + SR * 3, 2))

    def place(self, sig, t, gain=1.0, pan=0.0, send=0.25, pan_to=None):
        sig = np.asarray(sig, float)
        i0 = int(round(t * SR))
        if i0 < 0:
            sig, i0 = sig[-i0:], 0
        n = min(len(sig), len(self.dry) - i0)
        if n <= 0:
            return
        sig = sig[:n]
        p = np.linspace(pan, pan if pan_to is None else pan_to, n)
        L, R = np.sqrt(0.5 * (1 - p)), np.sqrt(0.5 * (1 + p))
        self.dry[i0 : i0 + n, 0] += sig * gain * L
        self.dry[i0 : i0 + n, 1] += sig * gain * R
        self.wet[i0 : i0 + n, 0] += sig * gain * send * L
        self.wet[i0 : i0 + n, 1] += sig * gain * send * R


def room(T60=1.4):
    """one synthetic room for everything: decorrelated decaying noise, 14 ms pre-delay, a few early reflections"""
    n = int(SR * T60 * 1.2)
    t = tt(n)
    ir = rng.standard_normal((n, 2)) * np.exp(-6.9 * t / T60)[:, None]
    ir = np.stack([lp(ir[:, 0], 4200), lp(ir[:, 1], 3800)], 1)
    ir[: int(SR * 0.014)] = 0
    for d, g in ((0.019, 0.45), (0.031, 0.32), (0.047, 0.22)):
        ir[int(d * SR)] += g * rng.uniform(0.6, 1, 2)
    return ir / np.sqrt((ir**2).sum(0)).max() * 0.9


IR = room()


def render(bus):
    rev = np.stack([signal.fftconvolve(bus.wet[:, c], IR[:, c])[: len(bus.dry)] for c in (0, 1)], 1)
    return bus.dry + rev


music, sfx = Bus(), Bus()
pan_x = lambda x: float(np.clip((x - 960) / 960 * 0.6, -0.65, 0.65))

# ── harmony: one chord per bar (2 s), the last two halved into the cadence; resolution on the fill ──────────
CH = [
    (0, 60, [50, 57, 61, 64, 66]),  # Dmaj9 — the mark
    (60, 120, [47, 54, 57, 61, 62]),  # Bm9 — the warehouse builds
    (120, 180, [43, 50, 54, 57, 59]),  # Gmaj9 — capture
    (180, 240, [45, 52, 59, 62, 66]),  # A6sus4 — posted, to the bay
    (240, 300, [47, 54, 57, 61, 62]),  # Bm9 — ageing (violet)
    (300, 360, [42, 49, 52, 57, 61]),  # F#m7 — hand off, quotes
    (360, 420, [43, 50, 54, 57, 59]),  # Gmaj9 — approve
    (420, 480, [45, 50, 52, 57, 59]),  # Asus — reserve, collect
    (480, 540, [42, 50, 57, 62, 64]),  # D/F# — freed, reorder
    (540, 555, [40, 47, 50, 54, 55]),  # Em9
    (555, T["markClose"] - 1, [45, 50, 52, 55, 59]),  # A7sus4 — the reel-in
    (T["markClose"] - 1, NFR, [38, 45, 54, 57, 61, 64]),  # Dmaj9 — the fill
]


def chord_at(f):
    for a, b, notes in CH:
        if a <= f < b:
            return notes
    return CH[-1][2]


# pad: every chord, softly; louder in the opening and the end card, recessive under the groove
for a, b, notes in CH:
    dur = ft(b - a) + 0.9
    lvl = 0.05 if a < 110 or a >= T["markClose"] - 1 else 0.028
    for m in notes:
        music.place(pad_note(midi(m + 12), dur, a=0.5 if a else 1.2, r=1.0, cutoff=1500 if a < 540 else 2400), ft(a), lvl, pan=rng.uniform(-0.35, 0.35), send=0.55)

GROOVE = (120, T["markClose"] - 1)  # the pulse enters on the beat after "Capture stock." and stops on the fill
BREATH = (T["pressApprove"], T["pressApprove"] + 15)  # one beat of air after the owner approves
in_groove = lambda f: GROOVE[0] <= f < GROOVE[1] and not (BREATH[0] <= f < BREATH[1])

# bass: chord roots on beats 1 and 3
for beat in range(int(DUR / BEAT)):
    f = beat * 15
    if not in_groove(f) or beat % 2:
        continue
    root = chord_at(f)[0]
    music.place(bass_note(midi(root - 12 if root > 45 else root), BEAT * 2 - 0.02, 0.9), ft(f), 0.22, send=0.08)

# kick on every beat (softer on 2 and 4), off-beat ticks from the ageing scene on
for beat in range(int(DUR / BEAT)):
    f = beat * 15
    if in_groove(f):
        music.place(kick(), ft(f), 0.26 if beat % 2 == 0 else 0.15, send=0.05)
    if in_groove(f + 7.5) and f >= 240:
        music.place(tick(), ft(f + 7.5) + rng.uniform(-0.004, 0.004), 0.05, pan=0.25, send=0.15)

# ostinato: eighth notes on the chord's upper tones, F#4 and above, short tails, gently humanised
PATTERN = [0, 2, 1, 3, 2, 4, 1, 3]
for i in range(int(DUR / (BEAT / 2))):
    f = i * 7.5
    if not in_groove(f) or f < 180:
        continue
    notes = [m for m in chord_at(f) if m >= 54]
    up = sorted({m + 12 for m in notes})
    m = up[PATTERN[i % 8] % len(up)]
    vel = 0.75 if i % 2 == 0 else 0.5
    music.place(bar(midi(m), 0.45, vel), ft(f) + rng.uniform(-0.006, 0.006), 0.062, pan=0.3 * np.sin(i * 0.9), send=0.3)

# a short build into the reel-in, then the cadence
music.place(air(ft(T["markClose"] - T["journey"]), 300, 5200, 1.1, 0.95), ft(T["journey"]), 0.12, send=0.5)

# ── sound effects, placed from the film's own cues ─────────────────────────
tip = data["tip"]
cam = np.array(data["cam"])
rail = data["rail"]
tipx = lambda f: tip[int(min(max(f, 0), NFR - 1))][0] if tip[int(min(max(f, 0), NFR - 1))] else 960


def close_note(f):
    ups = [m + 24 for m in chord_at(f) if m + 24 >= 69]
    return midi(ups[0] if ups else chord_at(f)[-1] + 12)


for c in data["cues"]:
    f, k = c["f"], c["k"]
    t = ft(f)
    p = pan_x(tipx(f))
    if k == "draw":
        sfx.place(strike(midi(86), 1.6, 0.6, 0.6), t, 0.10, pan=p, send=0.6)  # the ink ignites
    elif k == "whoosh":
        sfx.place(air(ft(c["d"]), 200, 2600, 1.2, 0.6), t, 0.32, pan=0, send=0.5)
    elif k == "assemble":
        # racks and furniture land: a soft granular patter whose density follows the assembly, never one sound each
        span = c["d"]
        for g in range(70):
            u = rng.beta(1.6, 2.2)
            tg = t + u * ft(span)
            sfx.place(click(rng.uniform(1600, 3200), 0.04, rng.uniform(150, 260)), tg, 0.05 + 0.05 * rng.random(), pan=rng.uniform(-0.5, 0.5), send=0.35)
        sfx.place(sub(52, 1.2, 1.2), ft(T["twinOpen"]), 0.26, send=0.25)  # the twin opens
    elif k == "close":
        sfx.place(bar(close_note(f), 0.9, 1.0), t, 0.16, pan=p, send=0.45)
        sfx.place(strike(close_note(f) * 2, 0.8, 0.5, 0.25), t + 0.01, 0.05, pan=p, send=0.5)
    elif k == "card":
        sfx.place(air(0.42, 500, 2600, 1.6, 0.35), t - 0.12, 0.13, pan=p, send=0.45)
        sfx.place(strike(close_note(f) * 2, 0.5, 0.3, 0.12), t, 0.03, pan=p, send=0.5)
    elif k == "tick":
        sfx.place(click(3600, 0.04, 320), t - ft(1), 0.30, pan=p, send=0.2)
        sfx.place(strike(midi(88), 0.5, 0.4, 0.15), t, 0.05, pan=p, send=0.35)
    elif k == "press":
        # mouse down at the press, up 66 ms later; the wave blooms out of the button
        sfx.place(click(2600, 0.05, 200), t, 0.62, pan=p, send=0.15)
        sfx.place(click(3400, 0.04, 260), t + 0.066, 0.38, pan=p, send=0.15)
        sfx.place(air(0.5, 700, 3600, 1.4, 0.18), t + ft(1), 0.17, pan=p, send=0.55)
        sfx.place(strike(close_note(f + 2), 1.0, 0.35, 0.3), t + ft(2), 0.06, pan=p, send=0.6)
        if f == T["pressApprove"]:
            # the owner's decision: a rising major third, left to ring in the breath
            sfx.place(strike(midi(74), 1.8, 0.5, 0.55), t + ft(3), 0.12, send=0.6)
            sfx.place(strike(midi(78), 1.8, 0.5, 0.55), t + ft(3) + 0.12, 0.11, send=0.6)
    elif k == "lift":
        sfx.place(air(0.35, 900, 2400, 1.8, 0.3), t, 0.10, pan=pan_x(1300), send=0.4)
    elif k == "land":
        for j, d in enumerate((3.2, 4.5, 5.8, 7.0)):
            sfx.place(click(1800, 0.06, 140 + 12 * j), t + ft(d), 0.22, pan=-0.2 + 0.12 * j, send=0.3)
    elif k == "zoom":
        sfx.place(sub(70, 0.5, 0.8), t - ft(2), 0.12, send=0.2)
    elif k == "lock":
        sfx.place(strike(midi(78 if f == T["ageLock"] else 74), 1.1, 0.6, 0.35), t, 0.11, pan=p, send=0.5)
    elif k == "pin":
        sfx.place(strike(midi(88), 1.4, 0.7, 0.45), t, 0.10, pan=p, send=0.55)
        sfx.place(sub(62, 0.4, 0.6), t, 0.08)
    elif k == "rail":
        # the units ride out: air that follows them across the screen
        xs = [r[0] for r in rail if r]
        sfx.place(air(ft(c["d"]) + 0.3, 400, 2200, 1.2, 0.55), t, 0.34, pan=pan_x(xs[0] if xs else 600), pan_to=pan_x(xs[-1] if xs else 1500), send=0.35)
    elif k == "freed":
        for j, m in enumerate((74, 78, 81)):
            sfx.place(bar(midi(m), 0.9, 0.9), t + j * 0.07, 0.11, pan=-0.2 + 0.2 * j, send=0.5)
    elif k == "reel":
        d = ft(c["d"])
        n = int(SR * d)
        tr = tt(n)
        ph = np.cumsum(2 * np.pi * (220 + 900 * (tr / d) ** 2) / SR)
        riser = np.sin(ph) * (tr / d) ** 1.5 * 0.5 + air(d, 400, 6000, 1.0, 0.92) * 0.6
        sfx.place(riser, t, 0.16, send=0.5)
    elif k == "fill":
        # the cadence: the music's own D, a felt low note, and one clear high tone — no stock chime
        sfx.place(sub(midi(38) * 2, 2.2, 0.5), t, 0.30, send=0.3)
        for j, m in enumerate((62, 66, 69, 76)):
            sfx.place(strike(midi(m), 3.0, 0.3, 1.1), t + j * 0.035, 0.07, pan=-0.3 + 0.2 * j, send=0.7)
    elif k == "credit":
        pass

# the underline is drawn under the arithmetic: a short pen stroke is enough (the pen rasp below covers it)

# pen on paper: a faint rasp whose level and brightness follow the tip's speed on screen
spd = np.zeros(NFR)
for f in range(1, NFR):
    a, b = tip[f - 1], tip[f]
    if a and b:
        spd[f] = np.hypot(b[0] - a[0], b[1] - a[1])
spd = np.minimum(spd, 400) / 400
spd = signal.savgol_filter(spd, 7, 2).clip(0, 1)
env = np.interp(tt(N) * FPS, np.arange(NFR), spd)
pan_t = np.interp(tt(N) * FPS, np.arange(NFR), [pan_x(x[0]) if x else 0 for x in tip])
noise = rng.standard_normal(N)
rasp = bp(noise, 3800, 0.9) * 0.6 + bp(noise, 900, 1.2) * 0.4
rasp = lp(rasp * env**1.3, 7500) * 0.10
sfx.place(rasp, 0, 1.0, pan=0, send=0.2)

# the camera's air: whips and punch-ins get their own breath from how fast the frame moves
cv = np.clip(cam / 300, 0, 1.2)
cenv = np.interp(tt(N) * FPS, np.arange(NFR), signal.savgol_filter(cv, 9, 2).clip(0, 1.2))
low = bp(rng.standard_normal(N), 380, 0.8)
high = bp(rng.standard_normal(N), 2600, 0.9)
camair = (low * 0.7 + high * 0.3) * cenv**1.4 * 0.20
sfx.place(camair, 0, 1.0, send=0.3)

# ── mix: music ducks under the effects, one room, then master ─────────────
m = render(music)[:N]
s = render(sfx)[:N]
se = np.abs(s).max(axis=1)
duck_env = signal.lfilter([1 - np.exp(-1 / (0.012 * SR))], [1, -np.exp(-1 / (0.012 * SR))], se)  # fast attack
rel = np.exp(-1 / (0.25 * SR))
held = np.zeros_like(duck_env)
acc = 0.0
for i in range(0, N, 64):  # peak hold with 250 ms release, block-wise
    acc = max(float(duck_env[i : i + 64].max()), acc * rel**64)
    held[i : i + 64] = acc
gain = 1 / (1 + 2.2 * np.clip(held / (held.max() + 1e-9), 0, 1))  # up to about −10 dB on the loudest hits
m = m * gain[:, None] ** 0.5
fade = np.ones(N)
fo = int(SR * 0.6)
fade[-fo:] = np.linspace(1, 0, fo) ** 2  # a controlled ending, not a cut
mix = (m + s) * fade[:, None]
mix = np.stack([hp(mix[:, c], 32) for c in (0, 1)], 1)
m = np.stack([hp(m[:, c], 32) for c in (0, 1)], 1) * fade[:, None]
s = np.stack([hp(s[:, c], 32) for c in (0, 1)], 1) * fade[:, None]
pk = np.abs(mix).max()
for name, x in (("music", m), ("sfx", s), ("WareOrb-promo-score", mix)):
    wavfile.write(os.path.join(OUT, name + ".wav"), SR, (x / pk * 0.5).astype(np.float32))
print(f"wrote {OUT}: {DUR:.2f} s, stems + mix (pre-master, peak normalised to −6 dBFS)")
