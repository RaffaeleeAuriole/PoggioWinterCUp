// @vitest-environment node
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { anyApi } from "convex/server";
import fs from "node:fs";
import vm from "node:vm";
import schema from "../convex/schema.js";

const modules = import.meta.glob("../convex/**/*.js");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../frontend/js/render.js", import.meta.url), "utf8"), ctx);
const R = ctx.PWC_RENDER;

describe("render: dati veri di Convex -> HTML dell'anteprima", () => {
  it("classifica, calendario, risultati, squadre, marcatori, news", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2026 });
    await t.mutation(anyApi.setup.seedDemoData, {});
    const st = await t.query(anyApi.public.standings, {});
    const html = R.standingsRows(st);
    expect(html.match(/<tr>/g).length).toBe(4);
    expect(html).toContain("Demo Alfa");
    expect(html).toContain('class="pts"');
    const cal = await t.query(anyApi.public.calendar, {});
    const c = R.calendar(cal);
    expect(c).toContain("Giornata 3");
    expect(c).toContain('class="mr has"');   // partite finite: punteggio per squadra (versione telefono)
    expect(c).toContain(">VS<");             // partite da giocare
    const res = R.results(cal);
    expect(res).toContain("Finita"); expect(res).toContain("Prossima");
    const teams = R.teams(await t.query(anyApi.public.teams, {}));
    expect(teams).toContain("Allenatore"); expect(teams).toContain("Stella"); expect(teams).toContain('<i class=cap>C</i>');
    expect(teams.match(/class="pw"/g).length).toBe(36);   // 4 squadre x 9 giocatori
    expect(R.scorersRows(await t.query(anyApi.public.scorers, {}))).toContain("Giocatore");
    expect(R.teamStats(st)).toContain("Miglior attacco");
    const news = await t.query(anyApi.public.allNews, {});
    expect(R.newsArticle(news[0])).toContain("Benvenuti alla Winter Cup");
    expect(R.newsPost(news[0])).toContain("Leggi l’articolo");
  });
  it("stati vuoti e protezione da codice nei testi", () => {
    expect(R.calendar([])).toContain("non è ancora stato pubblicato");
    expect(R.standingsRows([])).toContain("Nessuna squadra");
    expect(R.regulation(null)).toContain("non è ancora disponibile");
    const art = R.newsArticle({ title: "<script>alert(1)</script>", body: "a\\n\\nb", category: "x", publishedAt: 1, backgroundUrl: 'javascript:alert(1)' });
    expect(art).not.toContain("<script>");
    expect(art).not.toContain("javascript:");
    expect(R.regulation({ url: "javascript:alert(1)", name: "x" })).toContain("non è ancora disponibile");
  });
  it("10 squadre = 10 righe in classifica", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ pos: i + 1, name: "S" + i, shortName: "S" + i, pg: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
    expect(R.standingsRows(rows).match(/<tr>/g).length).toBe(10);
  });
});

describe("render: dettaglio partita", () => {
  it("risultato, marcatori e autogol", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2026, venue: "Centro Sportivo Di Cagno" });
    await t.mutation(anyApi.setup.seedDemoData, {});
    const cal = await t.query(anyApi.public.calendar, {});
    const fin = cal[0].matches.find((m) => m.status === "finished");
    expect(R.calendar(cal)).toContain(`data-match="${fin.id}"`);   // partita cliccabile
    const html = R.matchDetail(await t.query(anyApi.public.matchDetail, { matchId: fin.id }));
    expect(html).toContain("Finita"); expect(html).toContain("Centro Sportivo Di Cagno"); expect(html).toContain("Giocatore");
    expect(R.matchDetail(null)).toContain("non trovata");
  });
});

