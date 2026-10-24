#!/bin/sh
# Masters the score mix: two-pass EBU R128 (loudnorm, linear) to -16 LUFS integrated, true peak <= -2 dBTP,
# 48 kHz stereo 24-bit. Prints the measured result.
#   sh master.sh <mix.wav> <out.wav>
set -e
IN=$1; OUT=$2
J=$(ffmpeg -hide_banner -nostats -i "$IN" -af loudnorm=I=-16:TP=-2:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$J" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -hide_banner -loglevel error -y -i "$IN" -af "loudnorm=I=-16:TP=-2:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" -c:a pcm_s24le -ar 48000 -ac 2 "$OUT"
ffmpeg -hide_banner -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|LRA:|Peak:)" | tr -s ' '
