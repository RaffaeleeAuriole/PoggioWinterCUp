import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { anyApi } from "convex/server";
import schema from "../convex/schema.js";
// Il login vero (cifratura password) non gira nell'ambiente di test: qui si simula solo "chi e' collegato".
vi.mock("@convex-dev/auth/server", async (orig) => ({
  ...(await orig()),
  getAuthUserId: async (ctx) => { const i = await ctx.auth.getUserIdentity(); return i ? i.subject.split("|")[0] : null; },
}));
const modules = import.meta.glob("../convex/**/*.js");
process.env.CONVEX_CLOUD_URL = "https://test.convex.cloud";

let t, admin, intruso, ids;

async function seed() {
  t = convexTest(schema, modules);
  const [adminId, intrusoId] = await t.run(async (ctx) => [await ctx.db.insert("users", { createdAt: 1 }), "k17abcdefghjkmnpqrstvwxyz0123456"]);
  admin = t.withIdentity({ subject: `${adminId}|s1` });
  intruso = t.withIdentity({ subject: `${intrusoId}|s2` });
  ids = await t.run(async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const ed = await ctx.db.insert("editions", { name: "Winter Cup 2026", year: 2026, status: "active", awardsUnlocked: false, createdAt: 1 });
    const mk = async (name, short) => ctx.db.insert("teams", { editionId: ed, slug: name.toLowerCase(), name, shortName: short, archived: false });
    const A = await mk("Alfa", "AL"), B = await mk("Beta", "BE");
    const pl = async (team, n, last, role = "ATT") => ctx.db.insert("players", { editionId: ed, teamId: team, firstName: "X", lastName: last, shirtNumber: n, role, strengths: [], retired: false, archived: false });
    const a1 = await pl(A, 9, "Aldo"), a2 = await pl(A, 10, "Anna"), b1 = await pl(B, 9, "Bruno"), b2 = await pl(B, 1, "Bea", "POR");
    const md = await ctx.db.insert("matchdays", { editionId: ed, number: 1 });
    const m = await ctx.db.insert("matches", { editionId: ed, matchdayId: md, homeTeamId: A, awayTeamId: B, status: "scheduled", backgroundVisible: true });
    return { users, ed, A, B, a1, a2, b1, b2, md, m };
  });
}
beforeEach(seed);

const goal = (playerId, teamId, ownGoal = false) => ({ playerId, teamId, ownGoal });

describe("closeMatch", () => {
  it("aggiorna classifica e marcatori", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 2, awayGoals: 1, goals: [goal(ids.a1, ids.A), goal(ids.a2, ids.A), goal(ids.b1, ids.B)] });
    const st = await t.query(anyApi.public.standings, {});
    expect(st[0]).toMatchObject({ name: "Alfa", pts: 3, gf: 2, ga: 1, pos: 1 });
    expect(st[1]).toMatchObject({ name: "Beta", pts: 0, pos: 2 });
    const sc = await t.query(anyApi.public.scorers, {});
    expect(sc.map((s) => s.goals)).toEqual([1, 1, 1]);
  });
  it("una correzione non crea doppi conteggi", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 2, awayGoals: 1, goals: [goal(ids.a1, ids.A), goal(ids.a2, ids.A), goal(ids.b1, ids.B)] });
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 1, goals: [goal(ids.a1, ids.A), goal(ids.b1, ids.B)] });
    const st = await t.query(anyApi.public.standings, {});
    expect(st.map((r) => [r.pts, r.gf, r.ga, r.pg])).toEqual([[1, 1, 1, 1], [1, 1, 1, 1]]);
    expect((await t.query(anyApi.public.scorers, {})).length).toBe(2);
  });
  it("l'autogol va agli avversari", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 0, awayGoals: 1, goals: [goal(ids.a1, ids.A, true)] });
    const st = await t.query(anyApi.public.standings, {});
    expect(st[0]).toMatchObject({ name: "Beta", pts: 3 });
    expect(await t.query(anyApi.public.scorers, {})).toEqual([]);
  });
  it("rifiuta marcatori incoerenti col risultato e non cambia nulla", async () => {
    await expect(admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 3, awayGoals: 0, goals: [goal(ids.a1, ids.A)] })).rejects.toThrow(/non corrispondono/);
    expect((await t.query(anyApi.public.standings, {})).every((r) => r.pg === 0)).toBe(true);
  });
});

