import { query } from "./_generated/server";
import { v } from "convex/values";
import { activeEdition } from "./lib";

async function withImages(ctx, news) {
  return await Promise.all(news.map(async (n) => ({ ...n, backgroundUrl: n.backgroundId ? await ctx.storage.getUrl(n.backgroundId) : null })));
}

async function resolveEdition(ctx, editionId) {
  return editionId ? await ctx.db.get(editionId) : await activeEdition(ctx);
}

// Spareggi del regolamento: 1) punti negli scontri diretti, 2) differenza reti negli scontri diretti, 3) differenza reti generale, 4) gol segnati.
// Gli scontri diretti si calcolano tra tutte le squadre a pari punti (mini-classifica).
function orderTable(rows, matches) {
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.pts)) groups.set(r.pts, []); groups.get(r.pts).push(r); }
  const out = [];
  for (const pts of [...groups.keys()].sort((a, b) => b - a)) {
    const g = groups.get(pts);
    if (g.length > 1) {
      const ids = new Set(g.map((r) => r.teamId));
      const h = new Map(g.map((r) => [r.teamId, { pts: 0, gd: 0 }]));
      for (const m of matches) {
        if (!ids.has(m.homeTeamId) || !ids.has(m.awayTeamId)) continue;
        const H = h.get(m.homeTeamId), A = h.get(m.awayTeamId);
        H.gd += m.homeGoals - m.awayGoals; A.gd += m.awayGoals - m.homeGoals;
        if (m.homeGoals > m.awayGoals) H.pts += 3; else if (m.homeGoals < m.awayGoals) A.pts += 3; else { H.pts++; A.pts++; }
      }
      g.sort((a, b) => h.get(b.teamId).pts - h.get(a.teamId).pts || h.get(b.teamId).gd - h.get(a.teamId).gd || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
    }
    out.push(...g);
  }
  return out.map((r, i) => ({ pos: i + 1, ...r }));
}

async function buildStandings(ctx, ed) {
  const teams = (await ctx.db.query("teams").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((t) => !t.archived);
  const matches = (await ctx.db.query("matches").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((m) => m.status === "finished");
  const rows = new Map(teams.map((t) => [t._id, { teamId: t._id, slug: t.slug, name: t.name, shortName: t.shortName, logoId: t.logoId, logoUrl: null, pg: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 }]));
  const add = (id, gf, ga) => { const r = rows.get(id); if (!r) return; r.pg++; r.gf += gf; r.ga += ga; if (gf > ga) r.w++; else if (gf === ga) r.d++; else r.l++; };
  for (const m of matches) { add(m.homeTeamId, m.homeGoals, m.awayGoals); add(m.awayTeamId, m.awayGoals, m.homeGoals); }
  for (const t of teams) if (t.logoId) rows.get(t._id).logoUrl = await ctx.storage.getUrl(t.logoId);
  return orderTable([...rows.values()].map((r) => ({ ...r, gd: r.gf - r.ga, pts: r.w * 3 + r.d })), matches);
}

// Classifica: calcolata sempre dai risultati (nessun contatore da tenere allineato).
export const standings = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => {
    const ed = await resolveEdition(ctx, editionId);
    return ed ? await buildStandings(ctx, ed) : [];
  },
});

// Marcatori + Man of the Week ricevuti (statistica del torneo in corso).
async function buildScorers(ctx, ed) {
  const finished = new Set((await ctx.db.query("matches").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((m) => m.status === "finished").map((m) => m._id));
  const goals = (await ctx.db.query("matchGoals").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((g) => finished.has(g.matchId) && !g.ownGoal);
  const motw = (await ctx.db.query("weeklyAwards").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((a) => a.kind === "man_of_week" && a.published);
  const byPlayer = new Map();
  for (const g of goals) { const k = g.playerId + "|" + g.teamId; byPlayer.set(k, { playerId: g.playerId, teamId: g.teamId, goals: (byPlayer.get(k)?.goals ?? 0) + 1 }); }
  const out = [];
  for (const r of byPlayer.values()) {
    const p = await ctx.db.get(r.playerId); const t = await ctx.db.get(r.teamId);
    out.push({ ...r, firstName: p.firstName, lastName: p.lastName, teamName: t.name, motw: motw.filter((a) => a.playerId === r.playerId).length });
  }
  return out.sort((a, b) => b.goals - a.goals || a.lastName.localeCompare(b.lastName));
}
export const scorers = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => { const ed = await resolveEdition(ctx, editionId); return ed ? await buildScorers(ctx, ed) : []; },
});

// News in home: solo quelle pubblicate negli ultimi 3 giorni (il client passa "since" = adesso - 3 giorni, arrotondato all'ora).
export const homeNews = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const ed = await activeEdition(ctx);
    if (!ed) return [];
    const rows = await ctx.db.query("news").withIndex("by_edition_status", (q) => q.eq("editionId", ed._id).eq("status", "published")).collect();
    return await withImages(ctx, rows.filter((n) => !n.deleted && n.homeVisible !== false && n.publishedAt !== undefined && n.publishedAt >= since).sort((a, b) => b.publishedAt - a.publishedAt));
  },
});

