# 01 · Problem and idea

Stage status: done (Nov 20, 2026)

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

- One device plays the data as tones. Every device in earshot that has Wail open decodes it.
- No internet, no SIM data, no Bluetooth pairing, no account.
- One phone on a loudspeaker or PA system can reach a whole room at once.

## Why sound, when Bluetooth apps exist

| Need in a blackout | Bluetooth/Wi-Fi mesh apps | Wail |
| --- | --- | --- |
| Works on Android, iPhone and laptops | Varies (Briar has no iOS app) | Any modern browser with a mic and speaker |
| Reach a crowd at once | Range around 10 to 100 m, needs every phone to run the app | Loudspeaker or PA carries it across a hall |
| Pairing or contacts first | Usually yes | No |
| Carries over a radio, a speaker or (stretch) a phone call | No | Yes, anything that carries sound |
| Speed | Fast, can send photos | Slow (about 10 to 28 bytes per second, measured): short text only |

Wail does not replace mesh messengers. It covers the case they can't: one-to-many, any device, with no setup.

## One-line pitch

> The dial-up modem died in the 2000s. We dug it up, because when the internet is switched off, sound still travels.

## Name

**Wail.** A banshee wails, and the word rhymes with "mail": mail carried by wailing. One syllable, easy to say in English and Hindi, easy to remember. "Banshee" was dropped because the name belongs to a well-known open-source media player.

## Sources

- Access Now 2025 figures: https://visionias.in/current-affairs/upsc-daily-news-summary/article/2026-04-01/the-indian-express/security/india-recorded-65-internet-shutdowns-in-2025-highest-among-democracies-access-now-report
- Access Now 2023 figures: https://www.newslaundry.com/2024/05/15/116-shutdowns-in-2023-sixth-year-in-a-row-india-leads-in-global-internet-shutdowns
- Top10VPN cost report 2025: https://www.top10vpn.com/cost-of-internet-shutdowns/
- Briar (no iOS app): https://reclaimthenet.org/?p=241234
