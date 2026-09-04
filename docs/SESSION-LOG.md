# Jurnal de proiect (pentru a relua lucrul de pe orice PC, în orice sesiune)

Acest fișier e memoria proiectului: ce s-a făcut, ce s-a decis, ce a zis Sebastián, ce urmează.
O sesiune nouă de Claude Code citește `CLAUDE.md` → `AGENTS.md` → acest jurnal → `docs/BETA-TEST-PLAN.md`.
Brief-ul original (3 sep 2026, în română) e în `docs/BRIEF.ro.md`.

## Cum reiei lucrul pe un PC nou

```sh
git clone https://github.com/bogdan790/hota-halo-extension && cd hota-halo-extension
npm install
npm run check          # typecheck + 99 teste + build + pack → yo3bee-hota-<versiune>.h2kext
```

- **HaLo pe Linux**: AppImage-ul `halo-next` cere glibc 2.38. Pe Ubuntu 22.04 rulează într-un distrobox Ubuntu 24.04
  creat cu `--nvidia` (dacă placa e NVIDIA): `distrobox create --name halo --image docker.io/library/ubuntu:24.04 --nvidia --yes`,
  apoi în container `apt-get install libgtk-3-0 libsecret-1-0 libjsoncpp25 libgl1-mesa-dri mesa-utils libayatana-appindicator3-1 libnotify4`.
  Dezarhivează AppImage-ul (`--appimage-extract`) și pornește `distrobox enter halo -- <dir>/AppRun`. Pe Ubuntu 24.04+ rulează direct.
- **Instalarea extensiei în HaLo**: pe build-ul 26.9.0 (160) „Install from file…", argumentul de lansare și drag & drop
  NU au deschis dialogul de instalare (Sebastián repară bug-ul; confirmat de el pe Windows la dublu-click). Merge dezarhivarea
  manuală: `unzip yo3bee-hota-*.h2kext -d ~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota/` + restart.
  După fiecare `npm run build`, copiază `build/index.js` și `build/manifest.json` în același folder și repornește aplicația.
- **Release**: bump `version` în `manifest.json` + `package.json`, `npm run check`, commit, `gh release create vX.Y.Z yo3bee-hota-X.Y.Z.h2kext`.
- **npm**: cont `bogdan_790`, 2FA cu passkey (WebAuthn, fără aplicație TOTP). `npm publish` se rulează DOAR dintr-un
  terminal interactiv, în Chrome (Firefox pe Linux nu știe passkey prin telefon); Claude Code nu poate publica singur.
  Verificare: `npm view hota-halo-extension versions`.

## Cronologie

### 3 sep 2026 — construirea extensiei (o sesiune, seara)
- Pornit de la brief-ul lui Bogdan (`docs/BRIEF.ro.md`), la invitația lui Sebastián Delmont (Ham2K): „ask it to write an
  activity extension for HaLo for the HOTA program, including spots, scoring and exports".
- Studiat `@ham2k/extension-sdk` 0.2.0 și `@ham2k/extension-tools` 0.2.0 (repo-ul HaLo github.com/ham2k/halo NU e public;
  documentația din pachetul SDK e singura referință). Scaffold cu `h2kext-init yo3bee-hota`; structura urmează sample-ul
  `k2hrc-llota`: `referenceActivity` + `activityScorer` + `activityExportHook` + `huntingExportHook` + `activityAdifImport`.
- Construit: referințe (data file din `GET /api/v1/references/export`, `rootPath: "references"`), căutare numerică
  (`0235` → toate țările, cel mai apropiat primul), spoturi (feed + self-spot + re-spot), scoring, ADIF export/import,
  cont pentru cheie, i18n en+ro. Teste vitest contra unui kernel HaLo fals (`test/kernel.ts`).
- Repo GitHub public creat, release v0.1.0, npm `hota-halo-extension@0.1.0` (publicat de Bogdan după crearea contului npm).
- Trimis lui Sebastián link-ul + `docs/BETA-TEST-PLAN.md`. Răspuns: „Test it on your logger. You know the program better".
- Instalat HaLo pe PC-ul lui Bogdan (distrobox, vezi mai sus). Prima rulare reală: lista de referințe OK, căutarea OK,
  titlul operațiunii OK, exportul ADIF OK (vezi `docs/TEST-REPORT-2026-09-03.md`).