// Pagina News: tutte le news pubblicate, anche vecchie.
export const allNews = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => {
    const ed = await resolveEdition(ctx, editionId);
    if (!ed) return [];
    const rows = await ctx.db.query("news").withIndex("by_edition_status", (q) => q.eq("editionId", ed._id).eq("status", "published")).collect();
    return await withImages(ctx, rows.filter((n) => !n.deleted).sort((a, b) => b.publishedAt - a.publishedAt));
  },
});

export const editions = query({ args: {}, handler: async (ctx) => (await ctx.db.query("editions").collect()).sort((a, b) => b.year - a.year) });

export const homeMatchDay = query({
  args: {},
  handler: async (ctx) => {
    const ed = await activeEdition(ctx);
    if (!ed?.homeMatchId) return null;
    const m = await ctx.db.get(ed.homeMatchId);
    if (!m) return null;
    const [home, away, md] = await Promise.all([ctx.db.get(m.homeTeamId), ctx.db.get(m.awayTeamId), ctx.db.get(m.matchdayId)]);
    return { match: m, home: await brief(ctx, home), away: await brief(ctx, away), matchdayNumber: md?.number ?? null, venue: ed.venue ?? null, backgroundUrl: m.backgroundVisible && m.backgroundId ? await ctx.storage.getUrl(m.backgroundId) : null };
  },
});

async function playerInfo(ctx, id) {
  const pl = await ctx.db.get(id);
  if (!pl) return null;
  const t = await ctx.db.get(pl.teamId);
  return { id: pl._id, firstName: pl.firstName, lastName: pl.lastName, shirtNumber: pl.shirtNumber, role: pl.role, photoUrl: pl.photoId ? await ctx.storage.getUrl(pl.photoId) : null, team: t ? await brief(ctx, t) : null };
}

// Man/Team of the Week: "since" = adesso - 7 giorni. In home i piu' recenti; sotto (storico) gli altri.
export const weekly = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const ed = await activeEdition(ctx);
    if (!ed) return { current: [], history: [] };
    const all = (await ctx.db.query("weeklyAwards").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((a) => a.published).sort((a, b) => b.publishedAt - a.publishedAt);
    const full = async (a) => {
      const md = await ctx.db.get(a.matchdayId), team = a.teamId ? await ctx.db.get(a.teamId) : null;
      return { id: a._id, kind: a.kind, reason: a.reason ?? null, publishedAt: a.publishedAt, homeVisible: a.homeVisible !== false, matchdayNumber: md?.number ?? null, backgroundUrl: a.backgroundId ? await ctx.storage.getUrl(a.backgroundId) : null, player: a.playerId ? await playerInfo(ctx, a.playerId) : null, team: team ? await brief(ctx, team) : null };
    };
    return {
  current: await Promise.all(all.filter((a) => a.publishedAt >= since).map(full)),
  history: await Promise.all(all.filter((a) => a.publishedAt < since || a.homeVisible === false).map(full))
    };
  },
});

