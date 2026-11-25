// @vitest-environment node
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import { anyApi } from "convex/server";
import fs from "node:fs";
import vm from "node:vm";
import schema from "../convex/schema.js";

const modules = import.meta.glob("../convex/**/*.js");
const ctx = {}; vm.createContext(ctx);
for (const f of ["render.js", "admin.js"]) vm.runInContext(fs.readFileSync(new URL("../frontend/js/" + f, import.meta.url), "utf8"), ctx);
const A = ctx.PWC_ADMIN;

describe("pannello admin: controlli sui dati inseriti", () => {
  it("squadra: nome e sigla obbligatori, sigla in maiuscolo, colori validi", () => {
    expect(() => A.teamArgs({ name: " ", shortName: "AB" }, true)).toThrow(/nome/);
    expect(() => A.teamArgs({ name: "X", shortName: "A" }, true)).toThrow(/sigla/);
    expect(A.teamArgs({ name: " Real ", shortName: "rc", colorPrimary: "rosso", coach: " Mister ", captainId: "p1" }, true)).toEqual({ name: "Real", shortName: "RC", colorPrimary: "#1f3df0", colorSecondary: "#ffffff", coach: "Mister", captainId: "p1" });
  });
  it("giocatore: numero 1-99, ruolo valido, punti di forza separati da virgola", () => {
    const ok = { firstName: "A", lastName: "B", shirtNumber: "10", role: "CEN", strengths: " Tecnica, ,Visione " };
    expect(A.playerArgs(ok)).toEqual({ firstName: "A", lastName: "B", shirtNumber: 10, role: "CEN", strengths: ["Tecnica", "Visione"] });
    expect(() => A.playerArgs({ ...ok, shirtNumber: "100" })).toThrow(/numero/);
    expect(() => A.playerArgs({ ...ok, shirtNumber: "1.5" })).toThrow(/numero/);
    expect(() => A.playerArgs({ ...ok, role: "XX" })).toThrow(/ruolo/);
    expect(() => A.playerArgs({ ...ok, lastName: "" })).toThrow(/cognome/);
  });
});

describe("pannello admin: viste con dati veri", () => {
  it("dashboard, squadre, giocatori", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2026 });
    await t.mutation(anyApi.setup.seedDemoData, {});
    const teams = await t.query(anyApi.public.teams, {}), days = await t.query(anyApi.public.calendar, {});
    const dash = A.viewDash(teams, days);
    expect(dash).toContain(">36<"); expect(dash).toContain(">4<");   // 36 giocatori, 4 squadre
    const vt = A.viewTeams(teams);
    expect(vt).toContain("Elimina squadra"); expect(vt).toContain("Stella (giocatore chiave)"); expect(vt).toContain('type="file"'); expect(vt).toContain("Nuova squadra");
    const vp = A.viewPlayers(teams, teams[1]._id);
    expect(vp).toContain("Demo Beta"); expect(vp).toContain("Ritira"); expect(vp).toContain("Rosa (9)"); expect(vp).toContain("Nuovo giocatore in Demo Beta");
    expect(A.viewPlayers([], null)).toContain("aggiungi almeno una squadra");
    expect(A.sideNav("teams")).toContain('data-sec="teams" class="on"');
  });
  it("niente codice dai nomi inseriti", () => {
    const evil = [{ _id: "t1", name: '<img src=x onerror=alert(1)>', shortName: "X", players: [], colorPrimary: null, colorSecondary: null, logoUrl: null }];
    expect(A.viewTeams(evil)).not.toContain("<img src=x");
  });
});

