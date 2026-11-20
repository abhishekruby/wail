---
inclusion: always
---

# Structure

```
src/
  ui/         Preact screens (Séance, Compose, Crypt, Altar), theme, spectrogram
  app/        message service: send/listen state machine, history
  pipeline/   card serialise/parse, compress, lock/unlock (pure)
  protocol/   frames, chunking, reassembly, CRC-32, replay guard (pure)
  modem/      Modem interface, GgwaveModem, PassthroughModem
  audio/      mic AudioWorklet, playback, analyser
  store/      IndexedDB stores
tests/        *.test.ts and *.prop.test.ts, mirrors src/
spikes/       throwaway planning code, not product
docs/         planning, field tests, Kiro write-up
```

## Rules

- `src/protocol/` and `src/pipeline/` are pure: no DOM, Web Audio or IndexedDB imports. They must run in Node.
- Layers only call downward: ui → app → pipeline/protocol → modem → audio. Store is called only from app.
- One exported concept per file. File names in kebab-case. Components in PascalCase.
- Frame constants live only in `src/protocol/constants.ts`.
- Property tests: `tests/<area>/<REQ-ID>.<short-name>.prop.test.ts`.