// Top 7: quella in corso e lo storico (solo le settimane che sono state pubblicate; bozze e nascoste non si vedono).
export const top7 = query({
  args: {},
  handler: async (ctx) => {
    const ed = await activeEdition(ctx);
    if (!ed) return { current: null, history: [] };
    const all = (await ctx.db.query("top7").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).sort((a, b) => b._creationTime - a._creationTime);
    const full = async (t) => ({ id: t._id, formation: t.formation, matchdayNumber: t.matchdayId ? (await ctx.db.get(t.matchdayId))?.number ?? null : null, players: await Promise.all([...t.slots].sort((x, y) => x.slot - y.slot).map(async (s) => ({ slot: s.slot, ...(await playerInfo(ctx, s.playerId)) }))) });
    const cur = all.find((t) => t.published);
    return { current: cur ? await full(cur) : null, history: await Promise.all(all.filter((t) => !t.published && t.wasPublished).map(full)) };
  },
});

async function buildKnockout(ctx, ed) {
  const pos = new Map((await buildStandings(ctx, ed)).map((r) => [r.teamId, r.pos]));
  const rows = await ctx.db.query("knockout").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect();
  const needed = (r) => (r.round === "semi" ? 2 : 1);
  const team = async (id) => { const t = id ? await ctx.db.get(id) : null; return t ? await brief(ctx, t) : null; };
  return await Promise.all(rows.map(async (r) => {
    const a = r.legs.reduce((s, l) => s + l.scoreA, 0), b = r.legs.reduce((s, l) => s + l.scoreB, 0);
    let winnerId = null;
    if (r.teamAId && r.teamBId && r.legs.length === needed(r)) {
      if (a !== b) winnerId = a > b ? r.teamAId : r.teamBId;
      else if (r.pensA !== undefined && r.pensB !== undefined && r.pensA !== r.pensB) winnerId = r.pensA > r.pensB ? r.teamAId : r.teamBId;   // rigori
      else if (r.round === "semi") winnerId = (pos.get(r.teamAId) ?? 99) <= (pos.get(r.teamBId) ?? 99) ? r.teamAId : r.teamBId;
    }
    return { ...r, aggregateA: a, aggregateB: b, winnerId, teamA: await team(r.teamAId), teamB: await team(r.teamBId) };
  }));
}
// Tabellone: vince chi ha piu' gol (andata+ritorno); in parita' decidono i rigori se inseriti; nelle semifinali, senza rigori, passa la meglio classificata del girone (regolamento).
export const knockout = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => { const ed = await resolveEdition(ctx, editionId); return ed ? await buildKnockout(ctx, ed) : []; },
});

// Edizioni passate: per ognuna campione (vincitrice della finale), finale, capocannoniere e classifica finale.
export const archive = query({
  args: {},
  handler: async (ctx) => {
    const eds = (await ctx.db.query("editions").collect()).filter((e) => e.status === "archived").sort((a, b) => b.year - a.year || b.createdAt - a.createdAt);
    return await Promise.all(eds.map(async (e) => {
      const standings = await buildStandings(ctx, e), ko = await buildKnockout(ctx, e), fin = ko.find((r) => r.round === "final");
      const champ = fin && fin.winnerId ? (fin.winnerId === fin.teamAId ? fin.teamA : fin.teamB) : null;
      return { id: e._id, name: e.name, year: e.year, champion: champ, final: fin && fin.teamA && fin.teamB && fin.legs.length ? { teamA: fin.teamA, teamB: fin.teamB, a: fin.aggregateA, b: fin.aggregateB, pensA: fin.pensA ?? null, pensB: fin.pensB ?? null } : null, topScorers: (await buildScorers(ctx, e)).slice(0, 3), standings };
    }));
  },
});

// Premi finali: invisibili finche' l'admin non sblocca la sezione.
export const finalAwards = query({
  args: {},
  handler: async (ctx) => {
    const ed = await activeEdition(ctx);
    if (!ed || !ed.awardsUnlocked) return { unlocked: false, awards: [] };
    const list = (await ctx.db.query("finalAwards").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((a) => a.published);
    return { unlocked: true, awards: await Promise.all(list.map(async (a) => ({ id: a._id, kind: a.kind, title: a.title, reason: a.reason ?? null, imageUrl: a.imageId ? await ctx.storage.getUrl(a.imageId) : null, player: await playerInfo(ctx, a.playerId) }))) };
  },
});

export const siteLogo = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("siteSettings").first();
    return row?.logoId ? { url: await ctx.storage.getUrl(row.logoId) } : null;   // null = usa il logo originale
  },
});

