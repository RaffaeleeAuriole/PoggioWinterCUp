// Collega le pagine ai dati Convex in tempo reale. Classic script (funziona anche aprendo index.html con doppio clic).
(function () {
  const R = window.PWC_RENDER;
  if (!/^https:\/\/[a-z0-9.-]+\.convex\.cloud\/?$/.test(window.PWC_CONFIG.convexUrl || "")) {
    document.body.insertAdjacentHTML("afterbegin", '<div style="background:#b00020;color:#fff;padding:14px;text-align:center;font-weight:600">Configurazione mancante: apri js/config.js e scrivi l’indirizzo di Convex (https://….convex.cloud).</div>');
    return;
  }
  const client = new convex.ConvexClient(window.PWC_CONFIG.convexUrl);
  const bind = (name, html, hideEmpty) => document.querySelectorAll(`[data-bind="${name}"]`).forEach((el) => {
    el.innerHTML = html;
    const sec = hideEmpty && el.closest("section");
    if (sec) sec.style.display = html ? "" : "none";
  });
  const detail = (err) => String((err && err.message) || err).replace(/\[CONVEX[^\]]*\]\s*/g, "").replace(/\s+/g, " ").slice(0, 300);
  const fail = (name) => (err) => { console.error(name, err); bind(name, R.empty("Impossibile caricare i dati. Riprova tra poco.") + `<p class="mut" style="font-size:12px;overflow-wrap:anywhere">Dettaglio tecnico: ${R.esc(detail(err))}</p>`); };
  const once = (fn, args) => new Promise((res, rej) => { let stop; stop = client.onUpdate(fn, args, (v) => { res(v); setTimeout(() => stop && stop(), 0); }, rej); });
  const sub = (fn, args, cb, name) => client.onUpdate(fn, args, cb, fail(name || fn));

  sub("public:standings", {}, (rows) => { bind("standings", R.standingsRows(rows)); bind("teamstats", R.teamStats(rows)); });
  sub("public:calendar", {}, (days) => { bind("calendar", R.calendar(days)); bind("results", R.results(days), true); });
  sub("public:teams", {}, (list) => bind("teams", R.teams(list)));
  sub("public:scorers", {}, (rows) => bind("scorers", R.scorersRows(rows)));
  sub("public:allNews", {}, (list) => bind("news", list.length ? list.map(R.newsArticle).join("") : R.empty("Nessuna notizia pubblicata.")));
  sub("public:regulation", {}, (r) => bind("regulation", R.regulation(r)));
  sub("public:siteLogo", {}, (l) => { if (l && /^https:\/\//.test(l.url || "")) document.querySelectorAll(".lg").forEach((el) => { el.style.backgroundImage = `url(${l.url})`; }); });

  // News in home: solo quelle degli ultimi 3 giorni; la finestra si aggiorna ogni ora.
  let stop = null;
  function homeNews() {
    if (stop) stop();
    const since = Math.floor((Date.now() - 3 * 864e5) / 36e5) * 36e5;
    stop = sub("public:homeNews", { since }, (list) => bind("home-news", list.map(R.newsPost).join(""), true));
  }
  homeNews(); setInterval(homeNews, 36e5);

  // Top 7, Man/Team of the Week (7 giorni in home, poi storico) e premi finali.
  const state = { top7: null, weekly: null };
  const drawTop7 = () => { if (state.top7) bind("top7", R.top7Page(state.top7, state.weekly)); };
  sub("public:top7", {}, (t) => { state.top7 = t; drawTop7(); bind("top7-mini", R.top7Mini(t.current), true); });
  let stopWeekly = null;
  function weekly() {
    if (stopWeekly) stopWeekly();
    const since = Math.floor((Date.now() - 7 * 864e5) / 36e5) * 36e5;
    stopWeekly = sub("public:weekly", { since }, (w) => { state.weekly = w; bind("motw", R.motwSection(w.current), true); bind("motw-history", R.motwHistory(w.history)); drawTop7(); });
  }
  weekly(); setInterval(weekly, 36e5);
  sub("public:finalAwards", {}, (d) => bind("awards", R.awardsPage(d)));

  sub("public:homeMatchDay", {}, (d) => bind("matchday", R.matchDayPoster(d), true));
  sub("public:knockout", {}, (rows) => bind("knockout", R.knockoutPage(rows)));
  sub("public:archive", {}, (list) => bind("archive", R.archivePage(list)));

  // Dettaglio partita: clic (o Invio) su una partita apre la pagina dedicata.
  let stopDetail = null;
  function openMatch(id) {
    if (stopDetail) stopDetail();
    document.getElementById("t-md").checked = true; window.scrollTo(0, 0);
    stopDetail = sub("public:matchDetail", { matchId: id }, (d) => bind("matchdetail", R.matchDetail(d)), "matchdetail");
  }
  document.addEventListener("click", (e) => { const r = e.target.closest("[data-match]"); if (r) openMatch(r.dataset.match); });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter") { const r = e.target.closest && e.target.closest("[data-match]"); if (r) openMatch(r.dataset.match); } });

  // Accesso admin (username + password). Il pannello vero arriva nella prossima tappa.
  const S = window.PWC_SESSION(client);
  const $ = (id) => document.getElementById(id);
  let mounted = false;
  const setView = (isAdmin) => { $("adm-login").hidden = isAdmin; $("adm-panel").hidden = !isAdmin; if (isAdmin && !mounted) { mounted = true; window.PWC_ADMIN.mount(client); } };
  sub("admin:me", {}, (me) => setView(!!me), "admin:me");
  S.resume().catch(() => {});
  const timeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("tempo scaduto")), ms))]);
  $("adm-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("adm-msg"), btn = $("adm-go"); btn.disabled = true; msg.textContent = "Accesso in corso…";
    try {
      const r = await S.signIn($("adm-user").value.trim(), $("adm-pass").value);
      if (!r.ok) { msg.textContent = `Username o password non corretti. (codice: ${r.error})`; }
      else {
        // Controllo diretto e affidabile: chiede al server chi siamo (non dipende dalla sottoscrizione già aperta).
        const st = await timeout(once("admin:authStatus", {}), 12000);
        if (st.ok) { $("adm-pass").value = ""; msg.textContent = ""; setView(true); }
        else msg.textContent = `Accesso riuscito ma non riconosciuto come admin (motivo: ${st.reason}${r.accepted === false ? ", token rifiutato" : ""}). Riprova.`;
      }
    } catch (err) { console.error(err); msg.textContent = "Errore: " + detail(err) + ". Riprova."; }
    btn.disabled = false;
  });
  $("adm-out").addEventListener("click", async () => { await S.signOut(); location.reload(); });

  // Schede delle squadre (tab).
  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (!tab) return;
    const box = tab.closest("[data-tabs]"), root = box.parentElement, pane = root.querySelector(`[data-pane="${tab.dataset.tab}"]`);
    box.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === tab));
    root.querySelectorAll("[data-pane]").forEach((x) => x.classList.toggle("on", x === pane));
  });
})();
