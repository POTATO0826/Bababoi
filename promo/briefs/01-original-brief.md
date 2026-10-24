# Task: Create a Premium 10-Second WareOrb Product Launch Video

You are acting as a senior motion designer, technical director, 3D artist, and creative developer.

Create a premium, code-generated product introduction video using the **actual frontend** from the following project:

**Repository:** https://github.com/POTATO0826/Bababoi/tree/Vince

**Branch:** `Vince`

**Product:** WareOrb — an AI-assisted warehouse operations concept for small businesses.

The video is intended for a hackathon product demonstration. It should feel like a polished technology product launch, not a slideshow, basic website screen recording, or generic AI-generated advertisement.

## 1. Non-negotiable technical specifications

- Duration: exactly 10 seconds.
- Resolution: 1920 × 1080.
- Frame rate: 30 FPS.
- Total frames: exactly 300, numbered 0–299.
- Output: H.264 MP4 with synchronized stereo audio.
- Animation and compositing must be programmatically reproducible.
- Generate music and sound effects using code and synchronize them to visual events.
- No externally generated AI-video clips.
- No watermarks.

Use the most reliable code-based rendering pipeline for the actual frontend.

Prefer browser-based rendering with WebGL/Three.js, React/Remotion, or an equivalent framework when appropriate. Blender Python may be used for true 3D scenes or objects if it materially improves the result.

Use FFmpeg for encoding, mixing, and final verification.

Do not force Blender into tasks better solved by rendering the real frontend in a browser.

## 2. Inspect the real project before designing anything

First:

1. Inspect the `Vince` branch and identify the frontend framework, routes, components, assets, design system, fonts, colors, and existing animations.
2. Run the actual frontend locally if the environment allows it.
3. Identify the strongest visually demonstrable product interactions.
4. Capture real UI states through the browser.
5. Read the provided `wareorb-capacity-reallocation.md` specification if present.
6. Distinguish implemented functionality from planned or simulated functionality.

The intended WareOrb workflow is:

Multimodal receiving → human verification → ageing-stock detection → salesperson handoff → buyer information → carrier quotation comparison → owner approval → confirmed dispatch → replenishment recommendations.

This is product intent, not proof that these capabilities already work.

**Never fabricate screenshots or portray unimplemented functionality as operational.**

Where a planned workflow must be illustrated, explicitly treat it as a concept visualization or a seeded demo, rather than inventing a real integration or real business results.

Use actual frontend screenshots, components, assets, and styling wherever possible.

Do not modify the product's existing source code merely to make the video look better. Create an isolated video-production workspace.

If the target branch cannot be accessed, report that limitation rather than silently substituting another branch.

## 3. Creative direction

**Primary style: Premium Isometric 3D Warehouse Motion Graphics.**

**Secondary style: Restrained Glassmorphism for real frontend UI panels.**

Visual qualities:

- Beautifully lit miniature 3D warehouse.
- Accurate and consistent isometric camera when showing the warehouse.
- Soft studio lighting and realistic contact shadows.
- Subtle ambient occlusion and physically plausible materials.
- Brushed metal, frosted glass, matte surfaces, and selective reflections.
- Clean depth layering with gentle depth-of-field where appropriate.
- Smooth camera movement, elegant transitions, and sophisticated typography.
- Crisp, readable actual frontend UI.
- Carefully limited accent colors derived from the frontend's existing brand palette.

Objects should have convincing physical weight: acceleration, compression, settling, and subtle secondary motion.

Use spring motion only when physically appropriate. UI transitions should feel controlled and professional.

Fast-moving objects may use restrained motion blur. UI labels and essential information must remain sharp.

**Avoid:**

- Generic plastic-looking materials.
- Hard, unrealistic shadows.
- Excessive neon and glow.
- Random flying dashboards.
- Floating UI that has no connection to the real application.
- Busy effects that obscure the frontend.
- Unmotivated camera rotation.
- Excessive text.
- Fake statistics, testimonials, or unsupported capabilities.
- Generic corporate stock-video aesthetics.

The 3D animation must support the actual product story, not overpower it.

## 4. Storyboard: exactly 10 seconds

Use this timing plan as the initial creative brief. Adjust small details if the real frontend suggests a stronger narrative, but preserve the overall duration and product accuracy.

| Time | Scene | Visual |
|---|---|---|
| 0.0–1.0s | Hook | A compact isometric warehouse assembles dynamically. Reveal the WareOrb identity. |
| 1.0–2.8s | Capture | A real receiving UI panel enters. A document or receipt becomes an editable stock record, with a human review moment if supported. |
| 2.8–4.5s | Detect | Camera travels across warehouse shelves. A long-stored batch receives a clear amber attention highlight, alongside a real inventory UI state. |
| 4.5–6.0s | Coordinate | An ageing-stock task moves to sales, followed by a concise visual of the buyer/delivery brief and carrier quotation comparison. |
| 6.0–7.8s | Approve and dispatch | An owner approval event leads into a separate confirmed-dispatch movement. Items leave the warehouse and space visibly becomes available. |
| 7.8–10.0s | Insight and brand | Show replenishment insight if supported, then transition to a clean WareOrb logo and final brand statement. |

