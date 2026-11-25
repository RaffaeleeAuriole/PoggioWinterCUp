import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertImage, needEdition, requireAdmin, slugify } from "./lib";

const CATEGORIE = ["Trasferimenti", "Comunicati ufficiali", "Match Day", "Risultati", "Premi", "Eventi", "Novità del torneo"];

export const saveNews = mutation({
  args: { id: v.optional(v.id("news")), title: v.string(), subtitle: v.optional(v.string()), body: v.string(), category: v.string(), backgroundId: v.optional(v.id("_storage")) },
  handler: async (ctx, { id, ...a }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    if (!CATEGORIE.includes(a.category)) throw new Error("Categoria non valida");
    if (!a.title.trim() || !a.body.trim()) throw new Error("Titolo e testo obbligatori");
    if (a.backgroundId) await assertImage(ctx, a.backgroundId);
    if (id) { await ctx.db.patch(id, a); return id; }
    return await ctx.db.insert("news", { editionId: ed._id, slug: slugify(a.title) + "-" + Date.now().toString(36), ...a, status: "draft", deleted: false });
  },
});

// Pubblicando, parte il conteggio dei 3 giorni in home; la news resta sempre nella pagina News.
export const setNewsStatus = mutation({
  args: { id: v.id("news"), status: v.union(v.literal("draft"), v.literal("published"), v.literal("hidden")) },
  handler: async (ctx, { id, status }) => {
    await requireAdmin(ctx);
    const n = await ctx.db.get(id);
    if (!n) throw new Error("News non trovata");
    await ctx.db.patch(id, status === "published" && n.status !== "published" ? { status, publishedAt: Date.now() } : { status });
  },
});
export const deleteNews = mutation({ args: { id: v.id("news") }, handler: async (ctx, { id }) => { await requireAdmin(ctx); await ctx.db.patch(id, { deleted: true }); } });

export const setNewsHomeVisible = mutation({
  args: { id: v.id("news"), visible: v.boolean() },
  handler: async (ctx, { id, visible }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const n = await ctx.db.get(id);
    if (!n || n.editionId !== ed._id) throw new Error("News non trovata");
    await ctx.db.patch(id, { homeVisible: visible });
  },
});

// Man/Team of the Week: stanno in home 7 giorni dalla pubblicazione, poi vanno nello storico.
export const setWeeklyAward = mutation({
  args: { matchdayId: v.id("matchdays"), kind: v.union(v.literal("man_of_week"), v.literal("team_of_week")), playerId: v.optional(v.id("players")), teamId: v.optional(v.id("teams")), reason: v.optional(v.string()), backgroundId: v.optional(v.id("_storage")) },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    if (a.kind === "man_of_week" ? !a.playerId : !a.teamId) throw new Error("Selezione mancante");
    if (a.backgroundId) await assertImage(ctx, a.backgroundId);
    const old = (await ctx.db.query("weeklyAwards").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).find((x) => x.matchdayId === a.matchdayId && x.kind === a.kind);

const doc = {
  editionId: ed._id,
  ...a,
  published: true,
  publishedAt: Date.now(),
  homeVisible: old?.homeVisible ?? true
};
    if (old) { await ctx.db.replace(old._id, doc); return old._id; }
    return await ctx.db.insert("weeklyAwards", doc);
  },
});

export const setWeeklyAwardHomeVisible = mutation({
  args: { id: v.id("weeklyAwards"), visible: v.boolean() },
  handler: async (ctx, { id, visible }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const a = await ctx.db.get(id);
    if (!a || a.editionId !== ed._id) throw new Error("Premio non trovato");
    await ctx.db.patch(id, { homeVisible: visible });
  },
});

