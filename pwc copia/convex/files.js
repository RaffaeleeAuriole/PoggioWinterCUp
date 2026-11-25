import { mutation } from "./_generated/server";
import { requireAdmin } from "./lib";

// Passo 1 dell'upload: l'admin ottiene un URL temporaneo, carica il file, poi allega l'id alla squadra/giocatore/news/ecc.
export const generateUploadUrl = mutation({ args: {}, handler: async (ctx) => { await requireAdmin(ctx); return await ctx.storage.generateUploadUrl(); } });
