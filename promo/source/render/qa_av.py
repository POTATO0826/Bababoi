# A/V sync and audio QA of an encoded film: decodes the audio from the MP4 and finds the onset of each press click
# (a sharp 2–5 kHz transient) near the frame where the button is pressed in the picture; also reports format,
# loudness and true peak (ffmpeg ebur128).
#   python3 qa_av.py <film.mp4> <sound-data.json> <report.md>
import json, subprocess, sys
import numpy as np
from scipy import signal

film, sd, report = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(sd))
SR = 48000
pcm = subprocess.check_output(["ffmpeg", "-v", "error", "-i", film, "-map", "0:a:0", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"])
a = np.frombuffer(pcm, np.float32)
b, c = signal.butter(4, [2000 / (SR / 2), 5000 / (SR / 2)], "band")
hf = np.abs(signal.lfilter(b, c, a))
envl = signal.lfilter([1 - np.exp(-1 / (0.001 * SR))], [1, -np.exp(-1 / (0.001 * SR))], hf)

rows = []
for cue in d["cues"]:
    if cue["k"] != "press":
        continue
    t = cue["f"] / 30
    i0, i1 = int((t - 0.12) * SR), int((t + 0.12) * SR)
    w = envl[i0:i1]
    base = np.median(envl[int((t - 0.4) * SR) : int((t - 0.15) * SR)])
    thr = base + 0.5 * (w.max() - base)
    onset = i0 + int(np.argmax(w > thr))
    rows.append((cue["f"], t, onset / SR, (onset / SR - t) * 1000))

probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=index,codec_type,codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt,color_space,sample_rate,channels,channel_layout,duration", "-show_entries", "format=duration,bit_rate", "-of", "json", film]))
loud = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", film, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
summ = [l.strip() for l in loud.splitlines() if l.strip().startswith(("I:", "LRA:", "Peak:"))]
with open(report, "w") as md:
    md.write(f"# A/V QA — `{film}`\n\n## Streams\n\n")
    for s in probe["streams"]:
        md.write("* " + ", ".join(f"{k}={v}" for k, v in s.items() if k != "index") + "\n")
    md.write(f"* container duration {probe['format']['duration']} s, bit rate {int(probe['format']['bit_rate']) // 1000} kb/s\n\n")
    md.write("## Loudness (EBU R128, ffmpeg ebur128)\n\n" + "\n".join(f"* {x}" for x in summ) + "\n\n")
    md.write("## A/V sync at the presses (click onset vs the frame the button bottoms out)\n\n| press frame | picture (s) | click onset (s) | offset (ms) |\n|---|---|---|---|\n")
    for f, t, o, ms in rows:
        md.write(f"| {f} | {t:.3f} | {o:.3f} | {ms:+.1f} |\n")
    worst = max(abs(r[3]) for r in rows) if rows else 0
    md.write(f"\nWorst offset {worst:.1f} ms (one frame is 33.3 ms; ±20 ms is imperceptible).\n")
print(open(report).read())
