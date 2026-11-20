# Offline Broadcast Carousel & Room-Echo Simulation (`ggwave` 0.4.0)

Offline experiment testing how a repeating 5-frame `ggwave` 0.4.0 broadcast handles late-joining listeners across inter-frame silence gaps and synthetic room reverberation (`RT60`).

- **Runner:** `spikes/carousel-sim/run.ts`
- **Signal:** 5 frames of 100 bytes (`testPayload(seq, 100)`, `seq = 1..5`), encoded at 48 kHz mono `f32le`, `volume = 10` (peak ≈ `0.097` / −20 dBFS), separated by `G` ms of silence and repeated for 3 full cycles (+ 1.0 s trailing silence to flush the final end marker).
- **Frame durations (100 B):** `AUDIBLE_NORMAL = 9.90 s`, `AUDIBLE_FAST = 6.83 s`, `AUDIBLE_FASTEST = 3.75 s`.
- **Noise & RIR model:** Additive zero-mean Gaussian white noise at `+10 dB` SNR relative to active signal RMS. Synthetic room impulse response (RIR): direct impulse at `n = 0` plus exponentially decaying Gaussian white noise tail (`-60 dB` at `t = RT60`, truncated at `1.2 × RT60`), scaled for exact direct-to-reverberant ratio **`DRR = 0.00 dB`** and unit total energy (`sum(h²) = 1`), applied via overlap-add radix-2 FFT convolution (verified against direct convolution at startup).
- **Late joiners:** 20 stratified random start offsets spread across Cycle 1, each decoded on a fresh `ggwave` instance in 4096-byte (1024-sample) chunks, plus a baseline `offset = 0` listener covering all 15 frames (`3 × 5`).

> **What this simulation does NOT model:** This offline model omits **speaker nonlinear distortion and bandwidth roll-off** (cheap phone speakers/PA horns), **phone microphone DSP** (OS-level automatic gain control, noise suppression, acoustic echo cancellation, and Bluetooth HFP resampling), and **real room acoustics** (discrete early reflections from walls/ceilings, frequency-dependent absorption, non-stationary crowd/burst noise such as coughs or doors, and listener movement). Results here are an upper bound on real-room performance; field tests in real rooms remain required.

## Exact Commands

```bash
# Main simulation: Experiment 1 (G = 0, 100, 300, 600 ms) and Experiment 2 (single RIR per condition, 20 late joiners)
node --experimental-strip-types spikes/carousel-sim/run.ts

# Follow-up verification: 5 independent random RIR seeds per (speed, RT60 = 0.2..1.2 s) and gap sensitivity at RT60 = 0.8 s
node --experimental-strip-types spikes/carousel-sim/run.ts --multi-room
```

## Experiment 1: Late Joiners vs. Inter-Frame Gap (`AUDIBLE_FAST`, +10 dB SNR, No Echo)

Frames recovered out of 5 across 20 late-joining listeners (`min / median / max`, plus count of listeners recovering all 5/5).

| Gap `G` | Baseline `offset = 0` (of 15 frames) | End of Cycle 2 (`min / med / max`) | End of Cycle 3 (`min / med / max`) | Mid-frame join recovered by C2 | Wrong bytes |
| --- | --- | --- | --- | --- | --- |
| `0 ms` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 20/20 | 0 |
| `100 ms` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 20/20 | 0 |
| `300 ms` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 20/20 | 0 |
| `600 ms` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19\* | 0 |

*\*At `G = 600 ms`, 1 of the 20 random offsets landed inside a silence gap rather than mid-frame; all 19 mid-frame joiners recovered their clipped frame by the end of Cycle 2.*

