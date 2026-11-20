# Offline Phone-Call Codec Simulation (`ggwave` 0.4.0)

Offline experiment testing whether `ggwave` 0.4.0 audio waveforms survive cellular (AMR-NB, AMR-WB) and VoIP (Opus) speech codecs.

- **Runner:** `spikes/codec-sim/run.ts` (`node --experimental-strip-types spikes/codec-sim/run.ts`)
- **Environment:** Node `v22.14.0`, `ggwave` `0.4.0`, `ffmpeg` `6.1.1-3ubuntu5` (`libopencore_amrnb`, `libvo_amrwbenc`, `libopus`)
- **Method:** 10 deterministic 100-byte payloads (`testPayload(seq, 100)`, `seq = 1..10`) per protocol × channel, encoded at 48 kHz mono `f32le` with `volume = 10` (matching `tests/ggwave-baseline.test.ts` and `spikes/kill-test.ts`, peak ≈ `0.097` / −20 dBFS), padded with 0.5 s (`24,000` samples) of silence before and after, passed through `ffmpeg` and back to 48 kHz mono `f32le`, decoded in 4096-byte chunks on a fresh `ggwave` instance per trial, and verified with `checkPayload(bytes).ok && checkPayload(bytes).seq === seq && bytes.length === 100`.
- **Protocol scope:** All `AUDIBLE_*` and `DT_*` protocols exposed in `gg.ProtocolId` (`ULTRASOUND_*` and `CUSTOM_*` skipped). Note that `ggwave` 0.4.0's Emscripten bindings (`node_modules/ggwave/emscripten.cpp`) do **not** expose `MT_*` variants, so only the 6 exposed protocols were tested.

