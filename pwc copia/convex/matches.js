import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertImage, needEdition, requireAdmin } from "./lib";

export const createMatchday = mutation({
  args: { number: v.number(), playDate: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const dup = await ctx.db.query("matchdays").withIndex("by_edition_number", (q) => q.eq("editionId", ed._id).eq("number", a.number)).first();
    if (dup) throw new Error("Giornata già esistente");
    return await ctx.db.insert("matchdays", { editionId: ed._id, ...a });
  },
});

export const createMatch = mutation({
  args: { matchdayId: v.id("matchdays"), homeTeamId: v.id("teams"), awayTeamId: v.id("teams"), kickoff: v.optional(v.number()) },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const [md, h, w] = await Promise.all([ctx.db.get(a.matchdayId), ctx.db.get(a.homeTeamId), ctx.db.get(a.awayTeamId)]);
    if (!md || md.editionId !== ed._id || !h || h.editionId !== ed._id || !w || w.editionId !== ed._id) throw new Error("Dati non validi");
    if (a.homeTeamId === a.awayTeamId) throw new Error("Una squadra non può giocare contro se stessa");
    return await ctx.db.insert("matches", { editionId: ed._id, ...a, status: "scheduled", backgroundVisible: true });
  },
});

// Lo stato "finita" si imposta solo con closeMatch (che registra anche i marcatori).
export const updateMatch = mutation({
  args: { matchId: v.id("matches"), kickoff: v.optional(v.number()), status: v.optional(v.union(v.literal("scheduled"), v.literal("live"), v.literal("postponed"), v.literal("cancelled"))) },
  handler: async (ctx, { matchId, ...patch }) => { await requireAdmin(ctx); await ctx.db.patch(matchId, patch); },
});

// Sfondo "green screen" del Match Day: sostituisce il precedente; senza storageId lo rimuove.
export const setMatchBackground = mutation({
  args: { matchId: v.id("matches"), storageId: v.optional(v.id("_storage")), visible: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const m = await ctx.db.get(a.matchId);
    if (!m) throw new Error("Partita non trovata");
    const patch = {};
    if (a.visible !== undefined) patch.backgroundVisible = a.visible;
    if (a.storageId) {
      await assertImage(ctx, a.storageId);
      if (m.backgroundId) await ctx.storage.delete(m.backgroundId);
      patch.backgroundId = a.storageId;
    } else if (a.visible === undefined) {   // nessun file e nessun cambio di visibilità = rimuovi lo sfondo
      if (m.backgroundId) await ctx.storage.delete(m.backgroundId);
      patch.backgroundId = undefined;
    }
    await ctx.db.patch(a.matchId, patch);
  },
});

// In home c'è UN solo Match Day: impostarne uno nuovo toglie automaticamente quello vecchio.
export const setHomeMatchDay = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const m = await ctx.db.get(matchId);
    if (!m || m.editionId !== ed._id) throw new Error("Partita non valida");
    await ctx.db.patch(ed._id, { homeMatchId: matchId });
  },
});

export const updateMatchday = mutation({
  args: { matchdayId: v.id("matchdays"), playDate: v.optional(v.string()) },
  handler: async (ctx, { matchdayId, playDate }) => { await requireAdmin(ctx); await ctx.db.patch(matchdayId, { playDate: playDate || undefined }); },
});

// Elimina una partita (anche gia' giocata): marcatori, classifica e statistiche si ricalcolano da soli.
export const deleteMatch = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, { matchId }) => {
    await requireAdmin(ctx);
    const m = await ctx.db.get(matchId);
    if (!m) throw new Error("Partita non trovata");
    for (const g of await ctx.db.query("matchGoals").withIndex("by_match", (q) => q.eq("matchId", matchId)).collect()) await ctx.db.delete(g._id);
    const ed = await ctx.db.get(m.editionId);
    if (ed?.homeMatchId === matchId) await ctx.db.patch(ed._id, { homeMatchId: undefined });
    if (m.backgroundId) await ctx.storage.delete(m.backgroundId);
    await ctx.db.delete(matchId);
  },
});

export const deleteMatchday = mutation({
  args: { matchdayId: v.id("matchdays") },
  handler: async (ctx, { matchdayId }) => {
    await requireAdmin(ctx);
    if (await ctx.db.query("matches").withIndex("by_matchday", (q) => q.eq("matchdayId", matchdayId)).first()) throw new Error("La giornata ha ancora partite: eliminale prima");
    await ctx.db.delete(matchdayId);
  },
});

export const clearHomeMatchDay = mutation({
  args: {},
  handler: async (ctx) => { await requireAdmin(ctx); const ed = await needEdition(ctx); await ctx.db.patch(ed._id, { homeMatchId: undefined }); },
});