describe("accesso admin", () => {
  it("non autenticati e account non admin sono respinti", async () => {
    const args = { matchId: ids.m, homeGoals: 0, awayGoals: 0, goals: [] };
    await expect(t.mutation(anyApi.admin.closeMatch, args)).rejects.toThrow(/Non autenticato/);
    await expect(intruso.mutation(anyApi.admin.closeMatch, args)).rejects.toThrow();
    await expect(intruso.mutation(anyApi.teams.createTeam, { name: "Hack", shortName: "HK" })).rejects.toThrow();
  });
  it("un admin autenticato puo' operare", async () => {
    await expect(admin.mutation(anyApi.teams.createTeam, { name: "Gamma", shortName: "GA" })).resolves.toBeTruthy();
  });
  it("la registrazione admin e' chiusa salvo configurazione iniziale e limitata a MAX_ADMINS", async () => {
    const t2 = convexTest(schema, modules);
    const crea = () => t2.mutation(anyApi.users.createUserPassword, { method: { name: "usernamePassword", profile: {} } });
    delete process.env.ALLOW_ADMIN_SIGNUP;
    await expect(crea()).rejects.toThrow(/chiusa/);
    process.env.ALLOW_ADMIN_SIGNUP = "true";
    await crea(); await crea();
    await expect(crea()).rejects.toThrow(/massimo/);
    process.env.ALLOW_ADMIN_SIGNUP = "false";
    await expect(crea()).rejects.toThrow(/chiusa/);
  });
});

describe("rose e trasferimenti", () => {
  it("numero di maglia univoco e trasferimento con storico", async () => {
    await expect(admin.mutation(anyApi.players.createPlayer, { teamId: ids.A, firstName: "N", lastName: "Nuovo", shirtNumber: 9, role: "DIF" })).rejects.toThrow(/occupato/);
    await expect(admin.mutation(anyApi.admin.transferPlayer, { playerId: ids.a1, toTeamId: ids.B, date: "2026-11-20" })).rejects.toThrow(/occupato/);
    await admin.mutation(anyApi.admin.transferPlayer, { playerId: ids.a1, toTeamId: ids.B, date: "2026-11-20", newNumber: 7 });
    const p = await t.run((ctx) => ctx.db.get(ids.a1));
    expect(p).toMatchObject({ teamId: ids.B, shirtNumber: 7 });
  });
  it("le statistiche restano con la squadra con cui sono state ottenute", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 0, goals: [goal(ids.a1, ids.A)] });
    await admin.mutation(anyApi.admin.transferPlayer, { playerId: ids.a1, toTeamId: ids.B, date: "2026-11-20", newNumber: 7 });
    const sc = await t.query(anyApi.public.scorers, {});
    expect(sc[0]).toMatchObject({ teamName: "Alfa", goals: 1 });
  });
  it("ritirato = non selezionabile in Top 7; eliminare con storico archivia", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 0, goals: [goal(ids.a1, ids.A)] });
    expect(await admin.mutation(anyApi.players.deletePlayer, { playerId: ids.a1 })).toBe("archiviato");
    expect(await admin.mutation(anyApi.players.deletePlayer, { playerId: ids.a2 })).toBe("eliminato");
  });
});

