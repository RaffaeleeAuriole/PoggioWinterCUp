import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertImage, needEdition, requireAdmin } from "./lib";

const ruolo = v.union(v.literal("POR"), v.literal("DIF"), v.literal("CEN"), v.literal("ATT"));

async function numeroLibero(ctx, teamId, n, exceptId) {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("Numero di maglia non valido (1-99)");
  const rosa = await ctx.db.query("players").withIndex("by_team", (q) => q.eq("teamId", teamId)).collect();
  if (rosa.some((p) => p._id !== exceptId && !p.retired && !p.archived && p.shirtNumber === n)) throw new Error("Numero di maglia già occupato nella rosa");
}

export const createPlayer = mutation({
  args: { teamId: v.id("teams"), firstName: v.string(), lastName: v.string(), shirtNumber: v.number(), role: ruolo, strengths: v.optional(v.array(v.string())), photoId: v.optional(v.id("_storage")), note: v.optional(v.string()), notePublic: v.optional(v.boolean()) },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const t = await ctx.db.get(a.teamId);
    if (!t || t.editionId !== ed._id) throw new Error("Squadra non valida");
    await numeroLibero(ctx, a.teamId, a.shirtNumber);
    if (a.photoId) await assertImage(ctx, a.photoId);
    return await ctx.db.insert("players", { editionId: ed._id, ...a, strengths: a.strengths ?? [], retired: false, archived: false });
  },
});

export const updatePlayer = mutation({
  args: { playerId: v.id("players"), firstName: v.optional(v.string()), lastName: v.optional(v.string()), shirtNumber: v.optional(v.number()), role: v.optional(ruolo), strengths: v.optional(v.array(v.string())), photoId: v.optional(v.id("_storage")), note: v.optional(v.string()), notePublic: v.optional(v.boolean()) },
  handler: async (ctx, { playerId, ...patch }) => {
    await requireAdmin(ctx);
    const p = await ctx.db.get(playerId);
    if (!p) throw new Error("Giocatore non trovato");
    if (patch.shirtNumber !== undefined) await numeroLibero(ctx, p.teamId, patch.shirtNumber, playerId);
    if (patch.photoId) { await assertImage(ctx, patch.photoId); if (p.photoId) await ctx.storage.delete(p.photoId); }
    await ctx.db.patch(playerId, patch);
  },
});

// Ritiro: resta nello storico (gol, foto, squadra) ma non è più selezionabile.
export const retirePlayer = mutation({ args: { playerId: v.id("players") }, handler: async (ctx, { playerId }) => { await requireAdmin(ctx); await ctx.db.patch(playerId, { retired: true }); } });

// "Elimina": se ha gol o trasferimenti viene archiviato, altrimenti cancellato.
export const deletePlayer = mutation({
  args: { playerId: v.id("players") },
  handler: async (ctx, { playerId }) => {
    await requireAdmin(ctx);
    const gol = await ctx.db.query("matchGoals").withIndex("by_player", (q) => q.eq("playerId", playerId)).first();
    const tr = await ctx.db.query("transfers").withIndex("by_player", (q) => q.eq("playerId", playerId)).first();
    if (gol || tr) { await ctx.db.patch(playerId, { archived: true }); return "archiviato"; }
    await ctx.db.delete(playerId); return "eliminato";
  },
});