- Bug 1 (găsit pe aparat): la tastare, un indicativ repetat arăta „New Day" — QSO-ul live vine fără `startAtMillis`,
  scorerul SDK îl citea ca 1970. Fix `3b09018`: judecat ca „acum" (ceasul aplicației).
- Descoperit că cqhota.app NU mai are cheie API în profil (fusese scoasă, era token de sesiune). Decizie: cheie NOUĂ de
  integrare per user, scope limitat (POST /spots + GET /me/summary), header `X-Integration-Key`. Extensia aliniată (v0.1.1).
  Partea de server scrisă în repo-ul HOTA.app (commit-uri `af0b5fc`, `75f7735`): NEDEPLOYATĂ — vezi decizia din 4 sep.
- Bug 2 (găsit pe aparat): același indicativ pe altă bandă arăta „Dupe!". Regula HOTA = 5 indicative distincte per sit
  per zi UTC, orice bandă/mod. Fix `d4236c7`: dublurile se judecă zi+bandă+mod (ca la POTA, cu „New Band"/„New Mode"),
  iar contorul numără indicativele distincte (`hotaScorer` în `src/scoring.ts`).
- Raport de teste: `docs/TEST-REPORT-2026-09-03.md`. Trimis lui Sebastián.

### 4 sep 2026
- Sebastián, despre raport: „this looks good. you can share this with others (I'm fixing the bug where doubleclicking
  h2kext on windows does not install it). I'm going to be building a "catalog" of extensions, and have the app make it
  easy to search it. So that this extension does not have to be included on HaLo when installed, but users can find it
  and install it when needed."
- Release v0.1.2 (fix-ul de scoring) pe GitHub + npm `hota-halo-extension@0.1.2` (0.1.1 nu a fost publicat pe npm).
- Răspuns trimis lui Sebastián: release-ul e public și se distribuie activatorilor HOTA; aceeași problemă de instalare
  văzută pe Linux; HOTA vrea să fie printre primele intrări din catalog.
- **Decizia lui Bogdan**: cheia de integrare de pe server rămâne comisă pe `main` în HOTA.app, NEDEPLOYATĂ, până la
  următoarea sesiune de teste HaLo (înainte de self-spot pe teren și înainte de distribuția prin catalog). Orice alt deploy
  pe cqhota o duce automat în producție → Claude Code trebuie să anunțe explicit. Scris în `HOTA.app/CLAUDE.md`.

- Sebastián: „can you share the prompt you used? there's a couple of other programs that might be interested in
  following your lead here". Răspuns: `docs/PROMPT.md` — brief-ul original tradus în engleză + o variantă
  generalizată pentru alte programe (cu lecțiile din teste și de pe aparat) + secțiunea „What your server needs
  first" (API public de citire + cheie de integrare per user, cu scope limitat, pentru self-spot). Trimis link-ul.

- Trimis lui Sebastián și nota că self-spot-ul din HaLo cere, pe serverul fiecărui program, o cheie per user cu
  scope limitat (a noastră: construită, intră live înainte de testul de self-spot pe teren). Reacția lui la brief:
  „I love the 'do not invent your own architecture'".

- Decizie Bogdan (4 sep): NU cerem includerea HOTA în PoLo (app-polo, aplicația stabilă); dacă Sebastián apreciază
  efortul, o va propune el. Dacă vine invitația: PR în `ham2k/app-polo` după pattern-ul activităților POTA/WWBOTA,
  portând din această extensie (data file, spoturi, regula 5 indicative distincte, câmpurile ADIF).

- Închiderea conversației cu Sebastián (00:54): „that's the idea". Nimic de răspuns; mingea e la el (fix-ul de
  instalare .h2kext, catalogul, eventual PoLo).
- Sesiunea s-a încheiat pe 4 sep, ~01:00. Stare la final: extensia v0.1.2 pe GitHub (release cu .h2kext) și npm;
  99 de teste verzi; HaLo instalat local (distrobox) cu extensia dezarhivată manual; serverul cqhota cu cheia de
  integrare comisă pe main, NEDEPLOYATĂ (decizia din secțiunea de mai sus); toată documentația în repo:
  `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/BRIEF.ro.md`, `docs/PROMPT.md`, `docs/BETA-TEST-PLAN.md`,
  `docs/TEST-REPORT-2026-09-03.md`, acest jurnal.

