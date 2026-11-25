// Trasforma i dati di Convex in HTML con le STESSE classi dell'anteprima approvata. Funzioni pure, testate in tests/render.test.js.
(function (root) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const url = (u) => (/^https:\/\//.test(u || "") ? esc(u) : "");
  const color = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : d);
  const STAR = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "");
  const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");
  const empty = (txt) => `<p class="mut">${esc(txt)}</p>`;

  function crest(t, cls) {
    if (t.logoUrl) return `<span class="cr ${cls || ""}" style="background:#fff url(${url(t.logoUrl)}) center/cover"></span>`;
    return `<span class="cr ${cls || ""}" style="background:${color(t.colorPrimary, "#1f3df0")};color:${color(t.colorSecondary, "#ffffff")}">${esc(t.shortName)}</span>`;
  }
  const tn = (t, g) => `<span class="tn">${crest(t, "sm")}<span class="nm">${esc(t.name)}</span>${g !== "" && g != null ? `<b class="sg">${g}</b>` : ""}</span>`;
  function matchRow(m) {
    const done = m.status === "finished";
    return `<div class="mr${done ? " has" : ""}" data-match="${esc(m.id)}" role="button" tabindex="0" style="cursor:pointer">${tn(m.home, done ? m.homeGoals : "")}<b class="sc2">${done ? `${m.homeGoals} – ${m.awayGoals}` : "VS"}</b>${tn(m.away, done ? m.awayGoals : "")}</div>`;
  }
  const extra = (m) => {
    const bits = [m.kickoff ? `${fmtDate(m.kickoff)} · ${fmtTime(m.kickoff)}` : "", { live: "LIVE", postponed: "Rinviata", cancelled: "Annullata" }[m.status] || "", m.walkover ? "Vittoria a tavolino" : ""].filter(Boolean);
    return bits.length ? `<p class="mut" style="margin:0 0 8px;font-size:14px">${esc(bits.join(" · "))}</p>` : "";
  };

  function calendar(days) {
    if (!days.length) return empty("Il calendario non è ancora stato pubblicato.");
    return days.map((d) => `<div class="card"><span class="tag">Giornata ${d.number}</span>${d.playDate ? ` <small class="mut">${esc(fmtDate(d.playDate))}</small>` : ""}${d.matches.map((m) => matchRow(m) + extra(m)).join("") || empty("Partite da definire")}</div>`).join("");
  }
  // Home: ultimi 2 risultati e prossime 2 partite.
  function results(days) {
    const all = days.flatMap((d) => d.matches.map((m) => ({ ...m, day: d.number })));
    const done = all.filter((m) => m.status === "finished").sort((a, b) => (b.kickoff ?? 0) - (a.kickoff ?? 0)).slice(0, 2);
    const next = all.filter((m) => m.status === "scheduled" || m.status === "live").sort((a, b) => (a.kickoff ?? 9e15) - (b.kickoff ?? 9e15)).slice(0, 2);
    const card = (m, tag, w) => `<div class="card"><span class="tag${w ? " w" : ""}">${tag}</span>${matchRow(m)}<p class="mut">Giornata ${m.day}${m.kickoff ? " · " + esc(fmtDate(m.kickoff) + " " + fmtTime(m.kickoff)) : ""}</p></div>`;
    return done.map((m) => card(m, "Finita", false)).concat(next.map((m) => card(m, m.status === "live" ? "Live" : "Prossima", true))).join("");
  }
  function standingsRows(rows) {
    if (!rows.length) return '<tr><td colspan="10" class="mut">Nessuna squadra ancora.</td></tr>';
    return rows.map((r) => `<tr><td>${r.pos}</td><td><label class="tm" for="t-sq" style="display:flex;align-items:center;gap:8px">${crest(r, "sm")}${esc(r.name)}</label></td><td>${r.pg}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd > 0 ? "+" : ""}${r.gd}</td><td class="pts">${r.pts}</td></tr>`).join("");
  }
  function scorersRows(rows) {
    if (!rows.length) return '<tr><td colspan="5" class="mut">Ancora nessun gol.</td></tr>';
    return rows.map((r, i) => `<tr><td>${i + 1}</td><td style="text-align:left">${esc(r.firstName)} ${esc(r.lastName)}</td><td>${esc(r.teamName)}</td><td class="pts">${r.goals}</td><td>${r.motw}</td></tr>`).join("");
  }
  function teamStats(rows) {
    const played = rows.filter((r) => r.pg > 0);
    if (!played.length) return empty("Le statistiche compaiono dopo la prima partita.");
    const att = [...played].sort((a, b) => b.gf - a.gf)[0], dif = [...played].sort((a, b) => a.ga - b.ga)[0];
    const box = (l, r, v) => `<div class="card"><small class="mut">${l}</small><div class="big" style="font-size:26px">${esc(r.name)} · ${v}</div></div>`;
    return `<div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:12px">${box("Miglior attacco", att, att.gf)}${box("Miglior difesa", dif, dif.ga)}</div><div class="tw"><table><thead><tr><th>#</th><th>Squadra</th><th>GF</th><th>GS</th><th>DR</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><span class="tn">${crest(r, "sm")}${esc(r.name)}</span></td><td>${r.gf}</td><td>${r.ga}</td><td class="pts">${r.gd > 0 ? "+" : ""}${r.gd}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function teams(list) {
    if (!list.length) return empty("Le squadre non sono ancora state inserite.");
    const name = (t, id) => { const p = t.players.find((x) => x.id === id); return p ? `${esc(p.firstName)} ${esc(p.lastName)}` : "—"; };
    const tabs = `<div class="seg" data-tabs>${list.map((t, i) => `<label data-tab="${i}" class="${i === 0 ? "on" : ""}">${esc(t.name)}</label>`).join("")}</div>`;
    const panes = list.map((t, i) => `<div data-pane="${i}" class="${i === 0 ? "on" : ""}"><div class="th2">${crest(t, "sm")}<h2>${esc(t.name)}</h2></div><div class="staff"><span><small>Allenatore</small>${esc(t.coach || "—")}</span><span><small>Presidente</small>${esc(t.president || "—")}</span><span><small>Capitano</small>${name(t, t.captainId)}</span><span class="starbox"><small>Stella</small><i class="star">${STAR}</i> ${name(t, t.starId)}</span></div><div class="rl">${t.players.map((p) => `<div class="pw"><i class="pf"${p.photoUrl ? ` style="background-image:url(${url(p.photoUrl)})"` : ""}>${p.photoUrl ? "" : esc(p.firstName[0] || "")}</i><span class="pi"><b>#${p.shirtNumber} ${esc(p.firstName)} ${esc(p.lastName)}${p.id === t.captainId ? "<i class=cap>C</i>" : ""}${p.id === t.starId ? `<i class="star">${STAR}</i>` : ""}</b><small>${esc(p.strengths.join(", "))}</small></span><span class="rl2">${p.role}</span></div>`).join("") || empty("Rosa non ancora inserita.")}</div></div>`).join("");
    return tabs + `<div class="ros">${panes}</div>`;
  }
  const bg = (n) => `style="background-image:url(${url(n.backgroundUrl)})"`;
  function newsPost(n) {
    return `<div class="post np"><div class="pa im" ${bg(n)}></div><div class="top"><span class="tag" style="margin-right:auto">${esc(n.category)}</span><span class="tag fin">${esc(fmtDate(n.publishedAt))}</span></div><div class="ov low"><h3 class="mt1" style="font-size:clamp(26px,8vw,40px);margin:0">${esc(n.title)}</h3>${n.subtitle ? `<p class="when" style="margin:4px 0 8px">${esc(n.subtitle)}</p>` : ""}<label class="btn s" for="t-news">Leggi l’articolo</label></div></div>`;
  }
  function newsArticle(n) {
    const paras = String(n.body).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    return `<article class="card art">${n.backgroundUrl ? `<div class="im aimg" ${bg(n)}></div>` : ""}<div><span class="tag">${esc(n.category)}</span> <small class="mut">${esc(fmtDate(n.publishedAt))}</small></div><h3 class="mt1" style="font-size:clamp(28px,8vw,40px)">${esc(n.title)}</h3>${n.subtitle ? `<p class="mut lead">${esc(n.subtitle)}</p>` : ""}${paras}</article>`;
  }
  const regulation = (r) => r && url(r.url)
    ? `<div class="card" style="margin-top:14px;text-align:center"><h3 class="mt1">Regolamento ufficiale</h3><p class="mut">${esc(r.name || "Regolamento.pdf")}${r.updatedAt ? " · aggiornato il " + esc(fmtDate(r.updatedAt)) : ""}</p><a class="btn" href="${url(r.url)}" target="_blank" rel="noopener">Apri il PDF</a> <a class="btn o" href="${url(r.url)}" download>Scarica</a></div>`
    : '<div class="card" style="margin-top:14px;text-align:center"><h3 class="mt1">Il regolamento non è ancora disponibile</h3></div>';

  const STATUS = { scheduled: "Da giocare", live: "Live", finished: "Finita", postponed: "Rinviata", cancelled: "Annullata" };
  function matchDetail(d) {
    if (!d) return empty("Partita non trovata.");
    const m = d.match, done = m.status === "finished";
    const credited = (g) => (g.ownGoal ? (g.teamId === m.home._id ? m.away._id : m.home._id) : g.teamId);
    const list = (team) => {
      const byKey = new Map();
      for (const g of d.goals.filter((x) => credited(x) === team._id)) { const k = g.playerId + (g.ownGoal ? "o" : ""); byKey.set(k, { ...g, n: (byKey.get(k)?.n || 0) + 1 }); }
      const rows = [...byKey.values()].map((g) => `<div class="prow"><span>${esc(g.firstName)} ${esc(g.lastName)}${g.ownGoal ? " (autogol)" : ""}</span><b>${g.n > 1 ? "× " + g.n : "1"}</b></div>`).join("");
      return `<div class="card"><h3 class="mt1" style="display:flex;align-items:center;gap:8px">${crest(team, "sm")}${esc(team.name)}</h3>${rows || empty(done ? (m.walkover ? "Vittoria a tavolino" : "Nessun marcatore") : "—")}</div>`;
    };
    const info = [d.matchdayNumber ? "Giornata " + d.matchdayNumber : "", m.kickoff ? fmtDate(m.kickoff) + " · " + fmtTime(m.kickoff) : "", d.venue || ""].filter(Boolean).join(" · ");
    return `<div class="card" style="margin-top:14px"><span class="tag${done ? "" : " w"}">${STATUS[m.status] || ""}</span>${matchRow(m)}<p class="mut">${esc(info)}</p></div><div class="grid" style="margin-top:12px">${list(m.home)}${list(m.away)}</div>`;
  }

  // ---- Top 7, Man/Team of the Week, premi ----
  const LOCK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const fullName = (p) => `${esc(p.firstName)} ${esc(p.lastName)}`;
  const playerTitle = (p) => `#${p.shirtNumber} ${fullName(p)}`;
  // blocco unico "foto di sfondo + dati sopra", come Match Day e Man of the Week
  function poster(o) {
    const bgUrl = url(o.bgUrl), style = bgUrl ? `background-image:url(${bgUrl})` : "background-image:linear-gradient(135deg,#1f3df0,#050d3a)";
    return `<div class="post" style="aspect-ratio:3/4;margin-bottom:14px"><div class="pa im" style="${style}"></div><div class="top"><span class="tag" style="margin-right:auto">${esc(o.tag)}</span>${o.tag2 ? `<span class="tag fin">${esc(o.tag2)}</span>` : ""}</div><div class="ov low"><h3 class="mt1" style="font-size:clamp(30px,9vw,48px);margin:0">${o.title}</h3>${o.team ? `<div class="when" style="display:flex;justify-content:center;align-items:center;gap:8px;font-size:15px">${crest(o.team, "sm")}${esc(o.team.name)}</div>` : ""}${o.reason ? `<p class="when" style="margin:2px 0 0;font-size:14px">${esc(o.reason)}</p>` : ""}</div></div>`;
  }
  const motwPoster = (a) => poster({ tag: "Man of the Week", tag2: a.matchdayNumber ? "Giornata " + a.matchdayNumber : "", bgUrl: a.backgroundUrl || (a.player && a.player.photoUrl), title: playerTitle(a.player), team: a.player.team, reason: a.reason });
  const totwCard = (a) => `<div class="card" style="margin-bottom:12px"><span class="tag">Team of the Week</span>${a.matchdayNumber ? ` <small class="mut">Giornata ${a.matchdayNumber}</small>` : ""}<h3 class="mt1" style="display:flex;align-items:center;gap:10px">${crest(a.team, "sm")}${esc(a.team.name)}</h3>${a.reason ? `<p class="mut">${esc(a.reason)}</p>` : ""}</div>`;
  const motwSection = (cur) => cur.filter((a) => a.kind === "man_of_week" && a.player).map(motwPoster).join("") + cur.filter((a) => a.kind === "team_of_week" && a.team).map(totwCard).join("");
  function motwHistory(list) {
    const m = list.filter((a) => a.kind === "man_of_week" && a.player);
    if (!m.length) return "";
    return `<div class="sh" style="margin-top:22px"><h2>Man of the Week</h2><span></span></div>` + m.map((a) => `<div class="card" style="margin-bottom:10px"><span class="tag">${a.matchdayNumber ? "Giornata " + a.matchdayNumber : "Settimana"}</span><h3 class="mt1">${playerTitle(a.player)}${a.player.team ? " · " + esc(a.player.team.name) : ""}</h3>${a.reason ? `<p class="mut">${esc(a.reason)}</p>` : ""}</div>`).join("");
  }
  function pitch(t) {
    const rows = t.formation.split("-").map(Number), ps = [...t.players].sort((a, b) => a.slot - b.slot), ys = [66, 44, 21];
    const pl = (x, y, p) => `<div class="pl" style="left:${Math.round(x)}%;top:${y}%"${p && p.team ? ` title="${esc(p.team.name)}"` : ""}><i>${p ? p.shirtNumber : ""}</i>${p ? esc(p.lastName) : ""}</div>`;
    let out = pl(50, 88, ps[0]), k = 1;
    rows.forEach((n, ri) => { for (let j = 0; j < n; j++) out += pl(((j + 1) * 100) / (n + 1), ys[ri], ps[k++]); });
    return `<div class="pitch">${out}</div>`;
  }
  function top7Page(t, w) {
    const cur = t && t.current, hist = (t && t.history) || [], tw = ((w && w.history) || []).filter((a) => a.kind === "team_of_week" && a.team);
    if (!cur && !hist.length && !tw.length) return empty("La Top 7 della settimana non è ancora stata pubblicata.");
    let out = cur ? `<p class="mut">${cur.matchdayNumber ? "Giornata " + cur.matchdayNumber + " · " : ""}Modulo ${esc(cur.formation)}</p>${pitch(cur)}` : empty("La Top 7 di questa settimana non è ancora stata pubblicata.");
    if (hist.length || tw.length) out += `<div class="sh"><h2>Settimane precedenti</h2><span></span></div>` + hist.map((h) => `<details class="row"><summary>${h.matchdayNumber ? "Giornata " + h.matchdayNumber : "Settimana"}<span class="acts">Modulo ${esc(h.formation)} ▾</span></summary>${pitch(h)}</details>`).join("") + tw.map(totwCard).join("");
    return out;
  }
  const top7Mini = (cur) => (cur ? `${pitch(cur)}<p style="text-align:center"><label class="btn" for="t-top">Apri Top 7</label></p>` : "");
  function awardsPage(d) {
    if (!d || !d.unlocked) return `<div class="card lock big3"><div class="im i4 limg"></div><div class="lk2">${LOCK}<br>Sezione bloccata<br><small>Si sblocca a fine torneo</small></div></div>`;
    if (!d.awards.length) return empty("I premi non sono ancora stati assegnati.");
    return d.awards.map((a) => poster({ tag: a.title, bgUrl: a.imageUrl || (a.player && a.player.photoUrl), title: a.player ? playerTitle(a.player) : "", team: a.player && a.player.team, reason: a.reason })).join("");
  }

  // ---- Match Day in home, tabellone, edizioni passate ----
  const TH = '<thead><tr><th>#</th><th>Squadra</th><th>PG</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pt</th></tr></thead>';
  function matchDayPoster(d) {
    if (!d) return "";
    const m = d.match, done = m.status === "finished", bgUrl = url(d.backgroundUrl);
    const style = bgUrl ? `background-image:url(${bgUrl})` : "background-image:linear-gradient(135deg,#1f3df0,#050d3a)";
    const tm = (t) => `<span class="tm">${crest(t)}<b>${esc(t.name)}</b></span>`;
    const when = [m.kickoff ? `${fmtDate(m.kickoff)} · ore ${fmtTime(m.kickoff)}` : "", d.venue || ""].filter(Boolean).join(" · ");
    const state = { finished: "Finita", live: "Live", postponed: "Rinviata", cancelled: "Annullata" }[m.status];
    return `<div class="post" data-match="${esc(m._id)}" style="cursor:pointer"><div class="pa im" style="${style}"></div><div class="top"><span class="tag" style="margin-right:auto">${d.matchdayNumber ? "Giornata " + d.matchdayNumber : "Match Day"}</span>${state ? `<span class="tag fin">${state}</span>` : ""}</div><div class="ov"><div class="vs">${tm(d.home)}<div class="sc">${done ? `<small>VS</small>${m.homeGoals} – ${m.awayGoals}` : "VS"}</div>${tm(d.away)}</div>${when ? `<div class="when">${esc(when)}</div>` : ""}</div></div>`;
  }
  function koTie(r) {
    const row = (t, agg, win) => `<div class="${win ? "w" : ""}"><span>${t ? esc(t.name) : "—"}</span><b>${r.legs.length ? agg : "—"}</b></div>`;
    const info = r.legs.length ? `<p class="mut" style="margin:0;padding:8px 14px;font-size:13px">${esc(r.legs.map((l) => l.scoreA + "–" + l.scoreB).join(" · ") + (r.extraTime ? " · supplementari" : "") + (r.pensA != null && r.pensB != null ? ` · rigori ${r.pensA}–${r.pensB}` : ""))}</p>` : "";
    return `<div class="mt${r.round === "final" ? " final" : ""}">${row(r.teamA, r.aggregateA, r.winnerId && r.winnerId === r.teamAId)}${row(r.teamB, r.aggregateB, r.winnerId && r.winnerId === r.teamBId)}${info}</div>`;
  }
  function knockoutPage(rows) {
    if (!rows.some((r) => r.teamAId || r.teamBId)) return empty("Il tabellone sarà pubblicato a fine girone.");
    const semis = rows.filter((r) => r.round === "semi").sort((a, b) => a.position - b.position);
    return `<div class="br"><div><h3>Semifinali</h3>${semis.map(koTie).join("")}</div><div><h3>Finale</h3>${rows.filter((r) => r.round === "final").map(koTie).join("")}</div></div>`;
  }
  function archivePage(list) {
    if (!list.length) return empty("Non ci sono ancora edizioni passate.");
    const tabs = `<div class="seg" data-tabs>${list.map((e, i) => `<label data-tab="${i}" class="${i === 0 ? "on" : ""}">${esc(e.name)}</label>`).join("")}</div>`;
    const panes = list.map((e, i) => `<div data-pane="${i}" class="${i === 0 ? "on" : ""}">${e.champion ? `<div class="card"><span class="tag">Campione</span><h3 class="mt1" style="display:flex;align-items:center;gap:10px">${crest(e.champion, "sm")}${esc(e.champion.name)}</h3>${e.final ? `<p class="mut">Finale: ${esc(e.final.teamA.name)} ${e.final.a} – ${e.final.b} ${esc(e.final.teamB.name)}${e.final.pensA != null && e.final.pensB != null ? ` (rigori ${e.final.pensA}–${e.final.pensB})` : ""}</p>` : ""}</div>` : ""}${e.topScorers.length ? `<div class="card" style="margin-top:12px"><span class="tag">Capocannoniere</span>${e.topScorers.map((s) => `<div class="prow"><span>${esc(s.firstName)} ${esc(s.lastName)} · ${esc(s.teamName)}</span><b>${s.goals}</b></div>`).join("")}</div>` : ""}<div class="tw" style="margin-top:12px"><table>${TH}<tbody>${standingsRows(e.standings)}</tbody></table></div></div>`).join("");
    return tabs + `<div class="ros">${panes}</div>`;
  }

  root.PWC_RENDER = { matchDayPoster, knockoutPage, archivePage, motwSection, motwHistory, motwPoster, totwCard, pitch, top7Page, top7Mini, awardsPage, crestHtml: (t) => crest(t, "sm"), matchDetail, esc, calendar, results, standingsRows, scorersRows, teamStats, teams, newsPost, newsArticle, regulation, empty };
})(typeof window !== "undefined" ? window : globalThis);
