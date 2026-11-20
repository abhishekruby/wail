---
inclusion: fileMatch
fileMatchPattern: ["src/protocol/**", "src/pipeline/**", "tests/protocol/**", "tests/pipeline/**"]
---

# Wail protocol v1

Byte order: little-endian. `MAX_FRAME = 128` bytes (ggwave's hard limit is 140). `MIN_FRAME = 12` bytes. Default speed FAST; NORMAL is the "reliable" option in Altar.

## Frame

| Field | Bytes | Notes |
| --- | --- | --- |
| salt | 1 | Sent in the clear. Seeds the whitening mask for the rest of the frame. A new salt for every repeat |
| magic | 1 | `0x57` ("W"), whitened like everything below |
| version + type | 1 | high nibble version = 1; low nibble type: 0 manifest, 1 data, 2 repair request |
| message_id | 2 | random per message |
| seq | 1 | 0 = manifest, 1..255 = data |
| body | ≤ 120 | zero-padded before whitening so the frame is at least 12 bytes |
| crc16 | 2 | CRC-16/CCITT-FALSE over magic..body; a mismatch drops the frame |

Whitening: XOR every byte after `salt` with an xorshift32 stream seeded by `(0x57A11 ^ salt * 0x9E3779B1)`. Reference implementation: `whiten()` in `tests/ggwave-baseline.test.ts`.

Why: ggwave can return wrong bytes with no error for short payloads and some low-entropy patterns (found by fast-check, Nov 20). Whitening breaks the patterns, CRC-16 catches what slips through, and a new salt per repeat turns a deterministic failure into an independent retry (lab: 4 of 4 failed frames recovered, 0 of 585 failed all 3 salts).

## Manifest body

total_frames (1), kind (1: 0 text, 1 contact, 2 location, 3 notice, 4 file), flags (1: bit0 compressed, bit1 locked, bit2 broadcast), payload_len (2), crc32 (4), then salt (16) and iv (12) only if locked.

## Pipeline order

Send: serialise → compress (keep only if smaller) → lock (if passphrase) → CRC-32 over the result → split into data frames.
Receive: collect frames by message_id until every seq arrives → join → CRC-32 check → unlock → decompress → parse.

## Invariants (each one is a property test)

- Reassembly is order-independent and ignores duplicates.
- Any missing frame means "incomplete"; never return wrong bytes.
- A CRC mismatch shows nothing.
- A message_id completed in the last 10 minutes is ignored.
- No frame is ever longer than MAX_FRAME or shorter than MIN_FRAME.
- A frame whose CRC-16 fails is dropped, never used.
- whiten(whiten(x, salt), salt) == x for every frame and salt.
- Each repeat of a frame uses a different salt.
- ggwave output is never trusted without the frame CRC-16 and the message CRC-32.