describe("pannello admin: risultati e marcatori", () => {
  it("righe marcatori -> un gol per riga; l'autogol e' a favore della squadra del blocco", () => {
    const blocks = [{ teamId: "H", oppId: "A", rows: [{ playerId: "p1", n: "2" }], ownRows: [{ playerId: "p9", n: "1" }] }, { teamId: "A", oppId: "H", rows: [], ownRows: [] }];
    expect(A.goalsFromRows(blocks)).toEqual([{ playerId: "p1", teamId: "H", ownGoal: false }, { playerId: "p1", teamId: "H", ownGoal: false }, { playerId: "p9", teamId: "A", ownGoal: true }]);
    expect(() => A.goalsFromRows([{ teamId: "H", oppId: "A", rows: [{ playerId: "", n: 1 }] }])).toThrow(/giocatore/);
    expect(() => A.goalsFromRows([{ teamId: "H", oppId: "A", rows: [{ playerId: "p", n: 0 }] }])).toThrow(/tra 1 e 20/);
  });
  it("risultato: i marcatori devono tornare col punteggio (autogol agli avversari); tavolino senza marcatori", () => {
    const goals = [{ playerId: "p1", teamId: "H", ownGoal: false }, { playerId: "p9", teamId: "A", ownGoal: true }];
    expect(A.resultArgs({ homeGoals: "2", awayGoals: "0" }, goals, "H")).toMatchObject({ homeGoals: 2, awayGoals: 0 });
    expect(() => A.resultArgs({ homeGoals: "1", awayGoals: "1" }, goals, "H")).toThrow(/non corrispondono/);
    expect(() => A.resultArgs({ homeGoals: "-1", awayGoals: "0" }, [], "H")).toThrow(/risultato/);
    expect(A.resultArgs({ homeGoals: "3", awayGoals: "0", walkover: true }, [], "H")).toEqual({ homeGoals: 3, awayGoals: 0, walkover: true, goals: [] });
  });
  it("viste giornate e risultati con dati veri (anche prefill dei marcatori)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2026 });
    await t.mutation(anyApi.setup.seedDemoData, {});
    const teams = await t.query(anyApi.public.teams, {}), days = await t.query(anyApi.public.calendar, {});
    const vd = A.viewDays(days, teams);
    expect(vd).toContain("Giornata 3"); expect(vd).toContain("Aggiungi partita"); expect(vd).toContain("Nuova giornata"); expect(vd).toContain('value="4"');   // prossimo numero
    const fin = days[0].matches.find((m) => m.status === "finished");
    const detail = await t.query(anyApi.public.matchDetail, { matchId: fin.id });
    const vr = A.viewResults(days, teams, fin.id, detail);
    expect(vr).toContain("Salva correzione"); expect(vr).toContain("Vittoria a tavolino"); expect(vr).toContain("Aggiungi marcatore"); expect(vr).toContain("Aggiungi autogol");
    expect((vr.match(/class="scorer"/g) || []).length).toBe(detail.goals.length > 0 ? new Set(detail.goals.map((g) => g.playerId)).size : 0);
    const sched = days[2].matches[0];
    expect(A.viewResults(days, teams, sched.id, null)).toContain("Conferma risultato");
    expect(A.viewResults([], teams, null, null)).toContain("Prima crea le giornate");
  });
});

describe("pannello admin: Top 7, MOTW e premi", () => {
  it("etichette dei ruoli secondo il modulo", () => {
    expect(A.slotLabels("2-3-1")).toEqual(["Portiere", "Difensore 1", "Difensore 2", "Centrocampista 1", "Centrocampista 2", "Centrocampista 3", "Attaccante"]);
    expect(A.slotLabels("3-1-2")).toEqual(["Portiere", "Difensore 1", "Difensore 2", "Difensore 3", "Centrocampista", "Attaccante 1", "Attaccante 2"]);
  });
  it("Top 7: 7 giocatori diversi e modulo valido", () => {
    const v = { formation: "2-3-1", p0: "a", p1: "b", p2: "c", p3: "d", p4: "e", p5: "f", p6: "g", matchdayId: "" };
    expect(A.top7Args(v, true)).toEqual({ formation: "2-3-1", playerIds: ["a", "b", "c", "d", "e", "f", "g"], publish: true });
    expect(() => A.top7Args({ ...v, p3: "" }, true)).toThrow(/tutti e 7/);
    expect(() => A.top7Args({ ...v, p3: "a" }, true)).toThrow(/due volte/);
    expect(() => A.top7Args({ ...v, formation: "9-9-9" }, true)).toThrow(/modulo/);
    expect(A.top7Args({ ...v, matchdayId: "d1" }, false)).toMatchObject({ publish: false, matchdayId: "d1" });
  });
  it("premio: tipo, giocatore e titolo (personalizzato richiede il titolo)", () => {
    expect(A.awardArgs({ kind: "mvp", playerId: "p", title: "", published: true }, "img")).toEqual({ kind: "mvp", title: "MVP", playerId: "p", published: true, imageId: "img" });
    expect(() => A.awardArgs({ kind: "custom", playerId: "p", title: " " }, null)).toThrow(/titolo/);
    expect(() => A.awardArgs({ kind: "mvp", playerId: "" }, null)).toThrow(/giocatore/);
    expect(() => A.awardArgs({ kind: "boh", playerId: "p" }, null)).toThrow(/tipo/);
  });
  it("viste con dati veri", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup", year: 2026 });
    await t.mutation(anyApi.setup.seedDemoData, {});
    const teams = await t.query(anyApi.public.teams, {}), days = await t.query(anyApi.public.calendar, {});
    const s = { t7: { formation: "3-2-1", picks: Array(7).fill(""), matchdayId: "" }, top7List: [{ id: "x", formation: "2-3-1", published: true, wasPublished: true, names: ["A", "B"] }], weeklyAll: [], awardsList: [], unlocked: false };
    const v = A.viewTop7(teams, days, s);
    expect(v).toContain("Difensore 3"); expect(v).toContain("Salva e pubblica"); expect(v).toContain("<optgroup"); expect(v).toContain("Nascondi"); expect(v).toContain("Team of the Week");
    const va = A.viewAwards(teams, s);
    expect(va).toContain("Sblocca la sezione"); expect(va).toContain("bloccati");
    expect(A.viewAwards(teams, { ...s, unlocked: true })).toContain("Blocca di nuovo");
  });
});