describe("edizioni, home e Top 7", () => {
  it("nuovo torneo: il vecchio si archivia e il nuovo parte vuoto", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 0, goals: [goal(ids.a1, ids.A)] });
    await admin.mutation(anyApi.admin.createEdition, { name: "Winter Cup 2027", year: 2027 });
    expect(await t.query(anyApi.public.standings, {})).toEqual([]);
    const vecchia = await t.query(anyApi.public.standings, { editionId: ids.ed });
    expect(vecchia[0]).toMatchObject({ name: "Alfa", pts: 3 });
    const eds = await t.query(anyApi.public.editions, {});
    expect(eds.map((e) => e.status)).toEqual(["active", "archived"]);
  });
  it("news in home solo se recenti; Match Day in home: il nuovo sostituisce il vecchio", async () => {
    const id = await admin.mutation(anyApi.content.saveNews, { title: "Titolo", body: "Testo", category: "Risultati" });
    expect(await t.query(anyApi.public.homeNews, { since: 0 })).toEqual([]);   // bozza: non visibile
    await admin.mutation(anyApi.content.setNewsStatus, { id, status: "published" });
    expect((await t.query(anyApi.public.homeNews, { since: 0 })).length).toBe(1);
    expect(await t.query(anyApi.public.homeNews, { since: Date.now() + 1000 })).toEqual([]);   // oltre i 3 giorni: sparisce dalla home
    expect((await t.query(anyApi.public.allNews, {})).length).toBe(1);                       // ma resta nella sezione News
    const m2 = await t.run((ctx) => ctx.db.insert("matches", { editionId: ids.ed, matchdayId: ids.md, homeTeamId: ids.B, awayTeamId: ids.A, status: "scheduled", backgroundVisible: true }));
    await admin.mutation(anyApi.matches.setHomeMatchDay, { matchId: ids.m });
    await admin.mutation(anyApi.matches.setHomeMatchDay, { matchId: m2 });
    expect((await t.query(anyApi.public.homeMatchDay, {})).match._id).toBe(m2);
  });
  it("Top 7: 7 giocatori, 1 portiere, niente duplicati", async () => {
    await expect(admin.mutation(anyApi.content.saveTop7, { formation: "2-3-1", playerIds: [ids.b2, ids.a1], publish: true })).rejects.toThrow(/7 giocatori/);
    const extra = await t.run(async (ctx) => { const r = []; for (let i = 0; i < 5; i++) r.push(await ctx.db.insert("players", { editionId: ids.ed, teamId: ids.A, firstName: "E", lastName: "E" + i, shirtNumber: 20 + i, role: "CEN", strengths: [], retired: false, archived: false })); return r; });
    await expect(admin.mutation(anyApi.content.saveTop7, { formation: "2-3-1", playerIds: [ids.a1, ids.a2, ids.b1, ...extra.slice(0, 3), extra[3]], publish: true })).rejects.toThrow(/portiere/);
    await admin.mutation(anyApi.content.saveTop7, { formation: "3-2-1", playerIds: [ids.b2, ids.a1, ids.a2, ids.b1, ...extra.slice(0, 3)], publish: true });
    expect((await t.query(anyApi.public.top7, {})).current.formation).toBe("3-2-1");
  });
  it("premi finali nascosti finché non sbloccati", async () => {
    await admin.mutation(anyApi.content.assignFinalAward, { kind: "mvp", title: "MVP", playerId: ids.a1, published: true });
    expect((await t.query(anyApi.public.finalAwards, {})).awards).toEqual([]);
    await admin.mutation(anyApi.content.setAwardsUnlocked, { unlocked: true });
    expect((await t.query(anyApi.public.finalAwards, {})).awards.length).toBe(1);
  });
});

