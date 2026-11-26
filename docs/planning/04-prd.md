# 04 · Product requirements (PRD)

Stage status: done · Owner: Abhishek · **Version 2.0 (Nov 26, 2026): Wail becomes Séance, a party game played through sound.** Approved design: `docs/planning/11-seance-game-design.md`. v1.x (Nov 20–25) was a disaster-broadcast app; the radio check showed one-room range and slow, eerie sound, which are weak for a disaster tool and right for a room game. The engine (specs 01, 02, 03) is unchanged.

## 1. Summary

Wail: Séance is a Halloween party game where a "ghost" speaks to every phone in the room through sound. The host's laptop or phone on a speaker is the ghost. Players open a link: no app, no Wi-Fi, no join code, no internet. The ghost's modem screech hands out secret roles, whispers private clues and reveals who was possessed. Category for Kiroween 2026: **Resurrection** (the 1990s dial-up modem, brought back as the voice of a ghost).

**What sets it apart.** Phone party games today need internet, a shared screen and a room code. Séance needs only sound. Secret roles travel on a public channel (everyone hears the same sound) and stay secret, because every phone makes its own key when it joins.

## 2. Goals

**v1 must ship (by Dec 1 feature freeze)**

1. **Summon and join (R20, R21):** a host starts a séance; 4 to 8 players join one at a time by playing a short chirp; each player gets a candle number and a spooky name.
2. **Secret roles over sound (R22):** one broadcast gives every phone its own role, readable only on that phone.
3. **Rounds (R23, R24, R25):** private clues each round, banish, reveal by sound, win check.
4. **Play alone (R26):** a judge on one laptop plays against 3 bots through the real modem and decoder, no microphone, under a minute.
5. Haunted modem UI (candle circle, waterfall or level meter, calm mode) and an offline PWA.

**Stretch (only after the freeze checklist passes):** a second game mode, sound effects packs, more than 8 players.

**Non-goals:** accounts, servers, internet play, voice chat, players sending game moves back to the host by sound after joining (votes happen out loud and the host taps them in).

## 3. Success metrics

| Metric | Target |
| --- | --- |
| Join: player chirp heard by the host at 1–2 m | ≥ 9 of 10 |
| Roles: 4 phones in one room all get their role in the first or second cycle, people talking | ≥ 8 of 10 games |
| Wrong role ever shown | 0 |
| Play alone: home screen to the first role reveal on one laptop | < 60 s |
| A full game with 5 players | 10 to 15 min |
| Property-based cases per property per CI run | ≥ 200 for game rules, ≥ 1,000 for pure protocol |

## 4. Functional requirements (EARS)

**Engine (already built in specs 01–03; unchanged):** R1 start playing within 1 s · R2 decode from the mic · R3 CRC-32 check before showing · R4 never show partial or altered data · R5 repeat the frame cycle 3 times (spec 05) · R6, R7 passphrase lock and clean failure (spec 03; kept in the engine, not in the game UI) · R10 listening indicator, stop the mic when leaving · R11 runs offline after the first visit (spec 07) · R13 replay guard.

**Game:**

| ID | Requirement | Kiro spec |
| --- | --- | --- |
| R20 | WHEN the host taps Summon, THE SYSTEM SHALL start listening for join chirps and show an empty candle circle; WHEN a valid join chirp arrives, THE SYSTEM SHALL light the next candle (up to 8) and ignore repeats of the same chirp. | 10-game, 08-haunted-ui |
| R21 | WHEN a player taps Answer, THE SYSTEM SHALL create a new ECDH P-256 key pair, play one join frame carrying its public key, and show the player's candle number and spooky name once the host's possession broadcast lists that key. IF no possession broadcast lists it within 60 s, THEN THE SYSTEM SHALL say "The ghost didn't hear you, try again". | 03-crypto (update), 10-game |
| R22 | WHEN the host taps Begin with 4 to 8 players, THE SYSTEM SHALL assign roles (1 Possessed for 4–5 players, 2 for 6–8), and broadcast one possession message that holds, for each player, their role encrypted with AES-GCM under the key shared with that player; each phone SHALL show only its own role, and a Possessed player SHALL also see the other Possessed candle. | 10-game, 05-broadcast |
| R23 | WHEN the host starts a round, THE SYSTEM SHALL broadcast an omen with one private clue per living player, encrypted the same way: a true clue for Living players and a believable false clue for Possessed players. | 10-game |
| R24 | WHEN the host taps the banished candle, THE SYSTEM SHALL broadcast the reveal, and every phone SHALL show whether that player was Living or Possessed. | 10-game |
| R25 | WHEN all Possessed are banished, or the Possessed equal the Living, THE SYSTEM SHALL broadcast the end and every phone SHALL show the winner and every role. | 10-game |
| R26 | WHEN the user taps Play alone, THE SYSTEM SHALL run the host and 3 bot players on one device, passing the real modem waveform from encoder to decoder in memory, with the haunted UI, and need no microphone. | 08-haunted-ui |
| R27 | WHILE a role or clue is on screen, THE SYSTEM SHALL show it only while the player's finger is held down, and SHALL vibrate (where supported) when a new one arrives. | 08-haunted-ui |

## 5. Non-functional requirements

| Area | Requirement |
| --- | --- |
| Offline | No network calls after load; CSP `connect-src 'self'` |
| Browsers | Android Chrome (primary), desktop Chrome, iOS Safari 16.4+ (best effort) |
| Size | First load < 400 KB gzipped including ggwave WASM |
| Privacy | No analytics, no accounts, no third-party scripts. Keys live in memory for one game only |
| Accessibility | WCAG 2.1 AA contrast, keyboard reachable, text for every sound event, calm mode (no flashing) |
| Reliability | Every audio error (no permission, device busy) shown as plain words |
| Licence | MIT, visible in the GitHub About section |

## 6. Out of scope for v1

Internet play, accounts, saved games, chat, voting by sound, translations beyond English. (Dropped from v1.x: cards, history, groups, relay, call mode.)

## 7. Release criteria (Dec 1 freeze checklist)

- [ ] R1–R5, R10, R11, R13 and R20–R27 pass their tests
- [ ] Play alone works on a fresh laptop with no microphone permission
- [ ] One real game with 4+ phones in one room, recorded for the video
- [ ] Property suites green (protocol P1–P10, game G1–G5)
- [ ] Field-test table filled with real numbers
- [ ] Lighthouse PWA installable, offline reload works
- [ ] Live on Vercel over HTTPS
- [ ] README names prior art (ggwave, Chirp, Nedagram, Waver; phone party games that need internet)

## 8. Open questions

- Join chirp reliability with 4+ phones answering one after another in a noisy room: measure in the first real-room test.
- Does Web Crypto ECDH P-256 work on the test phones' Chrome? (Expected yes; check on iQOO, Vivo, Samsung.)