export const regulation = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => {
    const ed = await resolveEdition(ctx, editionId);
    if (!ed?.regulationId) return null;   // il frontend mostra "Il regolamento non è ancora disponibile"
    return { url: await ctx.storage.getUrl(ed.regulationId), name: ed.regulationName, updatedAt: ed.regulationUpdatedAt };
  },
});

async function brief(ctx, t) {
  return { _id: t._id, slug: t.slug, name: t.name, shortName: t.shortName, colorPrimary: t.colorPrimary ?? null, colorSecondary: t.colorSecondary ?? null, logoUrl: t.logoId ? await ctx.storage.getUrl(t.logoId) : null };
}

// Calendario: giornate in ordine, ognuna con le sue partite (anche 1 sola o più di 2: nessun numero fisso).
export const calendar = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => {
    const ed = await resolveEdition(ctx, editionId);
    if (!ed) return [];
    const days = (await ctx.db.query("matchdays").withIndex("by_edition_number", (q) => q.eq("editionId", ed._id)).collect()).sort((a, b) => a.number - b.number);
    const matches = await ctx.db.query("matches").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect();
    const teams = new Map();
    for (const t of await ctx.db.query("teams").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()) teams.set(t._id, await brief(ctx, t));
    return days.map((d) => ({
      id: d._id, number: d.number, playDate: d.playDate ?? null,
      matches: matches.filter((m) => m.matchdayId === d._id).sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0)).map((m) => ({
        id: m._id, kickoff: m.kickoff ?? null, status: m.status, homeGoals: m.homeGoals ?? null, awayGoals: m.awayGoals ?? null, walkover: !!m.walkover,
        home: teams.get(m.homeTeamId), away: teams.get(m.awayTeamId),
      })),
    }));
  },
});

const ORDINE_RUOLI = { POR: 0, DIF: 1, CEN: 2, ATT: 3 };
// Squadre con rosa (solo giocatori attivi), staff, capitano e stella.
export const teams = query({
  args: { editionId: v.optional(v.id("editions")) },
  handler: async (ctx, { editionId }) => {
    const ed = await resolveEdition(ctx, editionId);
    if (!ed) return [];
    const list = (await ctx.db.query("teams").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).filter((t) => !t.archived).sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(list.map(async (t) => {
      const players = (await ctx.db.query("players").withIndex("by_team", (q) => q.eq("teamId", t._id)).collect()).filter((p) => !p.retired && !p.archived)
        .sort((a, b) => ORDINE_RUOLI[a.role] - ORDINE_RUOLI[b.role] || a.shirtNumber - b.shirtNumber);
      return {
        ...(await brief(ctx, t)), coach: t.coach ?? null, president: t.president ?? null, captainId: t.captainId ?? null, starId: t.starId ?? null,
        players: await Promise.all(players.map(async (p) => ({ id: p._id, firstName: p.firstName, lastName: p.lastName, shirtNumber: p.shirtNumber, role: p.role, strengths: p.strengths, photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null }))),
      };
    }));
  },
});

// Dettaglio partita: risultato, giornata, sede, data e marcatori (un gol per riga; l'autogol e' segnato).
export const matchDetail = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    const m = await ctx.db.get(matchId);
    if (!m) return null;
    const [ed, day, h, w] = await Promise.all([ctx.db.get(m.editionId), ctx.db.get(m.matchdayId), ctx.db.get(m.homeTeamId), ctx.db.get(m.awayTeamId)]);
    const goals = await ctx.db.query("matchGoals").withIndex("by_match", (q) => q.eq("matchId", matchId)).collect();
    const out = [];
    for (const g of goals) { const p = await ctx.db.get(g.playerId); out.push({ playerId: g.playerId, firstName: p.firstName, lastName: p.lastName, teamId: g.teamId, ownGoal: g.ownGoal }); }
    return {
      match: { id: m._id, kickoff: m.kickoff ?? null, status: m.status, homeGoals: m.homeGoals ?? null, awayGoals: m.awayGoals ?? null, walkover: !!m.walkover, home: await brief(ctx, h), away: await brief(ctx, w) },
      matchdayNumber: day?.number ?? null, venue: ed?.venue ?? null, goals: out,
    };
  },
});
