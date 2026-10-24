#!/bin/sh
# Encodes a PNG frame folder to H.264 (High, yuv420p, BT.709 matrix and tags), 30 fps, optionally with a WAV.
#   sh encode.sh <frames dir> <out.mp4> [crf=16] [audio.wav]
# PNG frames are RGB: without an explicit matrix ffmpeg converts them with BT.601 and players (which assume BT.709 for
# HD) show shifted colours, so the conversion and the stream tags are set here.
set -e
IN=$1; OUT=$2; CRF=${3:-16}; WAV=$4
VF="scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p"
if [ -n "$WAV" ]; then
  ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$IN/frame-%04d.png" -i "$WAV" \
    -vf "$VF" -c:v libx264 -profile:v high -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -c:a aac -b:a 320k -ar 48000 -ac 2 -shortest -movflags +faststart "$OUT"
else
  ffmpeg -y -hide_banner -loglevel error -framerate 30 -i "$IN/frame-%04d.png" \
    -vf "$VF" -c:v libx264 -profile:v high -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -movflags +faststart "$OUT"
fi
ffprobe -v error -show_entries stream=codec_name,profile,width,height,r_frame_rate,nb_frames,pix_fmt,color_space,sample_rate,channels -show_entries format=duration -of compact "$OUT"
