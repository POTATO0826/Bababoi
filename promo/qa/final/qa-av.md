# A/V QA — `WareOrb-promo-1080p.mp4`

## Streams

* codec_name=h264, profile=High, codec_type=video, width=1920, height=1080, pix_fmt=yuv420p, color_space=bt709, r_frame_rate=30/1, duration=21.000000, nb_frames=630
* codec_name=aac, profile=LC, codec_type=audio, sample_rate=48000, channels=2, channel_layout=stereo, r_frame_rate=0/0, duration=21.000000, nb_frames=986
* container duration 21.000000 s, bit rate 8545 kb/s

## Loudness (EBU R128, ffmpeg ebur128)

* I:         -16.2 LUFS
* LRA:         2.8 LU
* Peak:       -2.8 dBFS

## A/V sync at the presses (click onset vs the frame the button bottoms out)

| press frame | picture (s) | click onset (s) | offset (ms) |
|---|---|---|---|
| 180 | 6.000 | 6.001 | +0.9 |
| 300 | 10.000 | 10.001 | +0.6 |
| 390 | 13.000 | 13.001 | +0.9 |
| 465 | 15.500 | 15.501 | +1.0 |

Worst offset 1.0 ms (one frame is 33.3 ms; ±20 ms is imperceptible).