> **Important limitation (necessary, not sufficient):** Real phone and VoIP calls also apply **voice-activity detection (VAD/DTX)**, **noise suppression (NS)**, **automatic gain control (AGC)**, acoustic echo cancellation, packet loss, and speaker-to-mic room acoustics. This offline codec simulation does **not** model any of those stages (note `-dtx` defaults to `0` in `ffmpeg`'s AMR encoders). Passing here is therefore **necessary but not sufficient** for real calls—field call tests remain mandatory.

## Results (`volume = 10`, −20 dBFS)

Successes out of 10 trials per cell. Across all 420 trials, **0 damaged payloads** were emitted (every failure was a clean non-decode).

| Protocol | Measured band (1024-pt DFT) | Air time (100 B) | Passthrough | AMR-NB 12.2k (8 kHz) | AMR-NB 4.75k (8 kHz) | AMR-WB 23.85k (16 kHz) | AMR-WB 12.65k (16 kHz) | Opus voip 16k (16 kHz) | Opus voip 32k (48 kHz) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AUDIBLE_NORMAL` | 1,875–6,328 Hz | 9.90 s | 10/10 | 0/10 | 0/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| `AUDIBLE_FAST` | 1,875–6,328 Hz | 6.83 s | 10/10 | 0/10 | 0/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| `AUDIBLE_FASTEST` | 1,875–6,328 Hz | 3.75 s | 10/10 | 0/10 | 0/10 | 10/10 | 10/10 | 10/10 | 10/10 |
| `DT_NORMAL` | 1,078–2,625 Hz | 28.14 s | 0/10\* | 10/10 | 10/10 | 10/10 | 0/10† | 10/10 | 10/10 |
| `DT_FAST` | 1,078–2,625 Hz | 18.99 s | 10/10 | 10/10 | 10/10 | 10/10 | 0/10† | 9/10† | 10/10 |
| `DT_FASTEST` | 1,078–2,625 Hz | 9.83 s | 10/10 | 10/10 | 10/10 | 10/10 | 0/10† | 10/10 | 10/10 |

### Notes on the two non-obvious cells

- **\* `DT_NORMAL` passthrough (`0/10`):** On an exact noise-free digital signal, `ggwave` 0.4.0 logs a premature `Received end marker` mid-stream for all 10 100-byte payloads (even with random bytes, while a 4-byte `'ABCD'` payload succeeds). Adding −60 dB (`1e-3`) dither—or passing through any lossy codec that introduces a small quantization floor—immediately restores `DT_NORMAL` passthrough to **10/10**.
- **† `DT_*` on `AMR-WB 12.65k` (`0/10` at `volume = 10`):** At `volume = 10` (−20 dBFS), `DT_FASTEST` fails at `12.65k` (start and end markers decode cleanly, but payload extraction fails) while already scoring `5/5` at `14.25k` and every higher AMR-WB bitrate. Raising `gg.encode` volume from `10` to **`50`** (peak ≈ `0.49` / −6 dBFS; `node --experimental-strip-types spikes/codec-sim/run.ts 50`) flips **all three `DT_*` protocols on `AMR-WB 12.65k` from `0/10` to `10/10`**, flips `DT_FAST` on `Opus voip 16k` from `9/10` to `10/10`, and yields **`10/10` across all 7 channels for `DT_FASTEST`**.

## Exact `ffmpeg` Commands Used

For each codec channel, `spikes/codec-sim/run.ts` writes padded raw audio to `in.f32`, encodes to `mid.<ext>`, and decodes back to `out.f32`:

```bash
# 1. Passthrough: no ffmpeg (raw padded f32le passed directly to gg.decode)

# 2. AMR-NB 12.2 kbps at 8 kHz (old 2G/3G call)
ffmpeg -y -v error -f f32le -ar 48000 -ac 1 -i in.f32 -c:a libopencore_amrnb -ar 8000 -ac 1 -b:a 12.2k -f amr mid.amr
ffmpeg -y -v error -i mid.amr -f f32le -ar 48000 -ac 1 out.f32

# 3. AMR-NB 4.75 kbps at 8 kHz (bad network)
ffmpeg -y -v error -f f32le -ar 48000 -ac 1 -i in.f32 -c:a libopencore_amrnb -ar 8000 -ac 1 -b:a 4.75k -f amr mid.amr
ffmpeg -y -v error -i mid.amr -f f32le -ar 48000 -ac 1 out.f32

# 4. AMR-WB 23.85 kbps at 16 kHz (VoLTE HD voice)
ffmpeg -y -v error -f f32le -ar 48000 -ac 1 -i in.f32 -c:a libvo_amrwbenc -ar 16000 -ac 1 -b:a 23.85k -f amr mid.amr
ffmpeg -y -v error -i mid.amr -f f32le -ar 48000 -ac 1 out.f32

# 5. AMR-WB 12.65 kbps at 16 kHz
ffmpeg -y -v error -f f32le -ar 48000 -ac 1 -i in.f32 -c:a libvo_amrwbenc -ar 16000 -ac 1 -b:a 12.65k -f amr mid.amr
ffmpeg -y -v error -i mid.amr -f f32le -ar 48000 -ac 1 out.f32

# 6. Opus voip 16 kbps at 16 kHz (WhatsApp, weak network)
ffmpeg -y -v error -f f32le -ar 48000 -ac 1 -i in.f32 -c:a libopus -application voip -ar 16000 -ac 1 -b:a 16k -f ogg mid.ogg
ffmpeg -y -v error -i mid.ogg -f f32le -ar 48000 -ac 1 out.f32

# 7. Opus voip 32 kbps at 48 kHz (WhatsApp, good network)
ffmpeg -y -v error -f f32le -ar 48000 -ac 1 -i in.f32 -c:a libopus -application voip -ar 48000 -ac 1 -b:a 32k -f ogg mid.ogg
ffmpeg -y -v error -i mid.ogg -f f32le -ar 48000 -ac 1 out.f32
```

## Which Protocol Survives AMR-NB and AMR-WB?

- **AMR-NB (8 kHz, 12.2k and 4.75k):** **Only `DT_*` (`DT_NORMAL`, `DT_FAST`, `DT_FASTEST`) survives (`10/10`).** All `AUDIBLE_*` variants fail (`0/10`) because their tones span 1,875–6,328 Hz while 8 kHz AMR-NB hard-cuts above 4 kHz (passband ~300–3,400 Hz). `DT_*` sits at 1,078–2,625 Hz, fully inside the narrowband passband.
- **AMR-WB (16 kHz, 23.85k and 12.65k):** All `AUDIBLE_*` variants survive both `23.85k` and `12.65k` (`10/10`) at `volume = 10`. All `DT_*` variants survive `23.85k` (`10/10`), fail `12.65k` (`0/10`) at `volume = 10` (−20 dBFS), and survive **both `23.85k` and `12.65k` (`10/10`)** once transmit level is raised to `volume = 50` (−6 dBFS).
- **Best single protocol across both AMR-NB and AMR-WB (and Opus):** **`DT_FASTEST`** (`9.83 s` per 100 B, matching `AUDIBLE_NORMAL`'s `9.90 s`)—provided transmit amplitude is driven near −6 dBFS (`volume = 50`, not `10`). If narrowband 2G/3G calls are out of scope and only VoLTE (AMR-WB) / WhatsApp (Opus) matter, **`AUDIBLE_FASTEST`** (`3.75 s` per 100 B) passes `10/10` on all wideband/Opus channels even at `volume = 10`.

## Conclusion

1. `AUDIBLE_*` protocols (1.88–6.33 kHz) cannot cross 8 kHz AMR-NB calls (`0/10`) due to Nyquist/passband cutoff, but pass `10/10` on AMR-WB (23.85k/12.65k) and Opus VoIP (16k/32k), with `AUDIBLE_FASTEST` taking only `3.75 s` per 100 B.
2. `DT_*` protocols (1.08–2.63 kHz) fit inside narrowband telephony and pass `10/10` on AMR-NB down to `4.75 kbps`, as well as AMR-WB `23.85 kbps` and Opus VoIP `32 kbps`.
3. At `ggwave`'s default `volume = 10` (−20 dBFS), no protocol sweeps all six codecs because `DT_*` fails `libvo_amrwbenc` at `12.65 kbps` (`0/10`); raising transmit level to `volume = 50` (−6 dBFS) recovers `DT_*` to `10/10` on `AMR-WB 12.65k`, giving `DT_FASTEST` (`9.83 s`/100 B) `10/10` on every tested codec.
4. `ggwave` 0.4.0 in JS does not expose `MT_*` protocols, and `DT_NORMAL` (`28.14 s`/100 B) false-triggers its end marker on noise-free digital passthrough, making `DT_FASTEST` the clear narrowband+wideband candidate.
5. Because real phone and WhatsApp calls also apply VAD, noise suppression, and AGC—none of which are simulated here—these codec passes are necessary but not sufficient and must be validated on live calls.
