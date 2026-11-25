# Pubblicare il sito online (guida passo passo)

Il sito ha due parti che stanno in due posti diversi:
- **Convex** (i dati, il login, le funzioni): resta nel cloud, non serve il tuo Mac acceso.
- **Il sito** (la cartella `sito-online`): file statici su un hosting gratuito.

Dopo il lancio gestisci tutto dal pannello Admin, dal browser, anche dal telefono.

## Parte 1 · Convex di produzione (una volta sola)
1. Terminale, nella cartella `pwc`: `npx convex deploy`. Se chiede di creare/usare il deployment di produzione, rispondi sì. Alla fine mostra un indirizzo `https://…convex.cloud`: **copialo**, è l'indirizzo di PRODUZIONE (diverso da quello di prova).
2. Convex Dashboard → in alto cambia da **Development** a **Production**.
3. Settings → Environment Variables → aggiungi `ALLOW_ADMIN_SIGNUP` = `true`.
4. Functions → `auth:signUpWithUsernamePassword` → argomenti `{ "username": "...", "password": "..." }` → Run. Fallo per ogni admin (password lunghe, diverse da quelle di prova). Più di 2 admin: aggiungi prima `MAX_ADMINS` = numero.
5. **Importante:** rimetti `ALLOW_ADMIN_SIGNUP` a `false` (o cancellala). Se resta `true`, un estraneo potrebbe creare un account admin.

## Parte 2 · Il sito
1. Apri `sito-online/js/config.js` con TextEdit e sostituisci `INSERISCI-QUI-L-INDIRIZZO-DI-PRODUZIONE` con l'indirizzo copiato al punto 1.1 (tra le virgolette). Salva.
2. Crea un account gratuito su cloudflare.com.
3. Dashboard → **Workers & Pages** → **Create application** → **Get started** → **Drag and drop your files** (o "Pages → Use direct upload"; i nomi possono cambiare un poco).
4. Nome progetto `poggio-winter-cup`, trascina la cartella `sito-online`, premi **Deploy site**. Ti dà un indirizzo tipo `poggio-winter-cup.pages.dev`.
5. Apri l'indirizzo: se vedi una barra rossa "Configurazione mancante", il passo 2.1 non è stato fatto bene.

## Parte 3 · Primo avvio in produzione
Il sito di produzione parte vuoto (i dati "Demo" sono solo nel deployment di prova).
1. Sul sito vai in **Admin**, entra con uno degli admin creati in produzione.
2. **Torneo → Nuovo torneo**: nome "Poggio Winter Cup 2026", anno, sede "Centro Sportivo Di Cagno".
3. Poi: Squadre, Giocatori, Giornate, Regolamento (PDF), logo, ecc.

## Aggiornamenti futuri
- Cambia il codice dei dati/funzioni: `npx convex deploy`.
- Cambia la grafica o le pagine: ricarica la cartella `sito-online` su Cloudflare (stesso progetto, "Create deployment").
Non servono altri comandi.

## Cose verificate e non verificate (24 nov 2026)
- Cloudflare Pages: piano gratuito con banda illimitata (fonti terze), caricamento drag and drop fino a 1.000 file di 25 MiB l'uno (documentazione Cloudflare). Non ho aperto il tuo account: i nomi dei pulsanti possono differire.
- Alternativa: Netlify gratuito ha 300 crediti al mese (circa 15 GB di trasferimento) e il sito va in pausa se si superano: sconsigliato per un torneo con tanti visitatori.
- Convex: piano gratuito circa 1 milione di chiamate al mese; da controllare nelle serate di partita (Dashboard → Usage).
- NON ancora fatto: dominio personalizzato, intestazione di sicurezza CSP (vedi docs/CSP_opzionale.txt, da provare prima di attivarla).

## Backup e ripristino dei dati
- **Backup a mano (consigliato prima di ogni evento importante):** Convex Dashboard (Production) → Backups → crea un backup, con l'opzione di includere i file (foto, loghi, PDF). Con il piano gratuito se ne conservano al massimo 2 per deployment, e i backup automatici periodici richiedono il piano Pro.
- **Scaricarne una copia sul Mac:** dalla stessa pagina con il pulsante di download, oppure da Terminale: `npx convex export --path ~/Downloads` (aggiungi `--prod` per la produzione e `--include-file-storage` per i file). Conserva lo ZIP in un posto sicuro e non pubblicarlo: contiene dati reali.
- **Ripristino:** Dashboard → Backups → scegli il backup → Restore. In alternativa `npx convex import nomefile.zip --replace --prod` (ATTENZIONE: sostituisce i dati attuali; i dati inseriti dopo il backup si perdono).
- **Le variabili d'ambiente non sono nel backup:** annota a parte `ALLOW_ADMIN_SIGNUP` / `MAX_ADMINS` (Dashboard → Settings → Environment Variables).
- Da provare: un ripristino di prova in un deployment di prova prima del lancio, per essere sicuri che funzioni.