These scenes are narrative targets, not instructions to fabricate missing application capabilities.

Compress or replace unsupported scenes rather than pretending they work.

The video should clearly convey three ideas:

**Capture stock. Turn inventory into action. Make better decisions.**

Use short, polished English text. Prioritize understanding over listing features.

## 5. Six-keyframe preview gate — mandatory

Do not render the finished animation immediately.

First produce six polished, full-resolution preview frames representing the major scenes.

Suggested timestamps:

- Frame 18 — 0.6s
- Frame 57 — 1.9s
- Frame 105 — 3.5s
- Frame 153 — 5.1s
- Frame 210 — 7.0s
- Frame 273 — 9.1s

Save each preview as a numbered PNG.

Also create a single contact sheet displaying all six previews with their timestamps.

These must be representative frames generated from the intended production scene, not unrelated concept images.

Evaluate:

- Visual consistency.
- Product recognizability.
- Legibility at 1920×1080.
- Real frontend fidelity.
- Typography.
- Lighting and material quality.
- Shot composition.
- Narrative clarity.
- Consistency between the six scenes.

**Stop after producing the six preview frames and present them for review. Do not render the final 300-frame animation until the previews are approved.**

## 6. Animation production

After preview approval:

Implement deterministic, time-based animation.

Every frame must be a function of the requested timeline position, not dependent on unpredictable wall-clock timing.

Use smooth, precisely controlled interpolation.

Transitions must be visually motivated by the objects or UI elements themselves.

Examples:

- A stock item moves from a receiving panel into a warehouse shelf.
- An amber inventory marker becomes a salesperson task notification.
- A transport route visually connects the warehouse with the quotation comparison.
- Approved dispatch releases a visible storage location.
- A warehouse overview becomes the final product logo composition.

Avoid using repetitive crossfades as a substitute for purposeful motion.

Ensure all UI states correspond to a coherent product interaction.

## 7. Music and sound design

Generate original background music and sound effects programmatically.

Suggested audio direction:

- Modern, elegant electronic instrumental.
- Light rhythmic pulse.
- Subtle synthesized marimba or glass-like percussion.
- Restrained ambient synth layers.
- A clear but understated final resolution.

Synchronize audio precisely with animation events.

Examples:

- 0.0s: soft low-frequency reveal.
- 1.0s: clean interface-entry click.
- 2.8s: subtle attention cue.
- 4.5s: rhythmic transition.
- 6.0s: approval confirmation tone.
- 7.8s: warm musical resolution.
- 9.5–10.0s: controlled audio ending.

Use a 48 kHz stereo master.

Avoid clipping, overly loud transitions, excessive bass, and unmotivated sound effects.

Voiceover is optional and disabled by default. A clear, well-paced visual narrative is more important than narration in a 10-second video.

## 8. Mandatory per-frame quality assurance

After the full animation is rendered, decode and inspect **all 300 frames**.

Automate checks for:

- Missing, blank, corrupted, or unexpectedly black frames.
- Incorrect resolution.
- Accidental duplicate or frozen frames.
- Unintended scene discontinuities.
- Flickering UI or broken fonts.
- Clipped text or objects.
- UI panels entering or leaving outside the visible frame.
- Unreadable overlays.
- Color, lighting, and shadow inconsistencies.
- Unwanted abrupt motion or transitions.

Use suitable automated image analysis and an additional visual review of representative frames and transitions.

Verify exact frame count, playback duration, audio timing, and encoding.

Fix problems and rerender affected output before delivery.

Do not claim every frame has passed inspection without actually running the checks.

## 9. Deliverables

Organize everything in a separate directory:

```text
promo/
├── previews/
│   ├── keyframe-01.png
│   ├── keyframe-02.png
│   ├── keyframe-03.png
│   ├── keyframe-04.png
│   ├── keyframe-05.png
│   ├── keyframe-06.png
│   └── contact-sheet.png
├── source/
├── audio/
├── frames/
├── qa/
├── storyboard.md
├── render-instructions.md
└── WareOrb-promo-1080p.mp4
```

The final package must contain the reproducible source, generated audio, preview frames, finished video, and quality assurance results.

Do not change the existing frontend application or commit generated video files to the original repository without explicit authorization.

## 10. Priority order

When making creative or technical trade-offs, follow this priority:

1. Product truthfulness and actual frontend fidelity.
2. Clarity of the product story.
3. High-quality cinematography and design.
4. Smooth, precise motion.
5. Audio-visual synchronization.
6. Reproducible rendering.
7. Verified final delivery.

A visually stunning video that misrepresents the product is a failure.

Begin by inspecting the frontend and drafting the video storyboard, then generate the six preview frames for review. Do not proceed directly to final rendering.