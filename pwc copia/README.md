# Poggio Winter Cup

Design approvato: `frontend/anteprima-v3-APPROVATA.html` (riferimento; nelle fasi successive si spezza in pagine senza cambiare l'aspetto).

## Architettura (database: Convex)
- **Convex** = database + funzioni server (JavaScript) + login + archivio immagini + aggiornamenti in tempo reale. Funzioni in `convex/`.
- **Frontend** = HTML/CSS/JS puro con il client Convex da script tag (nessun build per il frontend). Sessione admin: `frontend/js/admin-session.js`.
- Classifica, marcatori e MOTW sono **query calcolate dai risultati**: niente contatori da aggiornare. `closeMatch` e' una transazione e si puo' rieseguire per correggere senza doppi conteggi.
- Ogni mutation admin chiama `requireAdmin` lato server. Ogni dato ha `editionId`: le edizioni archiviate sono separate dalle nuove.
- Immagini: URL di upload temporaneo (`files.generateUploadUrl`), poi `assertImage` accetta solo JPG/PNG/WEBP fino a 5 MB (niente SVG) e cancella i file non validi.

## Cambiamenti rispetto al piano iniziale
1. **PHP non serve piu'**: la logica sta nelle funzioni Convex. Il frontend e' statico (qualunque hosting statico). Codice PHP/Supabase della Fase 1 in `_superseded/` (non cancellato).
2. **Node.js solo sul tuo PC** (CLI `npx convex dev` / `npx convex deploy`). Il sito pubblicato non usa Node e non ha build.
3. Funzioni scritte in JavaScript (niente TypeScript).

## Login admin (Convex Auth 2.x, username + password)
- Nessuna registrazione pubblica: l'account si crea solo con `ALLOW_ADMIN_SIGNUP=true` (variabile d'ambiente Convex, da attivare SOLO durante la configurazione) e fino a `MAX_ADMINS` account (default 2).
- Poi si rimette `ALLOW_ADMIN_SIGNUP` a `false` (o si elimina). Chi ha un account in `users` e' admin.

## Setup
1. `npm install` (installa convex, @convex-dev/auth, ecc. da `package.json`)
2. `npx convex dev` (crea il deployment e carica `convex/`; rigenera `convex/_generated/`)
3. Pannello Convex → Settings → Environment Variables: `ALLOW_ADMIN_SIGNUP=true`. (Il deployment potrebbe richiedere anche altre variabili di Convex Auth: segui il messaggio di errore/le istruzioni della libreria.)
4. Pannello Convex → Functions: esegui `auth:signUpWithUsernamePassword` con `{ "username": "...", "password": "..." }` per i 2 admin.
5. Rimetti `ALLOW_ADMIN_SIGNUP=false`.
6. Test locali: `npm test`.