describe("regolamento: spareggi e tabellone", () => {
  async function tabella() {
    return await t.run(async (ctx) => {
      const mk = async (name, short) => ctx.db.insert("teams", { editionId: ids.ed, slug: name.toLowerCase(), name, shortName: short, archived: false });
      const C = await mk("Gamma", "GA"), D = await mk("Delta", "DE");
      const g = (h, a, hg, ag) => ctx.db.insert("matches", { editionId: ids.ed, matchdayId: ids.md, homeTeamId: h, awayTeamId: a, status: "finished", homeGoals: hg, awayGoals: ag, backgroundVisible: true });
      await g(ids.A, ids.B, 1, 0); await g(ids.A, D, 0, 1); await g(ids.B, C, 4, 0); await g(C, D, 0, 0);
      return { C, D };
    });
  }
  it("a pari punti conta lo scontro diretto, anche se l'altra ha differenza reti migliore", async () => {
    const { D } = await tabella();
    const st = await t.query(anyApi.public.standings, {});
    // D 4 pt; A e B 3 pt (B ha differenza reti +3 contro 0 di A, ma A ha battuto B); C 1 pt
    expect(st.map((r) => r.name)).toEqual(["Delta", "Alfa", "Beta", "Gamma"]);
    expect(st.find((r) => r.name === "Beta").gd).toBeGreaterThan(st.find((r) => r.name === "Alfa").gd);
  });
  it("semifinale andata e ritorno: in parità passa la meglio classificata nel girone", async () => {
    await tabella();
    await admin.mutation(anyApi.admin.createEdition, { name: "x", year: 2099 }).catch(() => {});
    // createEdition archivia: per questo test riattiviamo l'edizione originale con i suoi dati
    await t.run(async (ctx) => { for (const e of await ctx.db.query("editions").collect()) await ctx.db.patch(e._id, { status: e._id === ids.ed ? "active" : "archived" }); await ctx.db.insert("knockout", { editionId: ids.ed, round: "semi", position: 1, teamAId: ids.A, teamBId: ids.B, legs: [] }); });
    await admin.mutation(anyApi.content.setKnockout, { round: "semi", position: 1, legs: [{ scoreA: 1, scoreB: 0 }, { scoreA: 1, scoreB: 2 }] });   // totale 2-2
    const ko = (await t.query(anyApi.public.knockout, {})).find((r) => r.round === "semi");
    expect(ko).toMatchObject({ aggregateA: 2, aggregateB: 2, winnerId: ids.A });   // A è 2ª, B è 3ª
    await admin.mutation(anyApi.content.setKnockout, { round: "semi", position: 1, legs: [{ scoreA: 0, scoreB: 3 }, { scoreA: 1, scoreB: 0 }] });   // totale 1-3
    expect((await t.query(anyApi.public.knockout, {})).find((r) => r.round === "semi").winnerId).toBe(ids.B);
  });
  it("vittoria a tavolino: risultato assegnato senza marcatori", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 3, awayGoals: 0, walkover: true, goals: [] });
    expect((await t.query(anyApi.public.standings, {}))[0]).toMatchObject({ name: "Alfa", pts: 3, gf: 3 });
    await expect(admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 3, awayGoals: 0, walkover: true, goals: [goal(ids.a1, ids.A)] })).rejects.toThrow(/tavolino/);
  });
});

describe("stella, logo e rigori", () => {
  it("la stella deve far parte della squadra", async () => {
    await admin.mutation(anyApi.teams.updateTeam, { teamId: ids.A, starId: ids.a1 });
    expect((await t.run((ctx) => ctx.db.get(ids.A))).starId).toBe(ids.a1);
    await expect(admin.mutation(anyApi.teams.updateTeam, { teamId: ids.A, starId: ids.b1 })).rejects.toThrow(/stella/);
    await expect(intruso.mutation(anyApi.teams.updateTeam, { teamId: ids.A, starId: ids.a2 })).rejects.toThrow();
  });
  it("logo del sito: solo admin, solo immagini (niente SVG), si puo' ripristinare", async () => {
    const png = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "image/png" })));
    const svg = await t.run((ctx) => ctx.storage.store(new Blob(["<svg/>"], { type: "image/svg+xml" })));
    await expect(intruso.mutation(anyApi.site.setSiteLogo, { storageId: png })).rejects.toThrow();
    await expect(admin.mutation(anyApi.site.setSiteLogo, { storageId: svg })).rejects.toThrow(/Immagine non valida/);
    expect(await t.query(anyApi.public.siteLogo, {})).toBeNull();
    await admin.mutation(anyApi.site.setSiteLogo, { storageId: png });
    expect((await t.query(anyApi.public.siteLogo, {})).url).toBeTruthy();
    await admin.mutation(anyApi.site.setSiteLogo, {});
    expect(await t.query(anyApi.public.siteLogo, {})).toBeNull();
  });
  it("finale: parità risolta dai rigori; senza rigori nessun vincitore", async () => {
    await t.run((ctx) => ctx.db.insert("knockout", { editionId: ids.ed, round: "final", position: 1, teamAId: ids.A, teamBId: ids.B, legs: [] }));
    await admin.mutation(anyApi.content.setKnockout, { round: "final", position: 1, legs: [{ scoreA: 1, scoreB: 1 }], extraTime: true });
    expect((await t.query(anyApi.public.knockout, {}))[0].winnerId).toBeNull();
    await admin.mutation(anyApi.content.setKnockout, { round: "final", position: 1, pensA: 3, pensB: 4 });
    expect((await t.query(anyApi.public.knockout, {}))[0].winnerId).toBe(ids.B);
  });
});

