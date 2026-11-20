# How Kiro built Wail (write-up draft)

Fill this in as you build. Judges look for each of these. Add screenshots to `docs/img/`.

## Kiro surfaces used and how they differed

- **Kiro IDE:**
- **Kiro CLI:**
- **Kiro Crew:** (wail-nightwatch, link)

## Spec-driven development vs vibe coding

| Spec | What Kiro generated | What we changed | Vibe-coded parts and why |
| --- | --- | --- | --- |

## Steering docs and what worked

## Agent hooks and what they automated

| Hook | Trigger | What it caught or saved |
| --- | --- | --- |

## Custom agent

## MCP servers and what they enabled

## Property-based testing and what it caught

Before development (Nov 20, planning, fast-check in Vitest): a property test of ggwave itself found that it can return wrong bytes with no error, for example `[0, 80]` decoded as `[0, 0]`, and 33 zero bytes decoded wrong every time at fastest speed. This shaped the protocol: whitening with a per-repeat salt, CRC-16 per frame, 12-byte minimum frame. Details in `docs/field-tests.md`.

During development (Kiro):

| Property | Failure Kiro found | Shrunk input | Fix |
| --- | --- | --- | --- |

## Kiro powers and third-party tools
