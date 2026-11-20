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
| 0:00–0:15 | One phone on a speaker, three devices in airplane mode | "No internet. No SIM data. Watch." A short notice (about 20 bytes at FASTEST, under 3 s of sound) plays and appears on all three at once |
| 0:15–0:40 | Problem | Shutdown numbers on screen, one line on disasters |
| 0:40–1:20 | Product | Late joiner: a fourth phone starts listening mid-message and completes it on the next cycle; a locked message; a location card; close and reopen the app in airplane mode to show it still loads |
| 1:20–1:45 | Why it is different | One line on prior art ("one-to-one sound apps exist; Wail broadcasts to a room"), then the solo demo on a laptop: "Judges, try it on one device" |
| 1:45–2:25 | How Kiro built it | Two readable, zoomed moments only: a property test shrinking the real ggwave silent-corruption bug, and the Crew nightly trend report |
| 2:25–2:50 | Proof and close | Field-test table (incl. the call row if call mode shipped), live URL, repo link |

Audio: lower the modem sound in the edit so it doesn't hurt on headphones, and put captions on every spoken line.

## Checklist

- [ ] Public repo `wail`, MIT licence visible in About
- [ ] `.kiro/` at root with specs, steering, hooks, settings; not gitignored
- [ ] Live URL works with no login on Android Chrome and desktop Chrome
- [ ] Description of features and how they work, with a "Prior art" paragraph naming Nedagram, Waver and ggwave and how Wail differs
- [ ] Testing instructions for judges start with the solo demo: "On one laptop, tap Try it on this device"
- [ ] Kiro write-up: surfaces used (IDE, CLI, Crew) and how they differed; custom agent; hooks; specs vs vibe coding; steering strategy; MCP; property-based testing and what it caught; powers if used
- [ ] Category and bonus boxes ticked; `wail-nightwatch` repo linked
- [ ] dev.to blog post saying it was written for the Kiroween 2026 hackathon
- [ ] Social post beginning with #KiroweenHackathon26, naming a favourite Kiro feature and how it changed your approach
- [ ] Credits requested by Dec 1, 12:00 PM PT and redeemed by Dec 4
- [ ] Submitted by Dec 3, 11:00 PM IST