// Top 7: 1 portiere + 6 di movimento, nessun duplicato. Il modulo lo sceglie solo l'admin.
export const saveTop7 = mutation({
  args: { matchdayId: v.optional(v.id("matchdays")), formation: v.union(v.literal("2-3-1"), v.literal("3-2-1"), v.literal("2-2-2"), v.literal("3-1-2")), playerIds: v.array(v.id("players")), publish: v.boolean() },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    if (a.playerIds.length !== 7 || new Set(a.playerIds).size !== 7) throw new Error("Servono 7 giocatori diversi");
    const ps = await Promise.all(a.playerIds.map((id) => ctx.db.get(id)));
    if (ps.some((p) => !p || p.editionId !== ed._id || p.retired || p.archived)) throw new Error("Giocatore non valido");
    if (ps[0].role !== "POR" || ps.slice(1).some((p) => p.role === "POR")) throw new Error("Serve 1 portiere (primo) e 6 giocatori di movimento");
    if (a.publish) for (const t of await ctx.db.query("top7").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()) if (t.published) await ctx.db.patch(t._id, { published: false, wasPublished: true });
    return await ctx.db.insert("top7", { editionId: ed._id, matchdayId: a.matchdayId, formation: a.formation, slots: a.playerIds.map((playerId, i) => ({ slot: i + 1, playerId })), published: a.publish, wasPublished: a.publish });
  },
});

export const setKnockout = mutation({
  args: { round: v.union(v.literal("semi"), v.literal("final")), position: v.number(), teamAId: v.optional(v.id("teams")), teamBId: v.optional(v.id("teams")), legs: v.optional(v.array(v.object({ scoreA: v.number(), scoreB: v.number() }))), extraTime: v.optional(v.boolean()), pensA: v.optional(v.number()), pensB: v.optional(v.number()) },
  handler: async (ctx, { round, position, ...patch }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const row = (await ctx.db.query("knockout").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()).find((r) => r.round === round && r.position === position);
    if (!row) throw new Error("Partita del tabellone non trovata");
    const A = patch.teamAId ?? row.teamAId, B = patch.teamBId ?? row.teamBId;
    if (A && A === B) throw new Error("Le due squadre devono essere diverse");
    if (patch.legs && (patch.legs.length > (round === "semi" ? 2 : 1) || patch.legs.some((l) => l.scoreA < 0 || l.scoreB < 0))) throw new Error("Risultati non validi");
    await ctx.db.patch(row._id, patch);
  },
});

export const setAwardsUnlocked = mutation({ args: { unlocked: v.boolean() }, handler: async (ctx, { unlocked }) => { await requireAdmin(ctx); const ed = await needEdition(ctx); await ctx.db.patch(ed._id, { awardsUnlocked: unlocked }); } });
export const assignFinalAward = mutation({
  args: { kind: v.union(v.literal("mvp"), v.literal("capocannoniere"), v.literal("miglior_portiere"), v.literal("custom")), title: v.string(), playerId: v.id("players"), reason: v.optional(v.string()), imageId: v.optional(v.id("_storage")), published: v.boolean() },
  handler: async (ctx, a) => { await requireAdmin(ctx); const ed = await needEdition(ctx); if (a.imageId) await assertImage(ctx, a.imageId); return await ctx.db.insert("finalAwards", { editionId: ed._id, ...a }); },
});

// Pubblica una Top 7 (la precedente passa nello storico) oppure la nasconde del tutto (bozza).
export const setTop7Published = mutation({
  args: { id: v.id("top7"), published: v.boolean() },
  handler: async (ctx, { id, published }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const t = await ctx.db.get(id);
    if (!t || t.editionId !== ed._id) throw new Error("Top 7 non trovata");
    if (published) {
      for (const o of await ctx.db.query("top7").withIndex("by_edition", (q) => q.eq("editionId", ed._id)).collect()) if (o._id !== id && o.published) await ctx.db.patch(o._id, { published: false, wasPublished: true });
      await ctx.db.patch(id, { published: true, wasPublished: true });
    } else await ctx.db.patch(id, { published: false, wasPublished: false });
  },
});
export const deleteTop7 = mutation({ args: { id: v.id("top7") }, handler: async (ctx, { id }) => { await requireAdmin(ctx); await ctx.db.delete(id); } });
export const deleteWeeklyAward = mutation({
  args: { id: v.id("weeklyAwards") },
  handler: async (ctx, { id }) => { await requireAdmin(ctx); const a = await ctx.db.get(id); if (a?.backgroundId) await ctx.storage.delete(a.backgroundId); await ctx.db.delete(id); },
});
export const deleteFinalAward = mutation({
  args: { id: v.id("finalAwards") },
  handler: async (ctx, { id }) => { await requireAdmin(ctx); const a = await ctx.db.get(id); if (a?.imageId) await ctx.storage.delete(a.imageId); await ctx.db.delete(id); },
});
