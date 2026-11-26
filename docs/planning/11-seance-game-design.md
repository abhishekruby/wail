# 11 · Wail: Séance (game design, draft for Abhishek's OK)

Status: draft, Nov 26, 2026. Nothing in 04, 06, 09 or 10 changes until Abhishek approves this page.

## One line

A Halloween party game where a "ghost" speaks to every phone in the room through sound. No app, no Wi-Fi, no join code, no internet.

## Why this instead of the disaster app

The radio check showed three limits: one-room range, slow eerie sound, one-way broadcast. For a disaster tool those are weaknesses. For a party game they fit:

| Limit | In a party game |
| --- | --- |
| Covers one room | The game is in one room |
| About 5 to 9 s of strange modem sound per message | That's the ghost's voice. It's atmosphere |
| One phone talks, the rest listen | The ghost talks, the players read and argue out loud |

Resurrection angle: the 1990s dial-up modem screech, brought back as the voice of a ghost. One closing line keeps the serious use: "the same engine can broadcast emergency notices with no network".

## How a game goes (4 to 8 players, 10 minutes)

1. **Summon.** The host opens Wail on a laptop or a phone on a speaker and taps **Summon**. The screen shows an empty circle of candles.
2. **Answer the summons.** Each player opens the link and taps **Answer**, one at a time. Their phone plays a short chirp to the ghost, and a candle lights on the host screen. The phone shows the player's candle number and a spooky name ("Candle 3 · The Widow").
3. **Possession.** The host taps **Begin**. The ghost speaks once, and every phone shows a role at the same moment: **Living**, or **Possessed** (1 possessed for 4–5 players, 2 for 6–8). Possessed players also see who the other possessed player is. A role is shown only while the player holds a finger on the screen.
4. **Omens.** Each round the ghost speaks again, and every Living player gets a private clue that is always true ("The possessed is not Candle 5"). Possessed players get a believable false clue.
5. **Banish.** A 60-second discussion, then everyone points at once. The host taps the banished candle, and the ghost reveals by sound whether that player was Living or Possessed.
6. **End.** The Living win when every possessed player is banished; the Possessed win when they equal the Living. The ghost reveals every role with a final scream.

## How secret roles stay secret on a public channel

Everyone in the room hears the same sound, so roles must be encrypted for one phone each.

- When a player taps **Answer**, their phone makes a fresh key pair (ECDH P-256, Web Crypto) and its chirp carries the public key (65 bytes, fits in one frame).
- The host makes its own key pair, broadcasts its public key with the roles, and encrypts each player's role and clues with AES-GCM using the shared key for that player.
- Every phone hears the whole broadcast, but can open only its own part. A phone listening in during joining learns only public keys, which are useless without the private ones.

Fallback if time runs short: seat numbers plus a shared game seed (honour system, like not peeking at cards). It's simpler, but anyone could compute other roles.

## Solo demo for judges

**Play alone:** one laptop runs the host plus 3 bot players. The sound goes through the real modem and decoder in memory, so no microphone or second device is needed. The judge sees the full loop in under a minute.

## What we keep, add and drop

| Keep (built and tested) | Add (Kiro specs) | Drop |
| --- | --- | --- |
| Packet protocol (spec 02) | `game`: pure rules engine in `src/game/` (roles, clues, rounds, win check) | Contact and location cards |
| Modem and audio (spec 01) | Key exchange (spec 03 update): ECDH join, per-player AES-GCM | Groups, Relay, history (Crypt) |
| AES-GCM lock (spec 03) | Host screen and player screen (spec 08, haunted UI) | Call mode |
| Broadcast carousel with late joiners (spec 05) | Solo demo with bots | Passphrase lock in the UI |
| Offline PWA (spec 07) | | |

## Property tests Kiro writes (the "Kiro depth" story)

| Property | For any player count 4–8 and any seed |
| --- | --- |
| G1 | Exactly the right number of Possessed players, never 0 |
| G2 | Every clue given to a Living player is true |
| G3 | A phone can decrypt its own role and fails cleanly on every other player's |
| G4 | The game always ends, and the winner matches the rules |
| G5 | A late joiner still gets the possession message on the next cycle |

## Risks and how we check them

| Risk | Check |
| --- | --- |
| Noisy party room, people talking | Test with 4 phones in one room while people talk; the ghost repeats each message 3 cycles |
| Joining one by one takes time (about 5 s each) | Fine for 4–8 players; treat it as the ritual |
| The possession message for 8 players is about 200 bytes (2 data frames), about 15–20 s per cycle | Fine as a ritual; keep per-player parts small (role + tag) and send the host key once |
| Two phones answer at once | The host ignores garbled chirps; the player sees "The ghost didn't hear you, try again" |
| Credits | About 30 Kiro credits with Haiku in the CLI: game spec, key-exchange update, UI, solo demo. Free credits (about 6 now, 50 on Dec 1) are tight, so the hackathon code still matters |

## Demo video (under 3 min)

Dark room, 4 friends, phones on the table. The laptop screams, and all 4 phones light up at once with a role. A clue arrives with a whisper. Someone is banished, and the ghost reveals the truth. Cut to "No internet. No Wi-Fi. Just sound." Then the solo demo, Kiro specs, property tests, and the closing line on emergency broadcast.
