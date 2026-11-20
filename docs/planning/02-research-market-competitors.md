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
| Data over sound (apps) | Nedagram, ggwave's Waver, chirpfile | Send text or file keys as sound, one sender to one receiver | Built for technical users (configs, passwords, keys); no broadcast carousel for late joiners, no crisis cards, no published reliability numbers |
| Data over sound (ham radio) | Fldigi / AndFlmsg, minimodem | Acoustic modems for radio operators; AndFlmsg sends structured emergency forms | Needs radio know-how and setup; not for civilians in a browser |

## 3. Competitors in detail

**Bridgefy.** Bluetooth mesh messenger. It reaches about 100 m per hop and can hop between phones. It has a public broadcast mode. You must download it while online and set up a profile. It was criticised in 2020 as a privacy risk, then added end-to-end encryption.
*Our angle:* Wail needs no install from a store (it's a web page that keeps working offline) and reaches every device with a speaker, iPhones and laptops included.

**Briar.** Open-source, peer-to-peer and serverless. It syncs over Bluetooth, Wi-Fi or Tor, and contacts are added in person. It has no iOS app, and it has moved into maintenance mode because of funding.
*Our angle:* any platform, no contact setup, and one-to-many broadcast.

**Chirp.** The British data-over-sound pioneer. It was acquired by Sonos in February 2020, and its SDKs were withdrawn from public download in March 2020.
*Our angle:* the technology proved itself, then disappeared. "Resurrection" is literally true.

**ggwave / Waver.** The leading open-source data-over-sound library (MIT licence). Its README quotes 8 to 16 bytes per second; our lab test on Nov 20 measured about 10 to 28 bytes per second depending on speed, with a hard limit of 140 bytes per transmission.
*Our angle:* we build on ggwave and credit it openly. Wail adds the product layer: framing for long messages, broadcast repeats, locking, cards, history, offline install and a UI non-technical people can use.

**Nedagram. The closest competitor, and judges may find it.** An open-source offline PWA (created Jan 2026, about 36 GitHub stars in Nov 2026) built so text can be shared when the internet fails. It already has: a Phone mode (300 to 3,400 Hz, works over standard calls) and a Wideband mode, MFSK modulation, Reed-Solomon plus convolutional error correction, DEFLATE compression, optional ChaCha20-Poly1305 encryption, a SHA-256 check both sides compare, a QR fallback, English and Farsi, and a downloadable offline package. Its use cases are config files, passwords, long URLs and air-gapped key transfer, between one sender and one receiver.
*Our angle:* we credit Nedagram openly in the README and differ on purpose, not on features it already has:
- **One-to-many broadcast.** A repeating carousel built for a loudspeaker and a room of phones; a receiver that tunes in mid-message completes it on the next cycle. Nedagram is a one-to-one transfer.
- **Crisis cards for non-technical people.** Notice, location and contact cards with plain-language states, instead of raw text and a checksum to compare by hand.
- **Published reliability.** Lab, codec and field results with tries and successes per channel (`docs/field-tests.md`), on four real Indian phones.
- **The silent-corruption finding.** Our property test showed ggwave can return wrong bytes with no error; Wail's salted whitening and per-frame CRC exist because of it, and the write-up shows that story.

Phone calls are not a differentiator, because Nedagram already has a phone mode. If Wail ships call mode, we present it as parity, backed by our codec numbers.

## 4. Positioning

**For** relief teams, clinics and community organisers in places where mobile data fails,
**Wail is** an offline broadcast messenger with no app store, no account and no pairing (open it once online, then it works offline)
**that** sends one short, exact notice to every phone or laptop in earshot at once,
**unlike** Bluetooth mesh apps, which need the same store app installed on every phone in advance, and sound-transfer apps like Nedagram, which send from one person to one person.

## 5. Risks this research surfaced

- **Speed is the real limit.** Wail is for short critical text, not chat. We say so in the pitch.
- **Prior art exists** (ggwave, Nedagram, Fldigi). Novelty must come from one-to-many broadcast, crisis cards and measured results, and the README must name the prior art honestly.
- **Phone calls need a separate mode.** The offline codec simulation (Nov 20, `docs/research/codec-sim.md`) showed our default AUDIBLE speeds get 0/10 through narrowband AMR-NB calls but 10/10 through AMR-WB (VoLTE) and Opus (WhatsApp). ggwave's low-frequency DT_FASTEST protocol at volume 50 passed 10/10 on every codec tested. Real calls add noise suppression and voice detection, so the Nov 21 kill test decides.

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
- Nedagram: https://github.com/shayanb/Nedagram (README read Nov 20, 2026) and https://hnshowcase.com/post/47060844/nedagram-transfer-text-over-sound-when-internet-isn-t-availa
- Fldigi / AndFlmsg: https://sourceforge.net/projects/fldigi/
- Full prior-art list and fact-check: `docs/research/judge-review.md` §4 and §5
- Kiroween 2025 winners: https://kiroween-2025.devpost.com/project-gallery