- **Smallest gap that never loses a frame to the previous frame's tail:** **`0 ms`** in this simulation. Even with zero silence between frames, `offset = 0` recovered `15/15` (`5/5/5` per cycle) and `20/20` late joiners recovered `5/5` by Cycle 2. In the follow-up check under room echo (`AUDIBLE_FAST`, `RT60 = 0.8 s`, 5 independent rooms, below), `G = 0, 100, 300, 600 ms` all scored `5.0/5` (`5, 5, 5, 5, 5`). `ggwave`'s own start/end markers isolate adjacent frames cleanly in linear channels.
- **Does a mid-frame joiner always recover that frame on the next cycle?** **Yes, whenever the channel is below the speed's RT60 failure threshold.** Across all 4 gaps in Experiment 1 (`79/79` mid-frame joiners) and all passing conditions in Experiment 2, **100%** of listeners who joined mid-frame recovered the clipped frame by the end of Cycle 2, and joining mid-frame never corrupted decoder state for the immediately following frame (`0` next-frame losses).

## Experiment 2: Room Echo (`G = 300 ms`, +10 dB SNR, `DRR = 0 dB`)

### Single-RIR carousel run (20 late joiners per condition)

| Speed & `RT60` | Baseline `offset = 0` (of 15) | End of Cycle 2 (`min / med / max`) | End of Cycle 3 (`min / med / max`) | Mid-frame join recovered by C2 | Wrong bytes |
| --- | --- | --- | --- | --- | --- |
| `AUDIBLE_FAST` · `0.2 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19 | 0 |
| `AUDIBLE_FAST` · `0.5 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19 | 0 |
| `AUDIBLE_FAST` · `0.8 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19 | 0 |
| `AUDIBLE_FAST` · `1.2 s` | 7/15 (3/2/2) | 2 / 2 / 3 (0/20 got 5/5) | 2 / 2 / 3 (0/20 got 5/5) | 9/20 | 0 |
| `AUDIBLE_NORMAL` · `0.2 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19 | 0 |
| `AUDIBLE_NORMAL` · `0.5 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 18/18 | 0 |
| `AUDIBLE_NORMAL` · `0.8 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 20/20 | 0 |
| `AUDIBLE_NORMAL` · `1.2 s` | 12/15 (4/4/4) | 4 / 4 / 4 (0/20 got 5/5) | 4 / 4 / 4 (0/20 got 5/5) | 15/19 | 0 |
| `AUDIBLE_FASTEST` · `0.2 s` | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19 | 0 |
| `AUDIBLE_FASTEST` · `0.5 s` | 0/15 (0/0/0) | 0 / 0 / 1 (0/20 got 5/5) | 0 / 0 / 1 (0/20 got 5/5) | 0/16 | 0 |
| `AUDIBLE_FASTEST` · `0.8 s` | 0/15 (0/0/0) | 0 / 0 / 0 (0/20 got 5/5) | 0 / 0 / 0 (0/20 got 5/5) | 0/19 | 0 |
| `AUDIBLE_FASTEST` · `1.2 s`\* | 15/15 (5/5/5) | 5 / 5 / 5 (20/20 got 5/5) | 5 / 5 / 5 (20/20 got 5/5) | 19/19 | 0 |

*\*Why `AUDIBLE_FASTEST` jumped to `15/15` at `1.2 s` in the single-RIR run:* A single static RIR acts as a fixed comb filter whose random spectral notches either land on `ggwave`'s marker/data tones or miss them, and holding `DRR = 0 dB` constant spreads the same total reverberant energy over a longer `1.2 s` tail (lowering instantaneous early-reflection amplitude right after each symbol). To eliminate single-seed luck, we ran 5 independent random RIR seeds per condition (`--multi-room`).

### Multi-room RIR verification (5 independent rooms, 1 cycle = 5 frames, `G = 300 ms`)

| Speed | `RT60 = 0.2 s` | `RT60 = 0.5 s` | `RT60 = 0.8 s` | `RT60 = 1.0 s` | `RT60 = 1.2 s` | Wrong bytes |
| --- | --- | --- | --- | --- | --- | --- |
| `AUDIBLE_NORMAL` | `5,5,5,5,5` (**5.0**) | `5,5,5,5,5` (**5.0**) | `5,5,5,5,5` (**5.0**) | `5,5,5,5,5` (**5.0**) | `5,5,0,0,4` (**2.8**) | 0 |
| `AUDIBLE_FAST` | `5,5,5,5,5` (**5.0**) | `5,5,5,5,5` (**5.0**) | `5,5,5,5,5` (**5.0**) | `1,5,2,0,0` (**1.6**) | `5,5,0,0,0` (**2.0**) | 0 |
| `AUDIBLE_FASTEST` | `5,5,5,5,5` (**5.0**) | `0,5,3,5,5` (**3.6**) | `5,0,1,3,0` (**1.8**) | `1,4,0,0,0` (**1.0**) | `0,5,1,0,5` (**2.2**) | 0 |

