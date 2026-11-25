import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertImage, needEdition, requireAdmin, slugify } from "./lib";

const campi = { colorPrimary: v.optional(v.string()), colorSecondary: v.optional(v.string()), coach: v.optional(v.string()), president: v.optional(v.string()), logoId: v.optional(v.id("_storage")) };

export const createTeam = mutation({
  args: { name: v.string(), shortName: v.string(), ...campi },
  handler: async (ctx, a) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    const name = a.name.trim();
    if (!name || a.shortName.length < 2 || a.shortName.length > 4) throw new Error("Nome o sigla non validi");
    const slug = slugify(name);
    const dup = await ctx.db.query("teams").withIndex("by_edition_slug", (q) => q.eq("editionId", ed._id).eq("slug", slug)).first();
    if (dup) throw new Error("Esiste già una squadra con questo nome");
    if (a.logoId) await assertImage(ctx, a.logoId);
    return await ctx.db.insert("teams", { editionId: ed._id, slug, ...a, name, archived: false });
  },
});

export const updateTeam = mutation({
  args: { teamId: v.id("teams"), name: v.optional(v.string()), shortName: v.optional(v.string()), captainId: v.optional(v.id("players")), starId: v.optional(v.id("players")), ...campi },
  handler: async (ctx, { teamId, ...patch }) => {
    await requireAdmin(ctx);
    const t = await ctx.db.get(teamId);
    if (!t) throw new Error("Squadra non trovata");
    if (patch.captainId) { const p = await ctx.db.get(patch.captainId); if (!p || p.teamId !== teamId) throw new Error("Il capitano deve far parte della squadra"); }
    if (patch.starId) { const p = await ctx.db.get(patch.starId); if (!p || p.teamId !== teamId) throw new Error("La stella deve far parte della squadra"); }
    if (patch.logoId) { await assertImage(ctx, patch.logoId); if (t.logoId) await ctx.storage.delete(t.logoId); }
    await ctx.db.patch(teamId, patch);   // lo slug non cambia mai
  },
});

// "Elimina": se la squadra ha già giocatori o partite viene archiviata (storico intatto), altrimenti cancellata.
export const deleteTeam = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, { teamId }) => {
    await requireAdmin(ctx);
    const players = await ctx.db.query("players").withIndex("by_team", (q) => q.eq("teamId", teamId)).first();
    const matches = (await ctx.db.query("matches").collect()).some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    if (players || matches) { await ctx.db.patch(teamId, { archived: true }); return "archiviata"; }
    await ctx.db.delete(teamId); return "eliminata";
  },
});
