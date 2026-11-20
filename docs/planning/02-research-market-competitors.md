# 02 · Research, validation, market and competitors

Stage status: done (Nov 20, 2026)

## 1. Is the problem real and big enough?

Yes. The evidence, with sources at the end:

| Signal | Number | Source |
| --- | --- | --- |
| Shutdowns in India, 2025 | 65, the highest among democracies | Access Now |
| India's 2023 shutdowns that cut only mobile networks | 68 of 116 (59%) | Access Now via Newslaundry |
| Global economic cost of shutdowns, 2025 | $19.7 billion, up 156% on 2024 | Top10VPN |
| Major government outages, 2025 | 212 across 28 countries, the most in one year | Top10VPN |
| Sub-Saharan Africa cost, 2025 | about $1.11 billion, 116 million+ users hit | Top10VPN via BusinessDay |

Validation from behaviour: when shutdowns hit, people actively look for offline tools. Bridgefy says it reached over 12 million downloads with no marketing, and Indian protesters turned to it during the 2019 shutdowns. People clearly want an offline channel.

## 2. Market map

Offline communication splits into four groups:

| Group | Examples | How it works | Gap Wail fills |
| --- | --- | --- | --- |
| Bluetooth/Wi-Fi mesh messengers | Bridgefy, Briar, FireChat (dead) | Phones relay messages over Bluetooth or Wi-Fi | Need the app installed in advance from a store; pairing; uneven iOS support |
| Hardware radios | Meshtastic (LoRa), goTenna | Extra device per person | Costs money, must be bought before the crisis |
| Data over sound (SDKs) | Chirp (acquired by Sonos in 2020, SDK withdrawn), ggwave (open source) | Encode bytes as tones | Libraries and demos, not a product for crisis use |
| Data over sound (apps) | ggwave's Waver, Nedagram (early, Feb 2026), chirpfile | Send text or file keys as sound | Built for tech users; no broadcast mode, no crisis cards, reliability unpublished |

## 3. Competitors in detail

**Bridgefy.** Bluetooth mesh messenger. It reaches about 100 m per hop and can hop between phones. It has a public broadcast mode. You must download it while online and set up a profile. It was criticised in 2020 as a privacy risk, then added end-to-end encryption.
*Our angle:* Wail needs no install from a store (it's a web page that keeps working offline) and reaches every device with a speaker, iPhones and laptops included.

**Briar.** Open-source, peer-to-peer and serverless. It syncs over Bluetooth, Wi-Fi or Tor, and contacts are added in person. It has no iOS app, and it has moved into maintenance mode because of funding.
*Our angle:* any platform, no contact setup, and one-to-many broadcast.

**Chirp.** The British data-over-sound pioneer. It was acquired by Sonos in February 2020, and its SDKs were withdrawn from public download in March 2020.
*Our angle:* the technology proved itself, then disappeared. "Resurrection" is literally true.

**ggwave / Waver.** The leading open-source data-over-sound library (MIT licence). Its README quotes 8 to 16 bytes per second; our lab test on Nov 20 measured about 10 to 28 bytes per second depending on speed, with a hard limit of 140 bytes per transmission.
*Our angle:* we build on ggwave and credit it openly. Wail adds the product layer: framing for long messages, broadcast repeats, locking, cards, history, offline install and a UI non-technical people can use.

**Nedagram.** An early project (Feb 2026) for sending text over phone calls. Its own page says reliability is unproven.
*Our angle:* we publish measured success rates from field tests.

## 4. Positioning

**For** relief teams, clinics and community organisers in places where mobile data fails,
**Wail is** a no-install, no-pairing offline messenger
**that** sends short, exact text to every phone or laptop in earshot,
**unlike** Bluetooth mesh apps, which need the same app on every phone and pairing first.

## 5. Risks this research surfaced

- **Speed is the real limit.** Wail is for short critical text, not chat. We say so in the pitch.
- **Prior art exists** (ggwave, Nedagram). Novelty must come from the product, the crisis focus, broadcast mode and the measured results.
- **Phone-call transfer is unproven** (voice codecs). It is a stretch goal, decided by the day-1 kill test.

## 6. Hackathon fit (Kiroween 2026)

- **Category:** Resurrection. We bring a dead technology (the acoustic modem, Chirp's withdrawn SDK) back to life for a live problem.
- **What judges rewarded last year:** InteractionKit won 1st place, UnitSet 2nd and SpookBnB 3rd; Faxi won Best Resurrection. Every winner had a wow you can see or hear in seconds and documented heavy Kiro use.

## Sources

- Top10VPN 2025: https://www.top10vpn.com/cost-of-internet-shutdowns/ and https://www.top10vpn.com/research/internet-shutdowns/
- Sub-Saharan Africa figures: https://businessday.ng/?p=1099457
- Bridgefy 12M downloads: https://www.alchemistaccelerator.com/blog/bridgefy-the-offline-messaging-app-revolutionizing-crisis-communication-worldwide
- Bridgefy in India: https://blog.bridgefy.me/blog/indian-protesters-turn-to-bridgefy-to-defy-an-internet-shutdown
- Bridgefy range and setup: https://dailydot.com/?p=896191
- Bridgefy privacy criticism: https://yro.slashdot.org/story/20/08/24/2228219
- Briar maintenance mode: https://www.webpronews.com/briar-shifts-to-maintenance-mode-as-funding-woes-hit-privacy-tools-for-activists/
- Briar range: https://briarproject.org/quick-start/
- Chirp acquisition: https://en.wikipedia.org/wiki/Chirp_(company)
- ggwave: https://github.com/ggerganov/ggwave
- Nedagram: https://hnshowcase.com/post/47060844/nedagram-transfer-text-over-sound-when-internet-isn-t-availa
- Kiroween 2025 winners: https://kiroween-2025.devpost.com/project-gallery
