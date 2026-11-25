import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { activeEdition } from "./lib";

// Funzioni INTERNE: si eseguono dal pannello Convex (Functions) o con `npx convex run`, mai dal sito.

// 1) Crea la prima edizione (serve prima di tutto il resto).
export const seedFirstEdition = internalMutation({
  args: { name: v.string(), year: v.number(), venue: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (await activeEdition(ctx)) throw new Error("Esiste già un torneo attivo");
    const id = await ctx.db.insert("editions", { name: a.name, year: a.year, venue: a.venue, status: "active", awardsUnlocked: false, createdAt: Date.now() });
    for (const [round, position] of [["semi", 1], ["semi", 2], ["final", 1]]) await ctx.db.insert("knockout", { editionId: id, round, position, legs: [] });
    return id;
  },
});

// 2) Dati di PROVA per vedere le pagine funzionare (nomi finti "Demo ..."). Si cancellano con clearEditionData.
export const seedDemoData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ed = await activeEdition(ctx);
    if (!ed) throw new Error("Prima crea il torneo con seedFirstEdition");
    if (await ctx.db.query("teams").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).first()) throw new Error("Ci sono già squadre: dati di prova non creati");
    const nomi = [["Demo Alfa", "DAL", "#1f3df0", "#ffd23f"], ["Demo Beta", "DBE", "#6d28d9", "#ffffff"], ["Demo Gamma", "DGA", "#17b3a8", "#ffffff"], ["Demo Delta", "DDE", "#e8f6ff", "#0b1a63"]];
    const ruoli = ["POR", "DIF", "DIF", "DIF", "CEN", "CEN", "ATT", "ATT", "CEN"], num = [1, 2, 3, 4, 8, 10, 9, 11, 7];
    const teams = [], players = [];
    for (const [i, [name, short, c1, c2]] of nomi.entries()) {
      const slug = name.toLowerCase().replace(/ /g, "-");
      const tid = await ctx.db.insert("teams", { editionId: ed._id, slug, name, shortName: short, colorPrimary: c1, colorSecondary: c2, coach: "Allenatore " + (i + 1), president: "Presidente " + (i + 1), archived: false });
      teams.push(tid); const ps = [];
      for (let j = 0; j < 9; j++) ps.push(await ctx.db.insert("players", { editionId: ed._id, teamId: tid, firstName: "Giocatore", lastName: `${short} ${j + 1}`, shirtNumber: num[j], role: ruoli[j], strengths: [["Riflessi", "Difesa", "Difesa", "Difesa", "Visione di gioco", "Tecnica", "Finalizzazione", "Velocità", "Dribbling"][j]], retired: false, archived: false }));
      await ctx.db.patch(tid, { captainId: ps[5], starId: ps[6] }); players.push(ps);
    }
    const giorno = async (n, giorni) => ctx.db.insert("matchdays", { editionId: ed._id, number: n, playDate: new Date(Date.now() + giorni * 864e5).toISOString().slice(0, 10) });
    const g1 = await giorno(1, -14), g2 = await giorno(2, -7), g3 = await giorno(3, 3);
    const partita = async (md, h, a, hg, ag, goals) => {
      const m = await ctx.db.insert("matches", { editionId: ed._id, matchdayId: md, homeTeamId: teams[h], awayTeamId: teams[a], status: hg === null ? "scheduled" : "finished", homeGoals: hg ?? undefined, awayGoals: ag ?? undefined, kickoff: Date.now() + (hg === null ? 3 : -10) * 864e5, backgroundVisible: true });
      for (const [t, p] of goals ?? []) await ctx.db.insert("matchGoals", { editionId: ed._id, matchId: m, playerId: players[t][p], teamId: teams[t], ownGoal: false });
    };
    await partita(g1, 0, 1, 2, 1, [[0, 6], [0, 7], [1, 6]]);
    await partita(g1, 2, 3, 0, 0, []);
    await partita(g2, 0, 2, 1, 3, [[0, 6], [2, 6], [2, 7], [2, 6]]);
    await partita(g2, 3, 1, 1, 1, [[3, 6], [1, 7]]);
    await partita(g3, 0, 3, null, null); await partita(g3, 1, 2, null, null);
    await ctx.db.insert("news", { editionId: ed._id, slug: "benvenuti-demo", title: "Benvenuti alla Winter Cup", subtitle: "Notizia di prova", body: "Questo è un articolo di prova: lo puoi cancellare con clearEditionData.", category: "Comunicati ufficiali", status: "published", deleted: false, publishedAt: Date.now() });
    return "Dati di prova creati: 4 squadre, 3 giornate, 1 news";
  },
});

// 3) Cancella TUTTI i dati dell'edizione attiva (squadre, giocatori, partite, news...). Serve per togliere i dati di prova.
export const clearEditionData = internalMutation({
  args: { confirm: v.literal("CANCELLA") },
  handler: async (ctx) => {
    const ed = await activeEdition(ctx);
    if (!ed) throw new Error("Nessun torneo attivo");
    for (const [tabella, indice] of [["matchGoals", "by_edition"], ["matches", "by_edition"], ["players", "by_edition"], ["teams", "by_edition"], ["top7", "by_edition"], ["weeklyAwards", "by_edition"], ["finalAwards", "by_edition"], ["transfers", null], ["news", "by_edition_status"], ["matchdays", "by_edition_number"]]) {
      const righe = await ctx.db.query(tabella).collect();
      for (const r of righe) if (r.editionId === ed._id) await ctx.db.delete(r._id);
    }
    await ctx.db.patch(ed._id, { homeMatchId: undefined });
    return "Dati dell'edizione cancellati";
  },
});