### 4 sep 2026, după-amiază — self-spot cap-coadă pe aparat
- Cheia de integrare a intrat în producție pe cqhota.app: deploy-ul HOTA.app de după-amiază a dus pe server migrarea 022
  + rutele `X-Integration-Key` (`POST /spots`, `GET /me/summary`) + cardul din My Account. Nit găsit la test și rezolvat
  în HOTA.app (`ed9b28b`): 401-ul fără header spunea doar „missing X-Api-Key"; acum numește ambele header-e.
  Verificat live: fără header → 401, cheie inventată → 403, cheia reală → 200 cu `callsign: YO3BEE`.
- Test pe halo-next 26.9.0 (**162**): cheie generată în My Account → HaLo → Settings → Accounts & Services → HOTA →
  Test → „Connected as YO3BEE" → Save. Operațiune la RO-H0123, 20 m USB 14300 (14:29Z): self-spot, QSY, QRT prin
  comentariu — toate trei au apărut corect pe cqhota.app/spots. Panoul SPOTS încarcă feed-ul HOTA; butonul HOTA din
  rândul de acțiuni apare doar pe operațiunile cu sit HOTA. Raport: `docs/TEST-REPORT-2026-09-04.md`.
- Observații: (1) în SPOTS rândul HOTA are iconiță de copac (deciduous), deși manifestul și fiecare `Spot` au
  `icon: "castle"`; (2) instalarea `.h2kext` pe Linux tot nu deschide dialogul (nici pe 162).
- Mesaj trimis lui Sebastián (după-amiază, scris de Bogdan): ce a intrat în v0.1.2 (cele două fix-uri de scoring, cu
  commit-urile), self-spot-ul cap-coadă cu cheia de integrare, linkurile către raport și jurnal, plus cele două
  întrebări (iconița, instalarea pe Linux).
- Răspunsul lui Sebastián (15:50): „build 162 has double-click for windows, but not linux yet"; iconițe: „any icon from
  MDI (https://pictogrammers.com/library/mdi/) by name, or any icon from Font Awesome Free
  (https://fontawesome.com/search) prefixed with fa-"; despre regula celor 5 indicative distincte: „things like this
  is precisely why I want to have you guys be in charge of your own extensions".
- **Decizie Bogdan (schimbă decizia de la 00:55):** îi mulțumim și îl rugăm discret, „doar când poate", să adauge HOTA
  (cqhota.app) și în Ham2K PoLo. Mesajul a fost redactat în această sesiune (Claude) și trimis de Bogdan.
- Extensia instalată local e build-ul din 3 sep 22:53 (are fix-ul de scoring, dar manifestul zice 0.1.1). De reinstalat
  din `build/` (0.1.2) la următorul test.

## Ce urmează (în ordinea probabilă)
1. Iconița din SPOTS: încearcă `fa-chess-rook` / `fa-fort-awesome` pe rândurile de spot ca să vezi dacă `Spot.icon` e
   citit; dacă nu, întreabă-l pe Sebastián de unde ia rândul iconița (tipul de referință?). `castle` există în MDI.
2. Reinstalează build-ul 0.1.2 în `~/.local/share/com.ham2k.logger.next/extensions/yo3bee-hota/` (manifest 0.1.1 acum).
3. Retest pe aparat: același indicativ pe bandă nouă → „New Band", contor neschimbat (fix-ul `d4236c7`, v0.1.2).
4. Când apare catalogul Ham2K: adaugă HOTA în formatul cerut de Sebastián (manifestul are deja nume/descriere/keywords/icon).
5. Dacă Sebastián acceptă HOTA în PoLo: PR în `ham2k/app-polo` după pattern-ul POTA/WWBOTA, portând din această
   extensie (data file, spoturi, regula 5 indicative distincte, câmpurile ADIF).
6. Cu un al doilea operator în eter: tap pe spot → completează situl vânat; re-spot explicit dintr-un QSO logat; H2H.
7. Neverificate pe aparat: exportul hunter, importul ADIF, offline. Rămâne „⚠ verify": semantica `dbLookupSelectAll`.

## Contacte și linkuri
- Sebastián Delmont, Ham2K (autorul PoLo/HaLo) — discuția se poartă pe chat, în engleză.
- Repo: https://github.com/bogdan790/hota-halo-extension · npm: https://www.npmjs.com/package/hota-halo-extension
- cqhota.app API: https://cqhota.app/api-docs (și `hota-server/API.md` în repo-ul HOTA.app)