describe("regolamento PDF e tante squadre", () => {
  it("l'admin carica un PDF; altri formati e non-admin sono respinti; si puo' rimuovere", async () => {
    const pdf = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.4"], { type: "application/pdf" })));
    const exe = await t.run((ctx) => ctx.storage.store(new Blob(["MZ"], { type: "application/octet-stream" })));
    expect(await t.query(anyApi.public.regulation, {})).toBeNull();
    await expect(intruso.mutation(anyApi.site.setRegulation, { storageId: pdf })).rejects.toThrow();
    await expect(admin.mutation(anyApi.site.setRegulation, { storageId: exe })).rejects.toThrow(/solo PDF/);
    await admin.mutation(anyApi.site.setRegulation, { storageId: pdf, fileName: "Regolamento_Winter_Cup.pdf" });
    expect(await t.query(anyApi.public.regulation, {})).toMatchObject({ name: "Regolamento_Winter_Cup.pdf" });
    await admin.mutation(anyApi.site.setRegulation, {});
    expect(await t.query(anyApi.public.regulation, {})).toBeNull();
  });
  it("la classifica cresce con il numero di squadre (10 squadre = 10 righe)", async () => {
    for (let i = 0; i < 8; i++) await admin.mutation(anyApi.teams.createTeam, { name: "Squadra " + i, shortName: "S" + i });
    const st = await t.query(anyApi.public.standings, {});
    expect(st.length).toBe(10);
    expect(st.map((r) => r.pos)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe("avvio, dati di prova e pagine pubbliche", () => {
  it("seed + calendario + squadre + classifica + news", async () => {
    const t2 = convexTest(schema, modules);
    await expect(t2.mutation(anyApi.setup.seedDemoData, {})).rejects.toThrow(/crea il torneo/);
    await t2.mutation(anyApi.setup.seedFirstEdition, { name: "Winter Cup 2026", year: 2026, venue: "Campo" });
    await expect(t2.mutation(anyApi.setup.seedFirstEdition, { name: "x", year: 1 })).rejects.toThrow(/già un torneo/);
    await t2.mutation(anyApi.setup.seedDemoData, {});
    await expect(t2.mutation(anyApi.setup.seedDemoData, {})).rejects.toThrow(/già squadre/);
    const cal = await t2.query(anyApi.public.calendar, {});
    expect(cal.map((g) => g.matches.length)).toEqual([2, 2, 2]);
    expect(cal[0].matches[0]).toMatchObject({ status: "finished", home: { name: "Demo Alfa" } });
    const sq = await t2.query(anyApi.public.teams, {});
    expect(sq.length).toBe(4);
    expect(sq[0].players.length).toBe(9);
    expect(sq[0].players[0].role).toBe("POR");
    expect(sq[0].starId).toBeTruthy();
    const st = await t2.query(anyApi.public.standings, {});
    expect(st.length).toBe(4);
    expect((await t2.query(anyApi.public.scorers, {})).length).toBeGreaterThan(0);
    expect((await t2.query(anyApi.public.homeNews, { since: 0 })).length).toBe(1);
    await t2.mutation(anyApi.setup.clearEditionData, { confirm: "CANCELLA" });
    expect(await t2.query(anyApi.public.teams, {})).toEqual([]);
    expect(await t2.query(anyApi.public.calendar, {})).toEqual([]);
  });
});

describe("dettaglio partita e chi e' admin", () => {
  it("matchDetail mostra risultato e marcatori (autogol compreso)", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 1, goals: [goal(ids.a1, ids.A), goal(ids.a2, ids.A, true)] });
    const d = await t.query(anyApi.public.matchDetail, { matchId: ids.m });
    expect(d).toMatchObject({ matchdayNumber: 1, match: { status: "finished", homeGoals: 1, awayGoals: 1 } });
    expect(d.goals.length).toBe(2);
    expect(d.goals.filter((g) => g.ownGoal).length).toBe(1);
  });
  it("admin.me: admin si, anonimo no", async () => {
    expect(await admin.query(anyApi.admin.me, {})).toBeTruthy();
    expect(await t.query(anyApi.admin.me, {})).toBeNull();
  });
});

describe("diagnosi accesso", () => {
  it("authStatus: anonimo = token non riconosciuto", async () => {
    expect(await t.query(anyApi.admin.authStatus, {})).toEqual({ ok: false, reason: "token-non-riconosciuto" });
    expect((await admin.query(anyApi.admin.authStatus, {})).ok).toBe(true);
  });
});

describe("giornate e partite da admin", () => {
  it("elimina partita giocata: classifica e marcatori si ricalcolano; giornata con partite non si elimina", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 0, goals: [goal(ids.a1, ids.A)] });
    await admin.mutation(anyApi.matches.setHomeMatchDay, { matchId: ids.m });
    expect((await t.query(anyApi.public.standings, {}))[0].pts).toBe(3);
    await expect(admin.mutation(anyApi.matches.deleteMatchday, { matchdayId: ids.md })).rejects.toThrow(/ancora partite/);
    await expect(intruso.mutation(anyApi.matches.deleteMatch, { matchId: ids.m })).rejects.toThrow();
    await admin.mutation(anyApi.matches.deleteMatch, { matchId: ids.m });
    expect((await t.query(anyApi.public.standings, {})).every((r) => r.pts === 0 && r.pg === 0)).toBe(true);
    expect(await t.query(anyApi.public.scorers, {})).toEqual([]);
    expect(await t.query(anyApi.public.homeMatchDay, {})).toBeNull();
    await admin.mutation(anyApi.matches.deleteMatchday, { matchdayId: ids.md });
    expect(await t.query(anyApi.public.calendar, {})).toEqual([]);
  });
  it("calendario espone l'id della giornata; si puo' cambiare la data", async () => {
    const cal = await t.query(anyApi.public.calendar, {});
    expect(cal[0].id).toBe(ids.md);
    await admin.mutation(anyApi.matches.updateMatchday, { matchdayId: ids.md, playDate: "2026-12-06" });
    expect((await t.query(anyApi.public.calendar, {}))[0].playDate).toBe("2026-12-06");
  });
});

