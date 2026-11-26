# 10 · Submission plan (Kiroween 2026)

All items come from the official rules: https://kiroween.devpost.com/rules

## Entry

| Field | Value |
| --- | --- |
| Category | Resurrection |
| Bonus prizes | Best Kiro Crew App (link `wail-nightwatch`), Bonus Blog, Social Blitz. Best Demo is automatic for the top 10%. |
| Official deadline | Dec 4, 2026, 2:00 PM PT = Dec 5, 3:30 AM IST |
| Our deadline | Dec 3, 2026, 11:00 PM IST |

## Demo video (under 3:00, public on YouTube, no third-party music)

| Time | Shot | What is shown or said |
| --- | --- | --- |
| 0:00–0:20 | Dark room, 4 people, phones face down on a table, a laptop on a speaker | The laptop screams in modem tones; all 4 phones light up at the same moment. One player holds a finger on the screen: "POSSESSED". Caption: "No internet. No Wi-Fi. No app. Just sound." |
| 0:20–0:40 | The idea | "Dial-up modems died 20 years ago. We brought one back as a ghost." How to play in 3 lines |
| 0:40–1:30 | A real round | Players answer the summons one by one (candles light on the laptop); an omen whispers a private clue to each phone; a 20 s cut of the argument; everyone points; the host taps the candle; the ghost reveals "Living". Second round, the possessed player is caught |
| 1:30–1:50 | How the secret stays secret | Simple animation: everyone hears the same sound, but each phone made its own key when it joined, so it can open only its own role. Say "ECDH and AES-GCM, in the browser" once |
| 1:50–2:05 | For judges | Play alone on one laptop: "Try it yourself, no second device, no microphone" |
| 2:05–2:35 | How Kiro built it | Two readable, zoomed moments: a property test shrinking a real bug (the signed CRC-32, or the salt that ggwave never decodes), and the specs in `.kiro/specs/` |
| 2:35–2:50 | Close | Field-test numbers, live URL, repo. Last line: "The same engine can broadcast emergency notices when there is no network." |

Audio: keep the modem sound, it is the ghost's voice, but lower it in the edit so it doesn't hurt on headphones. Captions on every spoken line.

**Cast:** family or friends who agree to be filmed; faces optional (hands and phones are enough).

**Problem-section facts** (`docs/research/impact-evidence.md`) are no longer the opening. Keep at most one line in the close, and only a fact checked in its source.

## Checklist

- [ ] Public repo `wail`, MIT licence visible in About
- [ ] `.kiro/` at root with specs, steering, hooks, settings; not gitignored
- [ ] Live URL works with no login on Android Chrome and desktop Chrome
- [ ] Description of features and how they work, with a "Prior art" paragraph naming ggwave, Chirp, Nedagram, Waver and internet-based phone party games, and how Wail differs
- [ ] Testing instructions for judges start with Play alone: "On one laptop, tap Play alone"
- [ ] Kiro write-up: surfaces used (IDE, CLI, Crew) and how they differed; custom agent; hooks; specs vs vibe coding; steering strategy; MCP; property-based testing and what it caught; powers if used
- [ ] Category and bonus boxes ticked; `wail-nightwatch` repo linked
- [ ] dev.to blog post saying it was written for the Kiroween 2026 hackathon
- [ ] Social post beginning with #KiroweenHackathon26, naming a favourite Kiro feature and how it changed your approach
- [ ] Credits requested by Dec 1, 12:00 PM PT and redeemed by Dec 4
- [ ] Submitted by Dec 3, 11:00 PM IST
