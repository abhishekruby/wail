# 03 · Users and target audience

Stage status: done (Nov 20, 2026)

## Primary audience

People who must pass short, exact text to others nearby when mobile data is down: relief and NGO field teams, small clinics, and community organisers in shutdown-prone or disaster-prone regions. India and East Africa are the first focus.

## Personas

### Meera, relief coordinator (primary)

- **Context:** cyclone relief camp, towers overloaded, data dead for 2 days.
- **Job to be done:** get the shelter list, a missing-person note and a GPS pin to 40 volunteers at once.
- **Today:** shouts it, writes it on a board, people copy it wrong.
- **With Wail:** plays the notice through the camp loudspeaker 3 times; every volunteer's phone shows the exact text.
- **Success for her:** nobody gets the address wrong.

### Imran, clinic nurse

- **Context:** district town under a mobile data shutdown.
- **Job to be done:** send a patient referral note (name, age, ward, reason) to the ambulance driver's phone.
- **With Wail:** holds the phones 1 m apart, locks the message with a passphrase they agree out loud.
- **Success for him:** a 300-character note arrives exactly, in under a minute, and only the driver can read it.

### Lakshmi, village organiser

- **Context:** gram sabha meeting, no signal in the hall.
- **Job to be done:** share the meeting outcome (date, place, contact number) with everyone present.
- **With Wail:** broadcasts through the PA system; people save it in their history.

### Arjun, judge or developer (secondary)

- **Context:** testing the live app on a laptop and a phone.
- **Job to be done:** see it work within 30 seconds, then understand how.
- **With Wail:** opens the URL on two devices, taps Listen and Wail, and sees the message plus the live spectrogram.

## What users need (ranked)

1. **Exactness.** Wrong text is worse than none, so a bad checksum means nothing is shown.
2. **Zero setup.** No account, no pairing, no app store.
3. **One-to-many.** Crowds, not just pairs.
4. **Privacy when needed.** A lock for sensitive notes.
5. **Clear feedback.** People must see that it is listening, receiving or done.
6. **Accessibility.** Text and vibration for deaf users, calm mode for people sensitive to flicker.

## Environment constraints

- Cheap Android phones running Chrome are the main target. iPhones are best effort.
- Noisy rooms. Field tests must include normal room noise.
- The first load needs internet once (before the crisis). After that the app works fully offline.
- Low literacy in some groups: big buttons, icons plus words, and a short Hindi-English copy pass after v1.

## Non-users (v1)

Anyone who needs photos, voice notes or long chats. Wail sends roughly 10 to 28 bytes per second, so it is for short text.