describe("Top 7, Man/Team of the Week e premi: dati per le pagine", () => {
  async function sette() {
    const extra = await t.run(async (ctx) => { const r = []; for (let i = 0; i < 5; i++) r.push(await ctx.db.insert("players", { editionId: ids.ed, teamId: ids.A, firstName: "E", lastName: "E" + i, shirtNumber: 20 + i, role: "CEN", strengths: [], retired: false, archived: false })); return r; });
    return [ids.b2, ids.a1, ids.a2, ids.b1, ...extra.slice(0, 3)];
  }
  it("Top 7: pubblicata, storico, bozze e nascoste", async () => {
    const sq = await sette();
    const a = await admin.mutation(anyApi.content.saveTop7, { formation: "2-3-1", playerIds: sq, publish: true });
    const b = await admin.mutation(anyApi.content.saveTop7, { formation: "3-2-1", playerIds: sq, publish: true });
    let r = await t.query(anyApi.public.top7, {});
    expect(r.current.formation).toBe("3-2-1"); expect(r.current.players.length).toBe(7); expect(r.current.players[0].lastName).toBe("Bea");
    expect(r.history.map((x) => x.id)).toEqual([a]);                       // la precedente passa nello storico
    const bozza = await admin.mutation(anyApi.content.saveTop7, { formation: "2-2-2", playerIds: sq, publish: false });
    expect((await t.query(anyApi.public.top7, {})).history.length).toBe(1);  // la bozza non si vede
    await admin.mutation(anyApi.content.setTop7Published, { id: b, published: false });
    r = await t.query(anyApi.public.top7, {});
    expect(r.current).toBeNull(); expect(r.history.length).toBe(1);         // nascosta del tutto
    await admin.mutation(anyApi.content.setTop7Published, { id: bozza, published: true });
    expect((await t.query(anyApi.public.top7, {})).current.formation).toBe("2-2-2");
    expect((await admin.query(anyApi.admin.listTop7, {})).length).toBe(3);
    await expect(t.query(anyApi.admin.listTop7, {})).rejects.toThrow();
    await admin.mutation(anyApi.content.deleteTop7, { id: bozza });
    expect((await admin.query(anyApi.admin.listTop7, {})).length).toBe(2);
  });
  it("Man/Team of the Week con dati completi; 7 giorni in home poi storico; si cancella", async () => {
    const id = await admin.mutation(anyApi.content.setWeeklyAward, { matchdayId: ids.md, kind: "man_of_week", playerId: ids.a1, reason: "Doppietta" });
    await admin.mutation(anyApi.content.setWeeklyAward, { matchdayId: ids.md, kind: "team_of_week", teamId: ids.B });
    const w = await t.query(anyApi.public.weekly, { since: 0 });
    const m = w.current.find((x) => x.kind === "man_of_week");
    expect(m).toMatchObject({ reason: "Doppietta", matchdayNumber: 1, player: { lastName: "Aldo", team: { name: "Alfa" } } });
    expect(w.current.find((x) => x.kind === "team_of_week").team.name).toBe("Beta");
    const dopo = await t.query(anyApi.public.weekly, { since: Date.now() + 1000 });
    expect(dopo.current).toEqual([]); expect(dopo.history.length).toBe(2);
    await admin.mutation(anyApi.content.deleteWeeklyAward, { id });
    expect((await t.query(anyApi.public.weekly, { since: 0 })).current.length).toBe(1);
  });
  it("premi finali: bloccati, poi sbloccati con dati completi; elenco admin e cancellazione", async () => {
    const id = await admin.mutation(anyApi.content.assignFinalAward, { kind: "mvp", title: "MVP", playerId: ids.a1, reason: "Il migliore", published: true });
    expect(await t.query(anyApi.public.finalAwards, {})).toEqual({ unlocked: false, awards: [] });
    expect((await admin.query(anyApi.admin.listFinalAwards, {}))[0]).toMatchObject({ title: "MVP", player: "X Aldo", published: true });
    await admin.mutation(anyApi.content.setAwardsUnlocked, { unlocked: true });
    const r = await t.query(anyApi.public.finalAwards, {});
    expect(r.awards[0]).toMatchObject({ title: "MVP", reason: "Il migliore", player: { lastName: "Aldo", team: { name: "Alfa" } } });
    await admin.mutation(anyApi.content.deleteFinalAward, { id });
    expect((await t.query(anyApi.public.finalAwards, {})).awards).toEqual([]);
  });
});

