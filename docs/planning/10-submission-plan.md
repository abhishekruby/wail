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
| 0:00–0:15 | One phone on a speaker, three devices in airplane mode | "No internet. No SIM data. Watch." A short notice (about 16 bytes at FAST: a manifest frame plus one data frame, about 4 s of sound; not FASTEST, which fails in echoey rooms per `docs/research/carousel-sim.md`) plays and appears on all three at once |
| 0:15–0:40 | Problem | Three verified facts on screen (below), one line on disasters |
| 0:40–1:20 | Product | Late joiner: a fourth phone starts listening mid-message and completes it on the next cycle; a locked message; a location card; close and reopen the app in airplane mode to show it still loads |
| 1:20–1:45 | Why it is different | One line on prior art ("one-to-one sound apps exist; Wail broadcasts to a room"), then the solo demo on a laptop: "Judges, try it on one device" |
| 1:45–2:25 | How Kiro built it | Two readable, zoomed moments only: a property test shrinking the real ggwave silent-corruption bug, and the Crew nightly trend report |
| 2:25–2:50 | Proof and close | Field-test table (incl. the call row if call mode shipped), live URL, repo link |

Audio: lower the modem sound in the edit so it doesn't hurt on headphones, and put captions on every spoken line.

**Problem-section facts (each checked in the original source by Claude Code on Nov 20; details in `docs/research/impact-evidence.md`):**

1. "Manipur, 2023: the internet was shut off for 212 days." (TIME / Access Now, May 2024)
2. "Cyclone Fani disrupted 6,058 mobile towers in Odisha." (CDRI study via Times of India, Oct 2026)
3. "Kerala floods, 2018: 23,552 mobile towers went down." (DoT via New Indian Express, Aug 2018)

Optional fourth line: "India: 65 internet shutdowns in 2025, the most of any democracy." (Access Now)

**Demo scenario:** an Odisha cyclone shelter. A coordinator's phone on the shelter's battery PA broadcasts a notice + location card to three phones; then a locked patient referral goes 1-to-1. Use a fictional phone number on screen.

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
