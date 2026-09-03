# HOTA HaLo Extension — brief de implementare
(3 sep 2026 — proiect NOU, repo separat `hota-halo-extension`, la invitația lui Sebastián Delmont / Ham2K)

## Context
HOTA — History On The Air (https://cqhota.app) e un program OTA pentru vestigii istorice ≥200 ani. Sebastián (autorul Ham2K PoLo/HaLo) ne-a invitat să fim experimentul sistemului de extensii HaLo: "ask it to write an activity extension for HaLo for the HOTA program, including spots, scoring and exports".

## Pasul 0 — studiază SDK-ul ÎNTÂI
- `@ham2k/extension-sdk` — https://www.npmjs.com/package/@ham2k/extension-sdk
- `@ham2k/extension-tools` — https://www.npmjs.com/package/@ham2k/extension-tools
Respectă întocmai structura de "activity extension" din SDK (lifecycle, manifest, API-urile expuse de HaLo). NU inventa arhitectură proprie. Folosește harness-ul de test din extension-tools dacă există.

## Ce face extensia
1. **Referințe**: sursa = API-ul public HOTA (docs: https://cqhota.app/api-docs):
   - `GET https://cqhota.app/api/v1/references/export` (CSV complet) sau endpoint JSON echivalent — cache local, refresh periodic (respectă ETag/304 dacă serverul îl oferă).
   - Căutare ca la POTA în PoLo: tastezi "0235" → RO-H0235 cu nume + distanță; sugestii sortate pe distanță față de poziția GPS; suport multi-țară (RO-H/PL-H/HU-H/BG-H — formatul `XX-H\d{4}`, NU hardcoda țările).
2. **Spots**: citire `GET /api/v1/spots` (polling 1-2 min) + self-spot prin API-ul public de spotare (vezi api-docs; regulile: TTL, re-spot, comentariu cu \bQRT\b închide spotul).
3. **Scoring** (afișare live în activare): activare validă = **minim 5 QSO-uri cu indicative distincte** per referință per zi UTC, orice bandă/mod (fără repetoare, satelit OK); H2H = ambele stații pe referințe HOTA (aceeași referință: detectat automat de server; referințe diferite: câmpul de referință a corespondentului). Extensia arată contorul (ex. "HOTA 3/5"), serverul rămâne autoritatea la upload.
4. **Export**: ADIF cu `MY_SIG=HOTA` / `MY_SIG_INFO=<referința>`, iar pentru H2H `SIG=HOTA` / `SIG_INFO=<referința corespondentului>` — exact formatul pe care cqhota.app îl parsează la upload. Multi-program: HaLo gestionează celelalte activități (POTA etc.) — extensia HOTA emite doar câmpurile HOTA.

## Reguli de proiect
- Nimic hardcodat ce vine din API (liste de țări, praguri, formate); doar regula 5-QSO e constantă de program.
- Fără secrete în repo (API-urile HOTA publice nu cer cheie). Licență MIT. README în engleză cu setup + arhitectură.
- TDD: parsarea referințelor, matching-ul codurilor (4 cifre → sugestii), scoring (4 QSO invalid / 5 valid / duplicat același call nu numără), generarea ADIF (round-trip cu exemplele din README-ul cqhota).
- Livrabil: pachet npm publicabil + scenariu de test pas-cu-pas pentru Sebastián (integrare beta HaLo).

## Ce NU faci
- Nu construiești UI propriu (UI-ul e al HaLo, prin SDK).
- Nu urci loguri pe cqhota.app din extensie (fluxul rămâne: HaLo exportă ADIF → operatorul îl încarcă pe site) — decât dacă SDK-ul are un hook oficial de "submit", caz în care îl documentezi ca propunere, nu îl implementezi fără endpoint autentificat.
- Nu atingi în niciun fel serverul cqhota.app — e alt repo, alt flux.
