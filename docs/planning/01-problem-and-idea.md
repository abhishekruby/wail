# 01 · Problem and idea

Stage status: done (Nov 20, 2026; revised the same day after the judge review and codec simulation in `docs/research/`)

## The problem

When mobile data goes down, people lose the one channel they use for everything. Speakers and microphones still work.

- India recorded 65 internet shutdowns in 2025, the highest among democracies (Access Now).
- In 2023, 68 of India's 116 shutdowns (59%) "exclusively targeted mobile networks" (Access Now, via Newslaundry).
- Worldwide, government-imposed shutdowns cost an estimated $19.7 billion in 2025, across 28 countries and more than 120,000 hours (Top10VPN).
- Top10VPN counts "severe throttling" to 2G, where only SMS and voice calls get through, as a blackout in practice.
- Floods, cyclones and overloaded towers cause the same gap with no government involved.

Who feels it most: relief workers, clinics, local organisers and families who need to pass one short, exact piece of text (an address, a shelter list, a referral note, a meeting time) to people standing a few metres away.

## The idea

**Wail** sends short messages between phones and laptops as sound. It revives the 1960s acoustic modem idea in a browser app:

- **One sender, a whole room of receivers.** One phone on a loudspeaker or PA system reaches every device in earshot at once. The message repeats in a loop, so someone who starts listening late still gets all of it on the next cycle.
- No internet, no SIM data, no Bluetooth pairing, no account. Open the web page once while online; after that it works fully offline.
- Short, exact, structured messages (notices, locations, contacts), shown only if every byte checks out.

## Why sound, when Bluetooth apps exist

| Need in a blackout | Bluetooth/Wi-Fi mesh apps | Wail |
| --- | --- | --- |
| Works on Android, iPhone and laptops | Varies (Briar has no iOS app) | Any modern browser with a mic and speaker (Android Chrome primary, iPhone best effort) |
| Reach a crowd at once | Range around 10 to 100 m, needs every phone to run the app | Loudspeaker or PA carries it across a hall |
| Pairing or contacts first | Briar: contacts first. Bridgefy broadcast: no pairing, but the app must be installed from a store in advance | No pairing, no account; the page must be opened once online |
| Carries over a speaker, a PA or a radio | No | Yes, anything that carries sound |
| Carries over a phone call | No | Needs a separate low-frequency "call mode": passes AMR and Opus codecs in the lab (`docs/research/codec-sim.md`); real calls tested Nov 21 |
| Speed | Fast, can send photos | Slow (about 10 to 28 bytes per second raw, measured; less after framing and repeats): short text only |

Wail does not replace mesh messengers. It covers the case they can't: one-to-many, any device, with no setup.

**Closest existing app: Nedagram** (open source, 2026). It sends text over sound between two people, including over phone calls, with encryption and error correction, and targets technical users sharing config files and passwords. Wail's difference is the use case: one sender to a whole room, late joiners catching the repeat, structured crisis cards for non-technical people, and published field reliability numbers. Details in `02-research-market-competitors.md`.

## One-line pitch

> The dial-up modem died in the 2000s. We dug it up, because when the internet is switched off, sound still travels.

## Name

**Wail.** A banshee wails, and the word rhymes with "mail": mail carried by wailing. One syllable, easy to say in English and Hindi, easy to remember. "Banshee" was dropped because the name belongs to a well-known open-source media player.

## Sources

- Access Now 2025 figures: https://visionias.in/current-affairs/upsc-daily-news-summary/article/2026-04-01/the-indian-express/security/india-recorded-65-internet-shutdowns-in-2025-highest-among-democracies-access-now-report
- Access Now 2023 figures: https://www.newslaundry.com/2024/05/15/116-shutdowns-in-2023-sixth-year-in-a-row-india-leads-in-global-internet-shutdowns
- Top10VPN cost report 2025: https://www.top10vpn.com/cost-of-internet-shutdowns/
- Briar (no iOS app): https://reclaimthenet.org/?p=241234
- Nedagram: https://github.com/shayanb/Nedagram
- Fact-check of this file (Nov 20): `docs/research/judge-review.md` §5
