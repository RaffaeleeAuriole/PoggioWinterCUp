// Pannello admin (script classico). Parte pura (testata) + collegamento al DOM e a Convex (mount).
(function (root) {
  const R = root.PWC_RENDER, esc = R.esc;
  const SECTIONS = [["dash", "Dashboard"], ["teams", "Squadre"], ["players", "Giocatori"], ["days", "Giornate"], ["results", "Risultati"], ["top7", "Top 7 · MOTW"], ["awards", "Premi"], ["transfers", "Trasferimenti"], ["news", "News"], ["matchday", "Match Day"], ["bracket", "Tabellone"], ["edition", "Torneo"], ["rules", "Regolamento"]];
  const ROLES = { POR: "Portiere", DIF: "Difensore", CEN: "Centrocampista", ATT: "Attaccante" };
  const hex = (c, d) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : d);

  // ---------- parte pura: costruzione e controllo degli argomenti ----------
  function teamArgs(v, isNew) {
    const name = String(v.name || "").trim(), short = String(v.shortName || "").trim().toUpperCase();
    if (isNew || v.name !== undefined) { if (!name) throw new Error("Scrivi il nome della squadra"); }
    if (short.length < 2 || short.length > 4) throw new Error("La sigla deve avere da 2 a 4 lettere");
    const a = { name, shortName: short, colorPrimary: hex(v.colorPrimary, "#1f3df0"), colorSecondary: hex(v.colorSecondary, "#ffffff") };
    for (const k of ["coach", "president"]) if (String(v[k] || "").trim()) a[k] = String(v[k]).trim();
    for (const k of ["captainId", "starId", "logoId"]) if (v[k]) a[k] = v[k];
    return a;
  }
  function playerArgs(v) {
    const firstName = String(v.firstName || "").trim(), lastName = String(v.lastName || "").trim(), n = Number(v.shirtNumber);
    if (!firstName || !lastName) throw new Error("Scrivi nome e cognome");
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("Il numero di maglia deve essere tra 1 e 99");
    if (!ROLES[v.role]) throw new Error("Scegli il ruolo");
    const strengths = String(v.strengths || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
    const a = { firstName, lastName, shirtNumber: n, role: v.role, strengths };
    if (String(v.note || "").trim()) a.note = String(v.note).trim();
    if (v.photoId) a.photoId = v.photoId;
    return a;
  }

  // Ogni riga rappresenta un singolo gol.
  function goalsFromRows(blocks) {
    const out = [];
    for (const b of blocks) {
      for (const [rows, own] of [[b.rows || [], false], [b.ownRows || [], true]]) {
        for (const r of rows) {
          const playerId = r.querySelector("[name=sp]").value;
          const assistPlayerId = r.querySelector("[name=sa]")?.value;
          if (!playerId) throw new Error("Scegli il giocatore in ogni riga dei marcatori");
          const g = { playerId, teamId: own ? b.oppId : b.teamId, ownGoal: own };
          if (assistPlayerId && !own) g.assistPlayerId = assistPlayerId;
          out.push(g);
        }
      }
    }
    return out;
  }

  function cardsFromRows(form) {
    return [...form.querySelectorAll(".card-event")].map((r) => {
      const playerId = r.querySelector("[name=cp]").value;
      if (!playerId) throw new Error("Scegli il giocatore di ogni cartellino");
      return {
        playerId,
        teamId: r.closest("[data-cards]").dataset.tid,
        type: r.querySelector("[name=ct]").value,
      };
    });
  }

  function resultArgs(v, goals, cards, homeId) {
    const h = Number(v.homeGoals), a = Number(v.awayGoals);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) throw new Error("Scrivi il risultato (numeri interi da 0 in su)");
    if (v.walkover) { if (cards.length) throw new Error("Vittoria a tavolino: non puoi inserire cartellini"); return { homeGoals: h, awayGoals: a, walkover: true, goals: [], cards: [] }; }
    let home = 0, away = 0;
    for (const g of goals) { if ((g.teamId === homeId) !== g.ownGoal) home++; else away++; }
    if (home !== h || away !== a) throw new Error(`I marcatori (${home}-${away}) non corrispondono al risultato (${h}-${a})`);
    return { homeGoals: h, awayGoals: a, goals, cards };
  }

  const FORMATIONS = ["2-3-1", "3-2-1", "2-2-2", "3-1-2"];
  const AWARD_KINDS = { mvp: "MVP", capocannoniere: "Capocannoniere", miglior_portiere: "Miglior portiere", custom: "Personalizzato" };
  function slotLabels(formation) {
    const names = ["Difensore", "Centrocampista", "Attaccante"], out = ["Portiere"];
    formation.split("-").map(Number).forEach((n, r) => { for (let i = 1; i <= n; i++) out.push(n > 1 ? `${names[r]} ${i}` : names[r]); });
    return out;
  }
  function top7Args(v, publish) {
    const ids = [0, 1, 2, 3, 4, 5, 6].map((i) => v["p" + i]);
    if (ids.some((x) => !x)) throw new Error("Scegli tutti e 7 i giocatori");
    if (new Set(ids).size !== 7) throw new Error("Un giocatore non può comparire due volte");
    if (!FORMATIONS.includes(v.formation)) throw new Error("Scegli il modulo");
    const a = { formation: v.formation, playerIds: ids, publish: !!publish };
    if (v.matchdayId) a.matchdayId = v.matchdayId;
    return a;
  }
  function awardArgs(v, imageId) {
    if (!AWARD_KINDS[v.kind]) throw new Error("Scegli il tipo di premio");
    if (!v.playerId) throw new Error("Scegli il giocatore");
    const title = String(v.title || "").trim() || (v.kind === "custom" ? "" : AWARD_KINDS[v.kind]);
    if (!title) throw new Error("Scrivi il titolo del premio");
    const a = { kind: v.kind, title, playerId: v.playerId, published: !!v.published };
    if (String(v.reason || "").trim()) a.reason = String(v.reason).trim();
    if (imageId) a.imageId = imageId;
    return a;
  }

  const NEWS_CATS = ["Trasferimenti", "Comunicati ufficiali", "Match Day", "Risultati", "Premi", "Eventi", "Novità del torneo"];
  function transferArgs(v) {
    if (!v.playerId) throw new Error("Scegli il giocatore");
    if (!v.toTeamId) throw new Error("Scegli la nuova squadra");
    if (!v.date) throw new Error("Scrivi la data");
    const a = { playerId: v.playerId, toTeamId: v.toTeamId, date: v.date };
    if (String(v.newNumber || "").trim()) { const n = Number(v.newNumber); if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("Il numero di maglia deve essere tra 1 e 99"); a.newNumber = n; }
    if (String(v.note || "").trim()) a.note = String(v.note).trim();
    return a;
  }
  function newsArgs(v, id, bgId) {
    if (!String(v.title || "").trim()) throw new Error("Scrivi il titolo");
    if (!String(v.body || "").trim()) throw new Error("Scrivi il testo dell’articolo");
    if (!NEWS_CATS.includes(v.category)) throw new Error("Scegli la categoria");
    const a = { title: String(v.title).trim(), subtitle: String(v.subtitle || "").trim(), body: String(v.body), category: v.category };
    if (id) a.id = id;
    if (bgId) a.backgroundId = bgId;
    return a;
  }
  function editionArgs(v) {
    const name = String(v.name || "").trim(), year = Number(v.year);
    if (!name) throw new Error("Scrivi il nome del torneo");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Scrivi l’anno (es. 2027)");
    const a = { name, year };
    if (String(v.venue || "").trim()) a.venue = String(v.venue).trim();
    return a;
  }
  function koArgs(v, round) {
    if (v.teamAId && v.teamBId && v.teamAId === v.teamBId) throw new Error("Le due squadre devono essere diverse");
    const n = round === "semi" ? 2 : 1, legs = [];
    let gap = false;
    for (let i = 0; i < n; i++) {
      const x = String(v[`l${i}a`] ?? "").trim(), y = String(v[`l${i}b`] ?? "").trim();
      if (x === "" && y === "") { gap = true; continue; }
      if (x === "" || y === "") throw new Error("Completa entrambi i gol della partita");
      if (gap) throw new Error("Scrivi prima il risultato dell’andata");
      const a = Number(x), b = Number(y);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) throw new Error("I gol devono essere numeri interi da 0 in su");
      legs.push({ scoreA: a, scoreB: b });
    }
    const out = { legs, extraTime: !!v.extraTime };
    if (v.teamAId) out.teamAId = v.teamAId;
    if (v.teamBId) out.teamBId = v.teamBId;
    const pa = String(v.pensA ?? "").trim(), pb = String(v.pensB ?? "").trim();
    if (pa !== "" || pb !== "") { if (pa === "" || pb === "" || !Number.isInteger(Number(pa)) || !Number.isInteger(Number(pb))) throw new Error("Scrivi i rigori di entrambe le squadre"); out.pensA = Number(pa); out.pensB = Number(pb); }
    return out;
  }

  // ---------- viste (HTML con le classi dell'anteprima) ----------
  const input = (label, name, val, extra) => `<label>${label}</label><input type="${(extra && extra.type) || "text"}" name="${name}" value="${esc(val ?? "")}" ${(extra && extra.attrs) || ""}>`;
  const opts = (list, sel, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`).join("");
  const sideNav = (cur) => `<div class="side">${SECTIONS.map(([k, l]) => `<label data-sec="${k}" class="${k === cur ? "on" : ""}">${l}</label>`).join("")}</div>`;

  function viewDash(teams, days) {
    const matches = days.flatMap((d) => d.matches), done = matches.filter((m) => m.status === "finished").length;
    const k = (n, l) => `<div class="card"><div class="kpi">${n}</div>${l}</div>`;
    return `<div class="grid">${k(teams.length, "Squadre")}${k(teams.reduce((s, t) => s + t.players.length, 0), "Giocatori")}${k(done, "Partite giocate")}${k(matches.length - done, "Da giocare")}</div>`;
  }
  function teamForm(t) {
    const pl = t ? t.players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]) : [];
    return `<form data-form="${t ? "team-edit" : "team-new"}" ${t ? `data-id="${esc(t._id)}"` : ""}>
      ${input("Nome", "name", t && t.name)}${input("Sigla (2-4 lettere)", "shortName", t && t.shortName, { attrs: 'maxlength="4"' })}
      <label>Colore principale</label><input type="color" name="colorPrimary" value="${hex(t && t.colorPrimary, "#1f3df0")}">
      <label>Colore secondario</label><input type="color" name="colorSecondary" value="${hex(t && t.colorSecondary, "#ffffff")}">
      ${input("Allenatore", "coach", t && t.coach)}${input("Presidente", "president", t && t.president)}
      ${t ? `<label>Capitano</label><select name="captainId">${opts(pl, t.captainId, "— nessuno —")}</select><label>Stella (giocatore chiave)</label><select name="starId">${opts(pl, t.starId, "— nessuna —")}</select>` : ""}
      <label>Logo (JPG, PNG o WEBP, max 5 MB)</label><input type="file" name="logo" accept="image/jpeg,image/png,image/webp">
      <button class="btn" type="submit">${t ? "Salva" : "Aggiungi squadra"}</button>${t ? ` <button class="btn o" type="button" data-act="team-del" data-id="${esc(t._id)}">Elimina squadra</button>` : ""}</form>`;
  }
  function viewTeams(teams) {
    return `<div class="card"><h3 class="mt1">Squadre</h3>${teams.map((t) => `<details class="row"><summary>${R.crestHtml ? R.crestHtml(t) : ""}${esc(t.name)}<span class="acts">Modifica ▾</span></summary>${teamForm(t)}</details>`).join("") || R.empty("Nessuna squadra ancora.")}</div><div class="card"><h3 class="mt1">Nuova squadra</h3>${teamForm(null)}</div>`;
  }
  function playerForm(p) {
    return `<form data-form="${p ? "player-edit" : "player-new"}" ${p ? `data-id="${esc(p.id)}"` : ""}>
      ${input("Nome", "firstName", p && p.firstName)}${input("Cognome", "lastName", p && p.lastName)}
      ${input("Numero di maglia", "shirtNumber", p && p.shirtNumber, { type: "number", attrs: 'min="1" max="99"' })}
      <label>Ruolo</label><select name="role">${opts(Object.entries(ROLES), p && p.role, "— scegli —")}</select>
      ${input("Punti di forza (separati da virgola)", "strengths", p && p.strengths.join(", "))}
      <label>Foto (JPG, PNG o WEBP, max 5 MB)</label><input type="file" name="photo" accept="image/jpeg,image/png,image/webp">
      <button class="btn" type="submit">${p ? "Salva" : "Aggiungi giocatore"}</button>${p ? ` <button class="btn o" type="button" data-act="player-retire" data-id="${esc(p.id)}">Ritira</button> <button class="btn o" type="button" data-act="player-del" data-id="${esc(p.id)}">Elimina</button>` : ""}</form>`;
  }
  function viewPlayers(teams, teamId) {
    if (!teams.length) return `<div class="card">${R.empty("Prima aggiungi almeno una squadra.")}</div>`;
    const t = teams.find((x) => x._id === teamId) || teams[0];
    const rows = t.players.map((p) => `<details class="row"><summary><i class="pf" style="width:36px;height:36px;font-size:16px${p.photoUrl ? `;background-image:url(${esc(p.photoUrl)})` : ""}">${p.photoUrl ? "" : esc(p.firstName[0] || "")}</i> #${p.shirtNumber} ${esc(p.firstName)} ${esc(p.lastName)} · ${p.role}<span class="acts">Modifica ▾</span></summary>${playerForm(p)}</details>`).join("");
    return `<div class="card"><label>Squadra</label><select data-team-select>${opts(teams.map((x) => [x._id, x.name]), t._id)}</select><h3 class="mt1">Rosa (${t.players.length})</h3>${rows || R.empty("Rosa vuota.")}</div><div class="card"><h3 class="mt1">Nuovo giocatore in ${esc(t.name)}</h3>${playerForm(null)}</div>`;
  }
  const fmtD = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "data da definire");
  const STATUS = { scheduled: "da giocare", live: "live", finished: "finita", postponed: "rinviata", cancelled: "annullata" };
  function viewDays(days, teams) {
    const tOpts = teams.map((t) => [t._id, t.name]);
    const next = days.length ? Math.max(...days.map((d) => d.number)) + 1 : 1;
    const cards = days.map((d) => `<details class="row"><summary>Giornata ${d.number} · ${esc(fmtD(d.playDate))}<span class="acts">Gestisci ▾</span></summary>
      <form data-form="day-edit" data-id="${esc(d.id)}"><label>Data della giornata</label><input type="date" name="playDate" value="${esc(d.playDate || "")}"><button class="btn s" type="submit">Salva data</button> <button class="btn o s" type="button" data-act="day-del" data-id="${esc(d.id)}">Elimina giornata</button></form>
      ${d.matches.map((m) => `<div class="prow"><span>${esc(m.home.name)} – ${esc(m.away.name)} · ${STATUS[m.status]}${m.kickoff ? " · " + esc(new Date(m.kickoff).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : ""}</span><button class="btn o s" type="button" data-act="match-del" data-id="${esc(m.id)}">Elimina</button></div>`).join("") || R.empty("Nessuna partita in questa giornata.")}
      <form data-form="match-new" data-day="${esc(d.id)}"><h3 class="mt1" style="font-size:22px;margin-top:12px">Aggiungi partita</h3><label>Squadra di casa</label><select name="homeTeamId">${opts(tOpts, "", "— scegli —")}</select><label>Squadra ospite</label><select name="awayTeamId">${opts(tOpts, "", "— scegli —")}</select><label>Data e ora (facoltativa)</label><input type="datetime-local" name="kickoff"><button class="btn" type="submit">Aggiungi partita</button></form></details>`).join("");
    return `<div class="card"><h3 class="mt1">Giornate</h3>${cards || R.empty("Nessuna giornata ancora.")}</div><div class="card"><h3 class="mt1">Nuova giornata</h3><form data-form="day-new"><label>Numero</label><input type="number" name="number" min="1" value="${next}"><label>Data (facoltativa)</label><input type="date" name="playDate"><button class="btn" type="submit">Aggiungi giornata</button></form></div>`;
  }
  function scorerRow(players, playerId, assistPlayers, assistId, own = false) {
    return `<div class="scorer"><select name="sp">${opts(players, playerId, "— marcatore —")}</select>${own ? "" : `<select name="sa">${opts(assistPlayers, assistId, "— assist (facoltativo) —")}</select>`}<button class="btn o s" type="button" data-act="del-row">✕</button></div>`;
  }
  function cardRow(players, playerId, type) {
    return `<div class="card-event"><select name="cp">${opts(players, playerId, "— giocatore —")}</select><select name="ct">${opts([["yellow","Giallo"],["red","Rosso"]], type || "yellow")}</select><button class="btn o s" type="button" data-act="del-card-row">✕</button></div>`;
  }
  const rosterOpts = (team, extra) => { const l = team.players.map((p) => [p.id, `#${p.shirtNumber} ${p.firstName} ${p.lastName}`]); for (const e of extra || []) if (!l.some((x) => x[0] === e.playerId)) l.push([e.playerId, `${e.firstName} ${e.lastName}`]); return l; };
  function viewResults(days, teams, matchId, detail) {
    const all = days.flatMap((d) => d.matches.map((m) => ({ ...m, day: d.number })));
    if (!all.length) return `<div class="card">${R.empty("Prima crea le giornate e le partite.")}</div>`;
    const sel = `<div class="card"><label>Partita</label><select data-match-select>${opts(all.map((m) => [m.id, `G${m.day} · ${m.home.name} – ${m.away.name}${m.status === "finished" ? ` (${m.homeGoals}–${m.awayGoals})` : ""}`]), matchId, "— scegli la partita —")}</select></div>`;
    const m = all.find((x) => x.id === matchId);
    if (!m) return sel;
    const goals = detail?.goals || [], cards = detail?.cards || [];
    const teamOf = (id) => teams.find((t) => t._id === id) || { players: [] };
    const block = (side, tm, opp) => {
      const normal = goals.filter((g) => !g.ownGoal && g.teamId === tm._id);
      const own = goals.filter((g) => g.ownGoal && g.teamId === opp._id);
      const pl = rosterOpts(teamOf(tm._id), normal);
      const plOpp = rosterOpts(teamOf(opp._id), own);
      const extraCards = cards.filter((c) => c.teamId === tm._id);
      const cardPlayers = rosterOpts(teamOf(tm._id), extraCards);
      return `<h3 class="mt1">Marcatori ${esc(tm.name)}</h3><div data-rows="${side}" data-tid="${esc(tm._id)}">${normal.map((g) => scorerRow(pl, g.playerId, pl, g.assistPlayerId)).join("")}</div><button class="btn o s" type="button" data-act="add-row" data-side="${side}">＋ Aggiungi gol</button>
      <h3 class="mt1">Autogol a favore di ${esc(tm.name)}</h3><div data-rows-own="${side}" data-oid="${esc(opp._id)}">${own.map((g) => scorerRow(plOpp, g.playerId, [], "", true)).join("")}</div><button class="btn o s" type="button" data-act="add-row" data-side="${side}" data-own="1">＋ Aggiungi autogol</button>
      <h3 class="mt1">Cartellini ${esc(tm.name)}</h3><div data-cards="${side}" data-tid="${esc(tm._id)}">${extraCards.map((c) => cardRow(cardPlayers, c.playerId, c.type)).join("")}</div><button class="btn o s" type="button" data-act="add-card-row" data-side="${side}">＋ Aggiungi cartellino</button>`;
    };
    const f = `<div class="card"><form data-form="result" data-id="${esc(m.id)}" data-home="${esc(m.home._id)}" data-away="${esc(m.away._id)}">
      <h3 class="mt1">${esc(m.home.name)} – ${esc(m.away.name)}</h3>
      <label>Gol ${esc(m.home.name)}</label><input type="number" name="homeGoals" min="0" value="${m.homeGoals ?? ""}">
      <label>Gol ${esc(m.away.name)}</label><input type="number" name="awayGoals" min="0" value="${m.awayGoals ?? ""}">
      <label class="inl"><input type="checkbox" name="walkover"${m.walkover ? " checked" : ""}> Vittoria a tavolino</label>
      ${block("home", m.home, m.away)}${block("away", m.away, m.home)}
      <button class="btn" type="submit">${m.status === "finished" ? "Salva correzione" : "Conferma risultato"}</button></form></div>`;
    return sel + f;
  }
  const playerGroups = (teams, sel) => teams.map((t) => `<optgroup label="${esc(t.name)}">${t.players.map((p) => `<option value="${esc(p.id)}"${p.id === sel ? " selected" : ""}>#${p.shirtNumber} ${esc(p.firstName)} ${esc(p.lastName)} (${p.role})</option>`).join("")}</optgroup>`).join("");
  const pSelect = (teams, name, sel) => `<select name="${name}"><option value="">— scegli —</option>${playerGroups(teams, sel)}</select>`;
  const dayOpts = (days) => days.map((d) => [d.id, "Giornata " + d.number]);
  const IMG = 'type="file" accept="image/jpeg,image/png,image/webp"';
  function viewTop7(teams, days, s) {
    const t7 = s.t7, labels = slotLabels(t7.formation);
    const list = s.top7List.map((t) => `<div class="prow"><span>${esc(t.formation)} · ${t.published ? "pubblicata" : t.wasPublished ? "storico" : "bozza"} · ${esc(t.names.join(", "))}</span><span>${t.published ? `<button class="btn o s" type="button" data-act="top7-hide" data-id="${esc(t.id)}">Nascondi</button>` : `<button class="btn s" type="button" data-act="top7-show" data-id="${esc(t.id)}">Pubblica</button>`}<button class="btn o s" type="button" data-act="top7-del" data-id="${esc(t.id)}">Elimina</button></span></div>`).join("");
    const weekly = s.weeklyAll.map((x) => `<div class="prow">
  <span>
    ${x.kind === "man_of_week" ? "MOTW" : "TOTW"}
    ${x.matchdayNumber ? " · Giornata " + x.matchdayNumber : ""}
    · ${esc(x.kind === "man_of_week" ? (x.player ? x.player.firstName + " " + x.player.lastName : "?") : (x.team ? x.team.name : "?"))}
    ${x.homeVisible === false ? " · nascosto dalla Home" : ""}
  </span>
  <span>
    <button class="btn o s" type="button" data-act="weekly-home-toggle" data-visible="${x.homeVisible === false ? "1" : "0"}" data-id="${esc(x.id)}">${x.homeVisible === false ? "Mostra in Home" : "Nascondi dalla Home"}</button>
    <button class="btn o s" type="button" data-act="weekly-del" data-id="${esc(x.id)}">Elimina</button>
  </span>
</div>`).join("");
    return `<div class="card"><h3 class="mt1">Top 7 della settimana</h3><p class="mut">Il modulo che scegli è l’unico che vedono gli utenti.</p><form data-form="top7"><label>Modulo</label><select name="formation">${opts(FORMATIONS.map((f) => [f, f]), t7.formation)}</select>${labels.map((l, i) => `<label>${l}</label>${pSelect(teams, "p" + i, t7.picks[i])}`).join("")}<label>Giornata (facoltativa)</label><select name="matchdayId">${opts(dayOpts(days), t7.matchdayId, "— nessuna —")}</select><button class="btn" type="button" data-act="top7-save" data-publish="1">Salva e pubblica</button> <button class="btn o" type="button" data-act="top7-save" data-publish="0">Salva come bozza</button></form><h3 class="mt1" style="font-size:20px;margin-top:16px">Salvate</h3>${list || R.empty("Nessuna Top 7 salvata.")}</div>
      <div class="card"><h3 class="mt1">Man of the Week</h3><p class="mut">Resta in home 7 giorni, poi passa nella pagina Marcatori.</p><form data-form="motw"><label>Giornata</label><select name="matchdayId">${opts(dayOpts(days), "", "— scegli —")}</select><label>Giocatore</label>${pSelect(teams, "playerId", "")}<label>Motivazione</label><input type="text" name="reason"><label>Sfondo (foto) — nome, numero e squadra vanno sopra</label><input ${IMG} name="bg"><button class="btn" type="submit">Pubblica Man of the Week</button></form></div>
      <div class="card"><h3 class="mt1">Team of the Week</h3><p class="mut">Resta in home 7 giorni, poi passa nella pagina Top 7.</p><form data-form="totw"><label>Giornata</label><select name="matchdayId">${opts(dayOpts(days), "", "— scegli —")}</select><label>Squadra</label><select name="teamId">${opts(teams.map((t) => [t._id, t.name]), "", "— scegli —")}</select><label>Motivazione</label><input type="text" name="reason"><label>Sfondo (facoltativo)</label><input ${IMG} name="bg"><button class="btn" type="submit">Pubblica Team of the Week</button></form></div>
      <div class="card"><h3 class="mt1">Man e Team of the Week pubblicati</h3>${weekly || R.empty("Nessuno pubblicato.")}</div>`;
  }
  function viewAwards(teams, s) {
    const list = s.awardsList.map((x) => `<div class="prow"><span>${esc(x.title)} · ${esc(x.player)}${x.published ? "" : " (non pubblicato)"}</span><button class="btn o s" type="button" data-act="award-del" data-id="${esc(x.id)}">Elimina</button></div>`).join("");
    return `<div class="card"><h3 class="mt1">Premi finali</h3><p class="mut">Stato: ${s.unlocked ? "visibili a tutti" : "bloccati (il pubblico vede il lucchetto)"}</p><button class="btn${s.unlocked ? " o" : ""}" type="button" data-act="awards-toggle" data-unlock="${s.unlocked ? "0" : "1"}">${s.unlocked ? "Blocca di nuovo" : "Sblocca la sezione"}</button></div>
      <div class="card"><h3 class="mt1">Assegna un premio</h3><form data-form="award"><label>Tipo</label><select name="kind">${opts(Object.entries(AWARD_KINDS), "mvp")}</select><label>Titolo (se vuoto: il nome del tipo)</label><input type="text" name="title"><label>Giocatore</label>${pSelect(teams, "playerId", "")}<label>Motivazione</label><input type="text" name="reason"><label>Foto di sfondo</label><input ${IMG} name="img"><label class="inl"><input type="checkbox" name="published" checked> Pubblica</label><button class="btn" type="submit">Salva premio</button></form></div>
      <div class="card"><h3 class="mt1">Assegnati</h3>${list || R.empty("Nessun premio assegnato.")}</div>`;
  }
  function viewTransfers(teams, s) {
    const list = s.transfersList.map((t) => `<div class="prow"><span>${esc(t.date)} · ${esc(t.player)}: ${esc(t.from)} → ${esc(t.to)}${t.note ? " · " + esc(t.note) : ""}</span></div>`).join("");
    return `<div class="card"><h3 class="mt1">Nuovo trasferimento</h3><form data-form="transfer"><label>Giocatore</label>${pSelect(teams, "playerId", "")}<label>Nuova squadra</label><select name="toTeamId">${opts(teams.map((t) => [t._id, t.name]), "", "— scegli —")}</select><label>Data</label><input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"><label>Nuovo numero di maglia (se serve)</label><input type="number" name="newNumber" min="1" max="99"><label>Nota</label><input type="text" name="note"><p class="mut">Le statistiche restano con la squadra con cui sono state ottenute. Se il numero è già occupato nella nuova squadra, scegline un altro.</p><button class="btn" type="submit">Conferma trasferimento</button></form></div><div class="card"><h3 class="mt1">Storico</h3>${list || R.empty("Nessun trasferimento registrato.")}</div>`;
  }
  function newsForm(n) {
    const btns = n ? `<button class="btn" type="button" data-act="news-save" data-publish="keep">Salva modifiche</button>` : `<button class="btn" type="button" data-act="news-save" data-publish="1">Salva e pubblica</button> <button class="btn o" type="button" data-act="news-save" data-publish="0">Salva come bozza</button>`;
    return `<form data-form="news" ${n ? `data-id="${esc(n.id)}"` : ""}><label>Titolo</label><input type="text" name="title" value="${esc(n && n.title)}"><label>Sottotitolo / didascalia</label><input type="text" name="subtitle" value="${esc(n && n.subtitle)}"><label>Categoria</label><select name="category">${opts(NEWS_CATS.map((c) => [c, c]), n && n.category)}</select><label>Testo dell’articolo</label><textarea name="body" rows="8">${esc(n && n.body)}</textarea><label>Foto di sfondo (titolo e categoria vanno sopra)</label><input ${IMG} name="bg">${btns}</form>`;
  }
  function viewNews(s) {
  const label = { draft: "bozza", published: "pubblicata", hidden: "nascosta" };

  const list = s.newsList.map((n) => `<details class="row">
    <summary>${esc(n.title)}<span class="acts">${label[n.status]} ▾</span></summary>
    ${newsForm(n)}
    <div class="prow">
      <span>Stato: ${label[n.status]}${n.status === "published" && n.homeVisible === false ? " · nascosta dalla Home" : ""}</span>
      <span>
        ${n.status === "published"
          ? `<button class="btn o s" type="button" data-act="news-home-toggle" data-visible="${n.homeVisible === false ? "1" : "0"}" data-id="${esc(n.id)}">${n.homeVisible === false ? "Mostra in Home" : "Nascondi dalla Home"}</button>
             <button class="btn o s" type="button" data-act="news-hide" data-id="${esc(n.id)}">Nascondi ovunque</button>`
          : `<button class="btn s" type="button" data-act="news-pub" data-id="${esc(n.id)}">Pubblica</button>`
        }
        <button class="btn o s" type="button" data-act="news-del" data-id="${esc(n.id)}">Elimina</button>
      </span>
    </div>
  </details>`).join("");

  return `<div class="card">
    <h3 class="mt1">Nuova news</h3>
    <p class="mut">In home le news restano circa 3 giorni dalla pubblicazione; restano sempre nella pagina News.</p>
    ${newsForm(null)}
  </div>
  <div class="card">
    <h3 class="mt1">News</h3>
    ${list || R.empty("Nessuna news ancora.")}
  </div>`;
}
  function viewMatchday(days, s) {
    const all = days.flatMap((d) => d.matches.map((m) => [m.id, `G${d.number} · ${m.home.name} – ${m.away.name}`]));
    if (!all.length) return `<div class="card">${R.empty("Prima crea giornate e partite.")}</div>`;
    const cur = s.homeMd ? `${esc(s.homeMd.home.name)} – ${esc(s.homeMd.away.name)}` : "nessuno";
    return `<div class="card"><h3 class="mt1">Match Day in home</h3><p class="mut">In home c’è un solo Match Day: pubblicarne uno nuovo toglie il precedente. Ora: <b>${cur}</b></p><form data-form="matchday"><label>Partita</label><select name="matchId">${opts(all, s.homeMd ? s.homeMd.match._id : "", "— scegli —")}</select><label>Foto di sfondo (green screen): loghi, nomi, risultato e orario vanno sopra</label><input ${IMG} name="bg"><button class="btn" type="submit">Salva sfondo e pubblica in home</button> <button class="btn o" type="button" data-act="md-nobg">Rimuovi sfondo</button> <button class="btn o" type="button" data-act="md-clear">Togli dalla home</button></form></div>`;
  }
  function viewRules(s) {
    const reg = s.regulation;
    return `<div class="card"><h3 class="mt1">Regolamento (PDF)</h3>${reg ? `<p><a href="${esc(reg.url)}" target="_blank" rel="noopener">${esc(reg.name)}</a></p><button class="btn o s" type="button" data-act="rules-del">Rimuovi</button>` : R.empty("Nessun regolamento caricato.")}<form data-form="rules"><label>Aggiungi o sostituisci (solo PDF, massimo 10 MB)</label><input type="file" name="pdf" accept="application/pdf"><button class="btn" type="submit">＋ Pubblica regolamento</button></form></div>`;
  }
  function viewEdition(s) {
    const act = s.editions.find((e) => e.status === "active");
    return `<div class="card"><h3 class="mt1">Torneo attuale</h3><p class="mut">${act ? esc(act.name) + " · in corso" : "Nessun torneo attivo"}</p>${act ? `<button class="btn o" type="button" data-act="edition-close">Chiudi torneo</button>` : ""}</div><div class="card"><h3 class="mt1">Nuovo torneo</h3><form data-form="edition-new"><label>Nome</label><input type="text" name="name" placeholder="Poggio Winter Cup 2027"><label>Anno</label><input type="number" name="year" value="${new Date().getFullYear()}"><label>Sede di gioco</label><input type="text" name="venue"><p class="mut">Crea un nuovo torneo vuoto e archivia quello attuale: resta consultabile in “Altre edizioni”.</p><button class="btn" type="submit">Crea nuovo torneo e archivia il vecchio</button></form></div><div class="card"><h3 class="mt1">Logo del sito</h3><form data-form="logo"><label>Nuovo logo (meglio PNG con sfondo trasparente)</label><input ${IMG} name="logo"><button class="btn" type="submit">Salva logo</button> <button class="btn o" type="button" data-act="logo-reset">Ripristina originale</button></form></div>`;
  }
  function viewBracket(teams, s) {
    const tOpts = teams.map((t) => [t._id, t.name]), titles = { "semi:1": "Semifinale 1 (1ª – 4ª)", "semi:2": "Semifinale 2 (2ª – 3ª)", "final:1": "Finale" };
    const card = (key) => {
      const [round, pos] = key.split(":"), r = s.ko.find((x) => x.round === round && String(x.position) === pos) || { round, position: Number(pos), legs: [] };
      const leg = (i, label) => `<label>${label}: gol squadra A – gol squadra B</label><div class="scorer"><input type="number" min="0" name="l${i}a" value="${r.legs[i] ? r.legs[i].scoreA : ""}"><input type="number" min="0" name="l${i}b" value="${r.legs[i] ? r.legs[i].scoreB : ""}"></div>`;
      return `<div class="card"><h3 class="mt1">${titles[key]}</h3><form data-form="ko" data-round="${round}" data-pos="${pos}"><label>Squadra A</label><select name="teamAId">${opts(tOpts, r.teamAId, "— scegli —")}</select><label>Squadra B</label><select name="teamBId">${opts(tOpts, r.teamBId, "— scegli —")}</select>${leg(0, round === "semi" ? "Andata" : "Partita")}${round === "semi" ? leg(1, "Ritorno") : ""}<label class="inl"><input type="checkbox" name="extraTime"${r.extraTime ? " checked" : ""}> Supplementari</label><label>Rigori (facoltativi): squadra A – squadra B</label><div class="scorer"><input type="number" min="0" name="pensA" value="${r.pensA ?? ""}"><input type="number" min="0" name="pensB" value="${r.pensB ?? ""}"></div><button class="btn" type="submit">Salva</button></form></div>`;
    };
    return `<p class="mut" style="margin:0 0 10px">Semifinali andata e ritorno; in parità passa la meglio classificata del girone, salvo rigori inseriti. Vince chi ha più gol in totale.</p>${["semi:1", "semi:2", "final:1"].map(card).join("")}`;
  }
  const soon = (name) => `<div class="card"><h3 class="mt1">${esc(name)}</h3><p class="mut">Sezione in arrivo.</p></div>`;

  // ---------- collegamento al DOM e a Convex ----------
  function mount(client) {
    const app = document.getElementById("adm-app"), toast = document.getElementById("adm-toast");
    const st = { sec: "dash", teamId: null, matchId: null, detail: null, teams: [], days: [], t7: { formation: "2-3-1", picks: ["", "", "", "", "", "", ""], matchdayId: "" }, top7List: [], weeklyAll: [], awardsList: [], unlocked: false, newsList: [], transfersList: [], homeMd: null, regulation: null, editions: [], ko: [] };
    const once = (fn, args) => new Promise((res, rej) => { let stop; stop = client.onUpdate(fn, args, (v) => { res(v); setTimeout(() => stop && stop(), 0); }, rej); });
    const detail = (e) => String((e && e.message) || e).replace(/\[CONVEX[^\]]*\]\s*/g, "").replace(/^.*?Uncaught Error:\s*/, "").split(/\s+at\s/)[0].slice(0, 200);
    let timer;
    const say = (text, ok) => { toast.textContent = text; toast.style.color = ok ? "#7be0a8" : "#ff8fa3"; clearTimeout(timer); timer = setTimeout(() => (toast.textContent = ""), 7000); };
    const busy = () => app.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    let pending = false;
    function render(force) {
      if (!force && busy()) { pending = true; return; }   // gli aggiornamenti in sottofondo non cancellano un modulo mentre ci scrivi; le tue azioni (cambio sezione, squadra, partita) ridisegnano sempre
      pending = false;
      const body = { dash: () => viewDash(st.teams, st.days), teams: () => viewTeams(st.teams), players: () => viewPlayers(st.teams, st.teamId), days: () => viewDays(st.days, st.teams), results: () => viewResults(st.days, st.teams, st.matchId, st.detail), top7: () => viewTop7(st.teams, st.days, st), awards: () => viewAwards(st.teams, st), transfers: () => viewTransfers(st.teams, st), news: () => viewNews(st), matchday: () => viewMatchday(st.days, st), rules: () => viewRules(st), edition: () => viewEdition(st), bracket: () => viewBracket(st.teams, st) }[st.sec];
      app.innerHTML = `<div class="adm">${sideNav(st.sec)}<div class="apanel">${body ? body() : soon((SECTIONS.find((s) => s[0] === st.sec) || [])[1])}</div></div>`;
    }
    // Dettaglio della partita scelta: sottoscrizione che resta attiva, cosi' dopo il salvataggio i marcatori mostrati sono sempre quelli veri.
    let stopMatch = null;
    function watchMatch(id) {
      if (stopMatch) { stopMatch(); stopMatch = null; }
      st.detail = null;
      if (!id) return;
      let first = true;
      stopMatch = client.onUpdate("public:matchDetail", { matchId: id }, (d) => { st.detail = d; render(first); first = false; }, (e) => say("Marcatori non caricati: " + detail(e), false));
    }
    client.onUpdate("public:teams", {}, (t) => { st.teams = t; render(); }, (e) => say("Dati non caricati: " + detail(e), false));
    client.onUpdate("public:calendar", {}, (d) => { st.days = d; render(); }, () => {});
    client.onUpdate("admin:listTop7", {}, (l) => { st.top7List = l; render(); }, () => {});
    client.onUpdate("admin:listFinalAwards", {}, (l) => { st.awardsList = l; render(); }, () => {});
    client.onUpdate("public:weekly", { since: 0 }, (w) => { st.weeklyAll = w.current; render(); }, () => {});
    client.onUpdate("public:finalAwards", {}, (d) => { st.unlocked = d.unlocked; render(); }, () => {});
    client.onUpdate("admin:listNews", {}, (l) => { st.newsList = l; render(); }, () => {});
    client.onUpdate("admin:listTransfers", {}, (l) => { st.transfersList = l; render(); }, () => {});
    client.onUpdate("public:homeMatchDay", {}, (d) => { st.homeMd = d; render(); }, () => {});
    client.onUpdate("public:regulation", {}, (r) => { st.regulation = r; render(); }, () => {});
    client.onUpdate("public:editions", {}, (l) => { st.editions = l; render(); }, () => {});
    client.onUpdate("public:knockout", {}, (l) => { st.ko = l; render(); }, () => {});
    app.addEventListener("focusout", () => setTimeout(() => { if (pending) render(); }, 300));

    async function upload(file, kind) {
      if (!file || !file.size) return undefined;
      const pdf = kind === "pdf";
      if (pdf ? file.type !== "application/pdf" : !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(pdf ? "Il regolamento deve essere un file PDF" : "Immagine non valida: usa JPG, PNG o WEBP");
      if (file.size > (pdf ? 10 : 5) * 1024 * 1024) throw new Error(pdf ? "PDF troppo grande (massimo 10 MB)" : "Immagine troppo grande (massimo 5 MB)");
      const url = await client.mutation("files:generateUploadUrl", {});
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      if (!r.ok) throw new Error("Caricamento non riuscito");
      return (await r.json()).storageId;
    }
    const act = async (fn) => { try { await fn(); } catch (e) { say(detail(e), false); } };
    app.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-sec]"); if (nav) { st.sec = nav.dataset.sec; render(true); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === "add-row") {
        const own = b.dataset.own === "1", side = b.dataset.side;
        const box = app.querySelector(own ? `[data-rows-own="${side}"]` : `[data-rows="${side}"]`);
        const tid = own ? box.dataset.oid : box.dataset.tid;
        const team = st.teams.find((t) => t._id === tid) || { players: [] };
        const players = rosterOpts(team);
        box.insertAdjacentHTML("beforeend", scorerRow(players, "", players, "", own));
        return;
      }
      if (b.dataset.act === "del-row") { b.closest(".scorer").remove(); return; }
      if (b.dataset.act === "add-card-row") {
        const side = b.dataset.side, box = app.querySelector(`[data-cards="${side}"]`);
        const team = st.teams.find((t) => t._id === box.dataset.tid) || { players: [] };
        box.insertAdjacentHTML("beforeend", cardRow(rosterOpts(team), "", "yellow"));
        return;
      }
      if (b.dataset.act === "del-card-row") { b.closest(".card-event").remove(); return; }
      if (b.dataset.act === "day-del") act(async () => { if (!confirm("Eliminare la giornata?")) return; await client.mutation("matches:deleteMatchday", { matchdayId: id }); say("Giornata eliminata.", true); });
      if (b.dataset.act === "match-del") act(async () => { if (!confirm("Eliminare la partita? Se era già giocata, classifica e statistiche si aggiornano.")) return; await client.mutation("matches:deleteMatch", { matchId: id }); say("Partita eliminata.", true); });
      if (b.dataset.act === "top7-save") act(async () => { const v = Object.fromEntries(new FormData(b.closest("form")).entries()), pub = b.dataset.publish === "1"; await client.mutation("content:saveTop7", top7Args(v, pub)); say(pub ? "Top 7 pubblicata." : "Bozza salvata.", true); });
      if (b.dataset.act === "top7-hide" || b.dataset.act === "top7-show") act(async () => { await client.mutation("content:setTop7Published", { id, published: b.dataset.act === "top7-show" }); say(b.dataset.act === "top7-show" ? "Top 7 pubblicata." : "Top 7 nascosta.", true); });
      if (b.dataset.act === "top7-del") act(async () => { if (!confirm("Eliminare questa Top 7?")) return; await client.mutation("content:deleteTop7", { id }); say("Top 7 eliminata.", true); });
      if (b.dataset.act === "weekly-home-toggle") act(async () => {
  const visible = b.dataset.visible === "1";
  await client.mutation("content:setWeeklyAwardHomeVisible", { id, visible });
  say(visible ? "Premio nuovamente visibile in Home." : "Premio nascosto dalla Home.", true);
});
      if (b.dataset.act === "weekly-del") act(async () => { if (!confirm("Eliminare questo riconoscimento?")) return; await client.mutation("content:deleteWeeklyAward", { id }); say("Eliminato.", true); });
      if (b.dataset.act === "award-del") act(async () => { if (!confirm("Eliminare il premio?")) return; await client.mutation("content:deleteFinalAward", { id }); say("Premio eliminato.", true); });
      if (b.dataset.act === "awards-toggle") act(async () => { const on = b.dataset.unlock === "1"; if (on && !confirm("Sbloccando, i premi pubblicati diventano visibili a tutti. Continuare?")) return; await client.mutation("content:setAwardsUnlocked", { unlocked: on }); say(on ? "Premi sbloccati." : "Premi bloccati.", true); });
      if (b.dataset.act === "news-save") act(async () => {
        const f = b.closest("form"), v = Object.fromEntries(new FormData(f).entries()), pub = b.dataset.publish, bgId = await upload(f.elements.bg.files[0]);
        const nid = await client.mutation("content:saveNews", newsArgs(v, f.dataset.id, bgId));
        if (pub === "1") await client.mutation("content:setNewsStatus", { id: nid, status: "published" });
        say(pub === "1" ? "News pubblicata." : pub === "0" ? "Bozza salvata." : "Modifiche salvate.", true);
        if (!f.dataset.id) f.reset();
      });
      if (b.dataset.act === "news-home-toggle") act(async () => {
  const visible = b.dataset.visible === "1";
  await client.mutation("content:setNewsHomeVisible", { id, visible });
  say(visible ? "News nuovamente visibile in Home." : "News nascosta dalla Home.", true);
});
      if (b.dataset.act === "news-pub" || b.dataset.act === "news-hide") act(async () => { await client.mutation("content:setNewsStatus", { id, status: b.dataset.act === "news-pub" ? "published" : "hidden" }); say(b.dataset.act === "news-pub" ? "News pubblicata." : "News nascosta.", true); });
      if (b.dataset.act === "news-del") act(async () => { if (!confirm("Eliminare la news?")) return; await client.mutation("content:deleteNews", { id }); say("News eliminata.", true); });
      if (b.dataset.act === "md-nobg") act(async () => { const mid = b.closest("form").elements.matchId.value; if (!mid) throw new Error("Scegli la partita"); await client.mutation("matches:setMatchBackground", { matchId: mid }); say("Sfondo rimosso.", true); });
      if (b.dataset.act === "md-clear") act(async () => { await client.mutation("matches:clearHomeMatchDay", {}); say("Match Day tolto dalla home.", true); });
      if (b.dataset.act === "rules-del") act(async () => { if (!confirm("Rimuovere il regolamento?")) return; await client.mutation("site:setRegulation", {}); say("Regolamento rimosso.", true); });
      if (b.dataset.act === "edition-close") act(async () => { if (!confirm("Chiudere il torneo? Passa nell’archivio e il sito resta senza torneo attivo finché non ne crei uno nuovo.")) return; await client.mutation("admin:closeTournament", {}); say("Torneo chiuso e archiviato.", true); });
      if (b.dataset.act === "logo-reset") act(async () => { await client.mutation("site:setSiteLogo", {}); say("Logo originale ripristinato.", true); });
      if (b.dataset.act === "team-del") act(async () => { if (!confirm("Eliminare la squadra? Se ha giocatori o partite verrà archiviata (lo storico resta).")) return; say("Squadra " + (await client.mutation("teams:deleteTeam", { teamId: id })) + ".", true); });
      if (b.dataset.act === "player-del") act(async () => { if (!confirm("Eliminare il giocatore? Se ha gol o trasferimenti verrà archiviato (lo storico resta).")) return; say("Giocatore " + (await client.mutation("players:deletePlayer", { playerId: id })) + ".", true); });
      if (b.dataset.act === "player-retire") act(async () => { if (!confirm("Ritirare il giocatore? Resta nello storico ma non è più selezionabile.")) return; await client.mutation("players:retirePlayer", { playerId: id }); say("Giocatore ritirato.", true); });
    });
    app.addEventListener("change", (e) => {
      if (e.target.matches("[data-team-select]")) { st.teamId = e.target.value; render(true); }
      const tf = e.target.closest ? e.target.closest('form[data-form="top7"]') : null;
      if (tf) { const n = e.target.name; if (n === "formation") { st.t7.formation = e.target.value; render(true); } else if (/^p[0-6]$/.test(n)) st.t7.picks[Number(n[1])] = e.target.value; else if (n === "matchdayId") st.t7.matchdayId = e.target.value; }
      if (e.target.matches("[data-match-select]")) { st.matchId = e.target.value || null; watchMatch(st.matchId); render(true); }
    });
    app.addEventListener("submit", (e) => {
      const f = e.target.closest("form[data-form]"); if (!f) return;
      e.preventDefault();
      const kind = f.dataset.form, v = Object.fromEntries(new FormData(f).entries()), btn = f.querySelector("button[type=submit]");
      act(async () => {
        btn.disabled = true;
        try {
          if (kind === "day-new") { await client.mutation("matches:createMatchday", { number: Number(v.number), ...(v.playDate ? { playDate: v.playDate } : {}) }); f.reset(); }
          else if (kind === "day-edit") await client.mutation("matches:updateMatchday", { matchdayId: f.dataset.id, playDate: v.playDate || undefined });
          else if (kind === "match-new") {
            if (!v.homeTeamId || !v.awayTeamId) throw new Error("Scegli le due squadre");
            await client.mutation("matches:createMatch", { matchdayId: f.dataset.day, homeTeamId: v.homeTeamId, awayTeamId: v.awayTeamId, ...(v.kickoff ? { kickoff: new Date(v.kickoff).getTime() } : {}) }); f.reset();
          } else if (kind === "result") {
            const blocks = ["home", "away"].map((side) => { const box = f.querySelector(`[data-rows="${side}"]`), ob = f.querySelector(`[data-rows-own="${side}"]`); return { teamId: box.dataset.tid, oppId: ob.dataset.oid, rows: [...box.querySelectorAll(".scorer")], ownRows: [...ob.querySelectorAll(".scorer")] }; });
            const goals = f.elements.walkover.checked ? [] : goalsFromRows(blocks);
            const cards = cardsFromRows(f);
            const args = resultArgs({ ...v, walkover: f.elements.walkover.checked }, goals, cards, f.dataset.home);
            await client.mutation("admin:closeMatch", { matchId: f.dataset.id, ...args });
          } else if (kind === "transfer") {
            await client.mutation("admin:transferPlayer", transferArgs(v)); f.reset();
          } else if (kind === "matchday") {
            if (!v.matchId) throw new Error("Scegli la partita");
            const sid = await upload(f.elements.bg.files[0]);
            if (sid) await client.mutation("matches:setMatchBackground", { matchId: v.matchId, storageId: sid });
            await client.mutation("matches:setHomeMatchDay", { matchId: v.matchId });
          } else if (kind === "rules") {
            const file = f.elements.pdf.files[0];
            if (!file) throw new Error("Scegli il file PDF");
            const sid = await upload(file, "pdf");
            await client.mutation("site:setRegulation", { storageId: sid, fileName: file.name }); f.reset();
          } else if (kind === "edition-new") {
            const a = editionArgs(v);
            if (!confirm("Creare il nuovo torneo? Quello attuale verrà archiviato.")) return;
            await client.mutation("admin:createEdition", a); f.reset();
          } else if (kind === "logo") {
            const sid = await upload(f.elements.logo.files[0]);
            if (!sid) throw new Error("Scegli il file del logo");
            await client.mutation("site:setSiteLogo", { storageId: sid });
          } else if (kind === "ko") {
            await client.mutation("content:setKnockout", { round: f.dataset.round, position: Number(f.dataset.pos), ...koArgs({ ...v, extraTime: f.elements.extraTime.checked }, f.dataset.round) });
          } else if (kind === "motw" || kind === "totw") {
            if (!v.matchdayId) throw new Error("Scegli la giornata");
            const man = kind === "motw";
            if (man ? !v.playerId : !v.teamId) throw new Error(man ? "Scegli il giocatore" : "Scegli la squadra");
            const bgId = await upload(f.elements.bg.files[0]);
            await client.mutation("content:setWeeklyAward", { matchdayId: v.matchdayId, kind: man ? "man_of_week" : "team_of_week", ...(man ? { playerId: v.playerId } : { teamId: v.teamId }), ...(String(v.reason || "").trim() ? { reason: String(v.reason).trim() } : {}), ...(bgId ? { backgroundId: bgId } : {}) });
            f.reset();
          } else if (kind === "award") {
            const imgId = await upload(f.elements.img.files[0]);
            await client.mutation("content:assignFinalAward", awardArgs({ ...v, published: f.elements.published.checked }, imgId));
            f.reset();
          } else if (kind.startsWith("team")) {
            const a = teamArgs(v, kind === "team-new"), logoId = await upload(f.elements.logo.files[0]); if (logoId) a.logoId = logoId;
            if (kind === "team-new") { await client.mutation("teams:createTeam", a); f.reset(); } else await client.mutation("teams:updateTeam", { teamId: f.dataset.id, ...a });
          } else {
            const a = playerArgs(v), photoId = await upload(f.elements.photo.files[0]); if (photoId) a.photoId = photoId;
            if (kind === "player-new") { await client.mutation("players:createPlayer", { teamId: st.teamId || st.teams[0]._id, ...a }); f.reset(); } else await client.mutation("players:updatePlayer", { playerId: f.dataset.id, ...a });
          }
          say("Salvato.", true);
        } finally { btn.disabled = false; }
      });
    });
    render();
  }
  root.PWC_ADMIN = { transferArgs, newsArgs, editionArgs, koArgs, viewTransfers, viewNews, viewMatchday, viewRules, viewEdition, viewBracket, slotLabels, top7Args, awardArgs, viewTop7, viewAwards, goalsFromRows, resultArgs, viewDays, viewResults, scorerRow, teamArgs, playerArgs, viewDash, viewTeams, viewPlayers, sideNav, mount, SECTIONS };
})(typeof window !== "undefined" ? window : globalThis);
