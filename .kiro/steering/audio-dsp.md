---
inclusion: fileMatch
fileMatchPattern: ["src/audio/**", "src/modem/**"]
---

# Audio rules

- Create one `AudioContext` per page, requesting 48 kHz; always read `ctx.sampleRate` and pass it to ggwave as `sampleRateInp` and `sampleRateOut`.
- Resume the context only from a user tap (mobile autoplay rules).
- Mic constraints: `echoCancellation: false, noiseSuppression: false, autoGainControl: false`. Voice processing destroys the tones.
- Capture runs in an AudioWorklet that posts Float32 blocks to the main thread; decoding happens off the render thread.
- Stop every mic track when leaving the Listen screen (R10).
- Playback: one AudioBufferSourceNode per frame; wait for `onended`, then a 300 ms gap between frames.
- Volume parameter for `encode`: 10 by default, user-adjustable in Altar.
- Never leave ggwave instances unreleased: `free()` on teardown.