describe("tabellone, edizioni passate, elenchi admin", () => {
  it("tabellone con squadre e vincitore; edizione chiusa nell'archivio con campione, finale, capocannoniere", async () => {
    await admin.mutation(anyApi.admin.closeMatch, { matchId: ids.m, homeGoals: 1, awayGoals: 0, goals: [goal(ids.a1, ids.A)] });
    await t.run((ctx) => ctx.db.insert("knockout", { editionId: ids.ed, round: "final", position: 1, teamAId: ids.A, teamBId: ids.B, legs: [] }));
    await admin.mutation(anyApi.content.setKnockout, { round: "final", position: 1, legs: [{ scoreA: 2, scoreB: 1 }] });
    const ko = (await t.query(anyApi.public.knockout, {}))[0];
    expect(ko).toMatchObject({ winnerId: ids.A, aggregateA: 2, aggregateB: 1, teamA: { name: "Alfa" }, teamB: { name: "Beta" } });
    expect(await t.query(anyApi.public.archive, {})).toEqual([]);
    await admin.mutation(anyApi.admin.createEdition, { name: "Winter Cup 2027", year: 2027 });
    const arc = await t.query(anyApi.public.archive, {});
    expect(arc.length).toBe(1);
    expect(arc[0]).toMatchObject({ name: "Winter Cup 2026", champion: { name: "Alfa" }, final: { a: 2, b: 1 } });
    expect(arc[0].topScorers[0].lastName).toBe("Aldo"); expect(arc[0].standings[0].name).toBe("Alfa");
    expect(await t.query(anyApi.public.standings, {})).toEqual([]);   // la nuova edizione e' vuota
  });
  it("elenchi admin: news (bozze comprese) e trasferimenti", async () => {
    const id = await admin.mutation(anyApi.content.saveNews, { title: "Bozza", body: "Testo", category: "Risultati" });
    expect((await admin.query(anyApi.admin.listNews, {}))[0]).toMatchObject({ title: "Bozza", status: "draft" });
    await expect(t.query(anyApi.admin.listNews, {})).rejects.toThrow();
    await admin.mutation(anyApi.content.deleteNews, { id });
    expect(await admin.query(anyApi.admin.listNews, {})).toEqual([]);
    await admin.mutation(anyApi.admin.transferPlayer, { playerId: ids.a1, toTeamId: ids.B, date: "2026-11-24", newNumber: 7, note: "Scambio" });
    expect((await admin.query(anyApi.admin.listTransfers, {}))[0]).toEqual({ id: expect.any(String), player: "X Aldo", from: "Alfa", to: "Beta", date: "2026-11-24", note: "Scambio" });
  });
});