### Gap sensitivity under room echo (`AUDIBLE_FAST`, `RT60 = 0.8 s`, 5 rooms)

| Gap `G` | 5 rooms (of 5 frames) | Mean | Wrong bytes |
| --- | --- | --- | --- |
| `0 ms` | `5, 5, 5, 5, 5` | 5.0/5 | 0 |
| `100 ms` | `5, 5, 5, 5, 5` | 5.0/5 | 0 |
| `300 ms` | `5, 5, 5, 5, 5` | 5.0/5 | 0 |
| `600 ms` | `5, 5, 5, 5, 5` | 5.0/5 | 0 |

### RT60 Failure Threshold per Speed (`DRR = 0 dB`, +10 dB SNR)

- **`AUDIBLE_FASTEST`** (`3.75 s`/frame, short ~64 ms symbols): **starts failing at `RT60 = 0.5 s`** (`5.0/5` at 0.2 s → `3.6/5` at 0.5 s → `1.8/5` at 0.8 s). Unsuitable for typical indoor rooms or halls.
- **`AUDIBLE_FAST`** (`6.83 s`/frame, ~128 ms symbols): **reliable through `RT60 = 0.8 s`** (`5.0/5` across all 5 rooms), **starts failing at `RT60 = 1.0 s`** (`1.6/5` at 1.0 s; `2.0/5` at 1.2 s).
- **`AUDIBLE_NORMAL`** (`9.90 s`/frame, ~192 ms symbols): **reliable through `RT60 = 1.0 s`** (`5.0/5` across all 5 rooms), **starts failing at `RT60 = 1.2 s`** (`2.8/5`).

## Wrong-Bytes Events

- **0 wrong-bytes events** occurred across all 320 late-joiner runs, 16 `offset = 0` runs, and 95 multi-room runs (thousands of decoded frames). Every failure under heavy reverberation was rejected cleanly by `ggwave`'s internal Reed-Solomon check rather than emitting silent corruption. Because this experiment used high-entropy 100-byte payloads (not the short `≤ 8 B` or zero-run patterns that silently corrupt in `tests/ggwave-baseline.test.ts`), Wail's whitening + per-frame CRC-16 + message CRC-32 remain necessary.

## Recommendation (Inter-Frame Gap and Cycles)

1. Use an inter-frame silence gap of **`200–300 ms`** (keeping `.kiro/steering/audio-dsp.md`'s **`300 ms`** costs only `1.5 s` per 5-frame cycle—4% overhead—while giving real speakers, AGC, and room tails decay margin even though the linear sim survives `0 ms`).
2. Keep **`AUDIBLE_FAST`** as the indoor default (clean through `RT60 = 0.8 s`), use **`AUDIBLE_NORMAL`** as the "echoey hall / reliable" fallback (`RT60` up to `1.0 s`), and avoid **`AUDIBLE_FASTEST`** for room broadcasts because it already fails at `RT60 = 0.5 s`.
3. For listeners who join anywhere in Cycle 1, **2 cycles** are already sufficient for `100%` (`5/5`) recovery under steady noise and moderate echo (`C2 === C3` in every tested condition).
4. Keep **3 cycles** for short 1–2 frame broadcast notices (adding ~9–15 s to cover Cycle-2 late joiners and transient burst noises like coughs or doors), but cap long 4–5 frame notices at **2 cycles by default** (71 s vs. 107 s at `FAST`) with a manual "keep repeating" toggle.
5. In reverberant rooms (`RT60 ≥ 1.0 s`), extra cycles at a fixed spot do **not** overcome static comb-filter nulls (`C2 === C3`), so prompt stuck receivers to **move the phone 15–30 cm** or switch to `AUDIBLE_NORMAL`.