## Stato (onesto)
TESTATO in locale (77 test automatici, `npm test`): classifica e marcatori calcolati dai risultati con gli spareggi del regolamento (scontri diretti, poi differenza reti, poi gol segnati); semifinali andata e ritorno (in parità passa la meglio classificata); vittoria a tavolino; chiusura e correzione partita senza doppi conteggi; autogol; rifiuto di marcatori incoerenti; permessi (non autenticati e non admin respinti); registrazione admin chiusa e limitata; numeri di maglia univoci; trasferimenti (le statistiche restano con la squadra di allora); eliminazione con storico = archiviazione; nuovo torneo con archivio del vecchio; news in home solo se recenti; un solo Match Day in home; Top 7 (7 giocatori, 1 portiere); premi finali nascosti finche' non sbloccati.
NON TESTATO: il login vero (la libreria cifra le password con un modulo che non gira nei test: nei test il login e' simulato); upload immagini; `admin-session.js` nel browser; tutto su un deployment Convex reale; limiti del piano gratuito durante l'uso reale.
FATTO come codice: squadre, giocatori, giornate/partite, Match Day (sfondo), news, Man/Team of the Week, Top 7, tabellone, premi.
NON FATTO: pannello admin collegato, pagina di login, Match Day/Man of the Week/Top 7/tabellone/premi/edizioni passate collegati, guide per l'admin.

## Regole a tempo
- News in home: ultimi 3 giorni (`homeNews`, il client passa `since`), tutte nella pagina News.
- Man/Team of the Week: 7 giorni in home dalla pubblicazione, poi storico (`weekly`: `current` e `history`).
- Match Day: uno solo in home (`setHomeMatchDay` sostituisce il precedente).

## Verifiche su Convex (19 nov 2026)
Client da script tag supportato; piano gratuito circa 1M chiamate/mese, 0.5 GB di database, 1 GB di file (controlla l'uso nelle serate di partita). Convex Auth 2.x e' una riscrittura rispetto alle versioni beta: la configurazione di questo progetto segue la versione 2.1.0.

## Regolamento (PDF "Poggio Open Winter Cup")
Recepito nel backend: spareggi classifica, semifinali andata/ritorno (1ª-4ª e 2ª-3ª), vittoria a tavolino, sede di gioco per edizione, date delle giornate opzionali (infrasettimanali "da definire").
Da chiarire con l'organizzatore: nome ufficiale, numero e struttura delle giornate (8 date ma 6 partite a squadra), cartellini e squalifiche, minutaggio minimo, finale, pagina Regolamento nel sito.

## Novità (21 nov 2026)
- **Stella**: ogni squadra ha una "stella" scelta dall'admin (`teams.updateTeam` con `starId`, deve far parte della squadra). Nel sito appare nello staff della squadra e con una stella dorata nella rosa.
- **Logo del sito**: solo admin (`site.setSiteLogo`, solo JPG/PNG/WEBP; senza file torna all'originale). Il frontend legge `public.siteLogo`.
- **Supplementari e rigori**: solo nelle fasi finali (`extraTime`, `pensA`, `pensB` nel tabellone). In parità decidono i rigori se inseriti; nelle semifinali, senza rigori, passa la meglio classificata (regolamento).
- **Regolamento**: lo carica l'admin come PDF (`site.setRegulation`, solo PDF fino a 10 MB, uno per edizione); la pagina pubblica mostra "Apri il PDF" / "Scarica" (`public.regulation`) oppure "non ancora disponibile". Il testo statico del vecchio regolamento e' stato tolto.
- **Tante squadre**: la classifica cresce con il numero di squadre (testato con 10).

## Tappa 1: pagine pubbliche collegate ai dati (21 nov 2026)
- `frontend/index.html` = anteprima approvata + dati veri da Convex (classifica, calendario, squadre e rose, marcatori, news in home 3 giorni e pagina News, regolamento PDF, logo del sito). Si apre anche con doppio clic. Le sezioni non ancora collegate mostrano "Sezione in arrivo" (niente dati finti).
- Generato con `python3 tools/make_live.py frontend/anteprima-v3-APPROVATA.html frontend/index.html`; logica in `frontend/js/render.js` (testata) e `frontend/js/app.js` (non testata nel browser). `frontend/js/convex-browser.bundle.js` = client Convex 1.51.0 locale.
- Funzioni interne per iniziare (si eseguono dal pannello Convex → Functions): `setup:seedFirstEdition`, `setup:seedDemoData` (dati di prova "Demo ..."), `setup:clearEditionData` con `{ "confirm": "CANCELLA" }` per toglierli.
- Nell'aggiornare una cartella `pwc` gia' in uso NON sovrascrivere `convex/_generated` (lo genera Convex).

## Tappa 2: dettaglio partita e accesso admin (21 nov 2026)
- **Dettaglio partita**: clic su una partita (calendario, risultati) apre la pagina con risultato, giornata, data, sede e marcatori (autogol segnato). Query `public.matchDetail`.
- **Accesso admin**: pagina "Admin" con username e password (`frontend/js/admin-session.js`, token gestiti a mano come descrive Convex Auth). `admin.me` dice al sito se chi e' collegato e' admin. Il pannello vero non c'e' ancora: dopo l'accesso compare "Sei collegato come admin".
- TESTATO (32 test): logica del dettaglio e di `admin.me`; sessione nel browser con un client finto (password giusta/sbagliata, rinnovo token unico anche in parallelo, ripresa dopo ricaricamento, sessione scaduta, uscita).
- NON TESTATO: il login vero su Convex dal browser. Verificare che `ALLOW_ADMIN_SIGNUP` sia `false` (o assente) nel pannello Convex.

## Diagnosi (tappa 2b)
- Se una pagina non carica i dati, sotto il messaggio compare il "Dettaglio tecnico" dell'errore di Convex.
- Accesso admin: il sito mostra il codice del rifiuto (USER_NOT_FOUND = username inesistente, INVALID_CREDENTIALS = password errata), oppure se il server ha rifiutato il token, oppure il motivo per cui l'account non e' riconosciuto admin (`admin:authStatus`).
- Dettagli tecnici e codici sono per la fase di prova: a sito pronto si mostrera' un messaggio generico.

## Tappa 3a: pannello admin - Dashboard, Squadre, Giocatori (22 nov 2026)
- `frontend/js/admin.js`: dashboard (conteggi), squadre (aggiungi, modifica, elimina/archivia, colori, allenatore, presidente, capitano, stella, logo) e giocatori (aggiungi, modifica, ritira, elimina/archivia, foto). Le foto/loghi si caricano con `files:generateUploadUrl` e il server controlla il tipo (solo JPG/PNG/WEBP, max 5 MB).
- Le altre sezioni del pannello mostrano "Sezione in arrivo" e verranno collegate una alla volta (giornate, risultati con marcatori, Top 7 e premi, trasferimenti, news, Match Day, tabellone, torneo, regolamento).
- Corretto: la pagina dettaglio partita compariva sotto il footer; tolto "anteprima" dal footer.
- NON TESTATO nel browser: i form del pannello e il caricamento delle foto (provati solo logica e viste).

## Tappa 3b: accesso admin piu' affidabile (22 nov 2026)
- Dopo il login il sito chiede direttamente al server chi sei (`admin:authStatus`) invece di aspettare solo la sottoscrizione gia' aperta (che poteva restare ferma al vecchio valore). Messaggio "Accesso in corso…" subito e un messaggio per ogni esito.
- Nella pagina Admin compare "versione 3b": se non la vedi, i file del sito non sono aggiornati.

## Tappa 3c: Giornate e Risultati nel pannello admin (23 nov 2026)
- **Giornate**: crea giornate (numero e data facoltativa), aggiungi partite (casa, ospite, data/ora facoltativa), cambia la data, elimina partite e giornate vuote. Nessun numero fisso di partite per giornata.
- **Risultati**: scegli la partita, scrivi il risultato e i marcatori scelti dalla rosa di ogni squadra (piu' righe, numero di gol per giocatore, autogol, vittoria a tavolino). Il sito controlla che i marcatori tornino col punteggio; salvando, classifica e statistiche si aggiornano da sole. Si puo' correggere in qualsiasi momento (nessun doppio conteggio).
- Corretto il layout dei moduli (colori, file e scritte su righe separate). Versione mostrata nella pagina Admin: 3c.
- NON TESTATO nel browser: i moduli di giornate e risultati (provati logica, viste e backend).

## Tappa 3d: correzione (23 nov 2026)
- Scegliendo una partita in Risultati (o cambiando squadra in Giocatori) il modulo non compariva: il pannello rifiutava di ridisegnarsi finche' il menu a tendina era selezionato. Ora le azioni dell'utente ridisegnano sempre; solo gli aggiornamenti automatici in sottofondo aspettano che finisci di scrivere. Versione 3d.

## Tappa 3e (23 nov 2026)
- Dopo aver salvato un risultato, le righe dei marcatori sparivano dal modulo (si usava una lettura una-tantum che poteva restituire dati vecchi). Ora la partita scelta resta sottoscritta e il modulo si riempie con i marcatori veri. Versione 3e.

## Tappa 3f: autogol e vittoria a tavolino (23 nov 2026)
- **Autogol** ridisegnato: sotto i marcatori di ogni squadra c'e' "Autogol a favore di <squadra>": si sceglie il giocatore AVVERSARIO che ha segnato nella propria porta (esempio: autogol di un giocatore della Beta a favore dell'Alfa = 1-0 per l'Alfa). Prima la casella "autogol" stava sulla riga del giocatore ed era poco intuitiva.
- **Vittoria a tavolino**: spunta la casella, scrivi il risultato (nessun marcatore; eventuali righe rimaste vengono ignorate).
- **Nuovo test nel browser simulato** (`tests/admin-dom.test.js`, jsdom): sceglie la partita, aggiunge marcatori e autogol, invia il modulo e controlla cosa parte verso il server (49 test in tutto). Il modulo ora usa `form.elements` per leggere i campi. Versione 3f.

## Tappa 3g: Top 7, Man e Team of the Week, Premi (23 nov 2026)
- **Admin > Top 7 · MOTW**: sceglie il modulo (2-3-1, 3-2-1, 2-2-2, 3-1-2) e i 7 giocatori dalle rose (1 portiere + 6, senza ripetizioni); "Salva e pubblica" o "Salva come bozza"; pubblica/nascondi/elimina. Man of the Week (giornata, giocatore, motivazione, sfondo) e Team of the Week (giornata, squadra, motivazione, sfondo facoltativo).
- **Pubblico**: pagina Top 7 con il campo del modulo scelto dall'admin (nessun selettore per l'utente) e "Settimane precedenti" (vecchie Top 7 + Team of the Week passati); in home Man e Team of the Week per 7 giorni e mini Top 7; i Man of the Week passati stanno in Marcatori sotto la classifica.
- **Admin > Premi**: sblocca/blocca la sezione; assegna premi (MVP, Capocannoniere, Miglior portiere, personalizzato) con giocatore, motivazione, foto. Il pubblico vede il lucchetto finche' non sblocchi.
- **Top 7 nello storico**: solo quelle che sono state pubblicate; bozze e nascoste non si vedono.
- 64 test (compresi i moduli nel browser simulato). NON TESTATO nel browser vero. Versione 3g.

## Tappa 3i: tutte le sezioni del pannello admin collegate (24 nov 2026)
- **Trasferimenti** (giocatore, nuova squadra, data, nuovo numero se serve, nota; storico), **News** (bozza/pubblica/nascondi/elimina/modifica, foto di sfondo; in home 3 giorni), **Match Day** (sfondo green screen + "pubblica in home", uno solo alla volta, "togli dalla home"), **Regolamento** (PDF, solo PDF max 10 MB), **Torneo** (chiudi torneo, nuovo torneo che archivia il vecchio, logo del sito), **Tabellone** (squadre, andata/ritorno, supplementari, rigori).
- **Sito pubblico**: Match Day in home (blocco con foto, loghi, nomi, risultato/VS, data e sede; clic = dettaglio), pagina Tabellone con vincitori, pagina "Altre edizioni" con campione, finale, capocannoniere e classifica di ogni edizione archiviata.
- Il primo torneo reale si puo' creare da Admin > Torneo (non serve piu' il Dashboard di Convex); i dati "Demo" si tolgono con `setup:clearEditionData`.
- 77 test (moduli nel browser simulato, upload con file finti). NON TESTATO nel browser vero. Versione 3i.

## Tappa 4: pubblicazione (24 nov 2026)
- `sito-online/` = cartella pronta da pubblicare (index.html, js/, `_headers` con intestazioni di sicurezza semplici). `js/config.js` va compilato con l'indirizzo Convex di produzione; se manca, il sito mostra una barra rossa.
- Guida: `docs/PUBBLICAZIONE.md` (Convex di produzione, hosting Cloudflare Pages, primo avvio, aggiornamenti). Rigenerabile con `python3 tools/make_online.py`.