describe("render: Top 7, Man/Team of the Week e premi", () => {
  it("pagine pubbliche con dati veri", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2026 });
    await t.mutation(anyApi.setup.seedDemoData, {});
    await t.run(async (ctx) => {
      const ed = (await ctx.db.query("editions").first())._id, md = (await ctx.db.query("matchdays").first())._id;
      const players = await ctx.db.query("players").collect(), teams = await ctx.db.query("teams").collect();
      const gk = players.find((p) => p.role === "POR"), out = players.filter((p) => p.role !== "POR").slice(0, 6);
      const slots = [gk, ...out].map((p, i) => ({ slot: i + 1, playerId: p._id }));
      await ctx.db.insert("top7", { editionId: ed, matchdayId: md, formation: "2-3-1", slots, published: true, wasPublished: true });
      await ctx.db.insert("top7", { editionId: ed, formation: "3-2-1", slots, published: false, wasPublished: true });
      await ctx.db.insert("weeklyAwards", { editionId: ed, matchdayId: md, kind: "man_of_week", playerId: out[0]._id, reason: "Doppietta", published: true, publishedAt: Date.now() });
      await ctx.db.insert("weeklyAwards", { editionId: ed, matchdayId: md, kind: "team_of_week", teamId: teams[0]._id, published: true, publishedAt: Date.now() - 10 * 864e5 });
      await ctx.db.insert("finalAwards", { editionId: ed, kind: "mvp", title: "MVP", playerId: out[1]._id, reason: "Il migliore", published: true });
    });
    const since = Date.now() - 7 * 864e5, w = await t.query(anyApi.public.weekly, { since }), tp = await t.query(anyApi.public.top7, {});
    const home = R.motwSection(w.current);
    expect(home).toContain("Man of the Week"); expect(home).toContain("Doppietta"); expect(home).toContain("Giornata 1"); expect(home).not.toContain("Team of the Week");   // il Team di 10 giorni fa e' nello storico
    const page = R.top7Page(tp, w);
    expect(page).toContain("Modulo 2-3-1"); expect(page).toContain("Settimane precedenti"); expect(page).toContain("Modulo 3-2-1"); expect(page).toContain("Team of the Week");
    expect(page.match(/class="pl"/g).length).toBe(14);   // due campi da 7
    expect(R.top7Mini(tp.current)).toContain("Apri Top 7"); expect(R.top7Mini(null)).toBe("");
    expect(R.motwHistory(w.history)).toBe("");   // nessun Man of the Week vecchio
    expect(R.awardsPage(await t.query(anyApi.public.finalAwards, {}))).toContain("Sezione bloccata");
    await t.run(async (ctx) => { const e = await ctx.db.query("editions").first(); await ctx.db.patch(e._id, { awardsUnlocked: true }); });
    const unlocked = R.awardsPage(await t.query(anyApi.public.finalAwards, {}));
    expect(unlocked).toContain("MVP"); expect(unlocked).toContain("Il migliore"); expect(unlocked).not.toContain("Sezione bloccata");
  });
  it("stati vuoti", () => {
    expect(R.top7Page({ current: null, history: [] }, { current: [], history: [] })).toContain("non è ancora stata pubblicata");
    expect(R.motwSection([])).toBe("");
    expect(R.awardsPage({ unlocked: true, awards: [] })).toContain("non sono ancora stati assegnati");
  });
});

describe("render: Match Day in home, tabellone, edizioni passate", () => {
  it("Match Day, tabellone e archivio", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2025, venue: "Campo" });
    await t.mutation(anyApi.setup.seedDemoData, {});
    expect(R.matchDayPoster(await t.query(anyApi.public.homeMatchDay, {}))).toBe("");
    const ids = await t.run(async (ctx) => {
      const ed = await ctx.db.query("editions").first(), ms = await ctx.db.query("matches").collect(), teams = await ctx.db.query("teams").collect();
      await ctx.db.patch(ed._id, { homeMatchId: ms.find((m) => m.status === "finished")._id });
      const semi = (await ctx.db.query("knockout").collect()).find((k) => k.round === "semi" && k.position === 1), fin = (await ctx.db.query("knockout").collect()).find((k) => k.round === "final");
      await ctx.db.patch(semi._id, { teamAId: teams[0]._id, teamBId: teams[1]._id, legs: [{ scoreA: 1, scoreB: 0 }, { scoreA: 1, scoreB: 1 }] });
      await ctx.db.patch(fin._id, { teamAId: teams[0]._id, teamBId: teams[2]._id, legs: [{ scoreA: 2, scoreB: 2 }], extraTime: true, pensA: 4, pensB: 3 });
      return ed._id;
    });
    const md = R.matchDayPoster(await t.query(anyApi.public.homeMatchDay, {}));
    expect(md).toContain("Giornata 1"); expect(md).toContain("Finita"); expect(md).toContain("Campo"); expect(md).toContain("data-match=");
    const ko = R.knockoutPage(await t.query(anyApi.public.knockout, {}));
    expect(ko).toContain("Semifinali"); expect(ko).toContain("rigori 4–3"); expect(ko).toContain('class="w"'); expect(ko).toContain("Demo Alfa");
    expect(R.knockoutPage([{ round: "semi", legs: [] }])).toContain("sarà pubblicato");
    expect(R.archivePage(await t.query(anyApi.public.archive, {}))).toContain("Non ci sono ancora");
    await t.run(async (ctx) => { await ctx.db.patch(ids, { status: "archived" }); });
    const arc = R.archivePage(await t.query(anyApi.public.archive, {}));
    expect(arc).toContain("Campione"); expect(arc).toContain("Demo Alfa"); expect(arc).toContain("rigori 4–3"); expect(arc).toContain('data-tab="0"');
  });
});
