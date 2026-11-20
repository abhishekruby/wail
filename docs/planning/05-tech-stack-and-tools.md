# 05 · Tech stack and tools

Stage status: done (Nov 20, 2026). Versions checked on npm and PyPI the same day.

Wail is a static, frontend-only TypeScript app, because during a shutdown no server can be reached. The Kiro Crew app (`wail-nightwatch`) is Python.

## App stack

| Layer | Choice | Version | Why |
| --- | --- | --- | --- |
| Language | TypeScript, strict | 7.0.x | Types catch byte and offset bugs |
| Build | Vite | 8.3.x | Fast dev server, static output |
| UI | Preact + plain CSS | 11.2.x, preset-vite 2.10.x | About 4 KB, React-like |
| Modem | ggwave (npm, MIT) | 0.4.0 | FSK + Reed-Solomon, WASM, browser example exists |
| Audio in | Web Audio API, AudioWorklet | native | Mic frames off the main thread; ScriptProcessor is deprecated |
| Audio out | AudioBufferSourceNode | native | Plays the waveform ggwave returns |
| Spectrogram | AnalyserNode + Canvas 2D | native | No chart library |
| Compression | CompressionStream (deflate-raw) | native | Helps longer notices |
| Lock | Web Crypto: PBKDF2-SHA-256 + AES-GCM-256 | native | Audited, no crypto dependency |
| Storage | IndexedDB via `idb` | 8.0.x | 1 KB promise wrapper |
| Offline | `vite-plugin-pwa` (Workbox) | 2.0.x | Precache and install |
| Unit and property tests | Vitest + fast-check | 5.1.x, 4.10.x | Shrinking, thousands of cases |
| End-to-end | Playwright (Chromium fake mic) | 1.65.x | Feeds a WAV in as the microphone |
| CI | GitHub Actions | n/a | Tests on every push |
| Hosting | Vercel | n/a | Free HTTPS (the mic needs HTTPS) |

## Crew app stack (`wail-nightwatch`, separate repo)

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Python 3.12 | Your strongest language |
| Modem | `ggwave` on PyPI (0.4.3) | Same protocol as the web app |
| Noise | NumPy | White noise, room echo, clipping |
| Report | JSON + small HTML panel inside Kiro Crew | Nightly error-rate trend |

## Development tools

| Tool | Use |
| --- | --- |
| **Kiro IDE** | Main development tool: specs (requirements → design → tasks), hooks, steering, property-based testing |
| **Kiro CLI** | Headless test runs and quick fixes from the terminal |
| **Kiro Crew** | Runs the nightwatch app every night |
| Claude (this chat) | Planning, research, docs, review |
| Claude Code | Helper only: reviews, debugging, scripts. See the rule in 08-project-rules.md |
| GitHub | Two public repos, MIT |
| Vercel | Deploys from `main` |
| OBS Studio or a phone camera | Demo video |

## MCP servers (configured in `.kiro/settings/mcp.json`)

| Server | Package | Why |
| --- | --- | --- |
| Context7 | `@upstash/context7-mcp` | Up-to-date Web Audio, ggwave, Vite and Preact docs |
| Playwright | `@playwright/mcp` | Kiro can open the app, click through flows and take screenshots |
| GitHub (optional) | official GitHub MCP | Issues and PRs; needs your token, so add it yourself |

## Local environment

| Need | Status on your laptop (checked Nov 20) |
| --- | --- |
| Node.js | v22 found; Vite 8 needs Node 20.19+ or 22.12+, so it's fine |
| npm | 10.9 |
| git | 2.34 |
| Python | python3 present (check it is 3.10+ for nightwatch) |
| Browsers | Chrome desktop + Chrome on iQOO Neo 6 |
| HTTPS for phone testing | `vite --host` plus `@vitejs/plugin-basic-ssl`, or a Vercel preview URL |

## Accounts to prepare

- [ ] Kiro account + hackathon credit request (ID check; deadline Dec 1, 12:00 PM PT)
- [ ] GitHub repos `wail` and `wail-nightwatch`
- [ ] Vercel project linked to `wail`
- [ ] YouTube channel for the public demo video
- [ ] dev.to account for the blog post
