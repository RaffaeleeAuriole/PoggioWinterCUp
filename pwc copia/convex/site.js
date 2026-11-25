import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertImage, assertPdf, needEdition, requireAdmin } from "./lib";

// Logo del sito: solo admin. Senza storageId torna al logo originale incluso nel frontend.
export const setSiteLogo = mutation({
  args: { storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    if (storageId) await assertImage(ctx, storageId);
    const row = await ctx.db.query("siteSettings").first();
    if (row?.logoId && row.logoId !== storageId) await ctx.storage.delete(row.logoId);
    if (row) await ctx.db.patch(row._id, { logoId: storageId });
    else await ctx.db.insert("siteSettings", { logoId: storageId });
  },
});

// Regolamento: PDF caricato dall'admin per l'edizione in corso. Senza storageId lo rimuove.
export const setRegulation = mutation({
  args: { storageId: v.optional(v.id("_storage")), fileName: v.optional(v.string()) },
  handler: async (ctx, { storageId, fileName }) => {
    await requireAdmin(ctx);
    const ed = await needEdition(ctx);
    if (storageId) await assertPdf(ctx, storageId);
    if (ed.regulationId && ed.regulationId !== storageId) await ctx.storage.delete(ed.regulationId);
    await ctx.db.patch(ed._id, storageId
      ? { regulationId: storageId, regulationName: (fileName ?? "Regolamento.pdf").slice(0, 120), regulationUpdatedAt: Date.now() }
      : { regulationId: undefined, regulationName: undefined, regulationUpdatedAt: undefined });
  },
});
