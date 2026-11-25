import { getAuthUserId } from "@convex-dev/auth/server";

export async function activeEdition(ctx) {
  return await ctx.db.query("editions").withIndex("by_status", (q) => q.eq("status", "active")).first();
}

// Admin = account presente nella tabella "users". Gli account si creano solo durante la configurazione iniziale
// (ALLOW_ADMIN_SIGNUP=true, massimo MAX_ADMINS, di default 2): vedi users.js. Il controllo e' SEMPRE lato server.
export async function requireAdmin(ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Non autenticato");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Accesso riservato agli amministratori");
  return user;
}

export async function needEdition(ctx) {
  const e = await activeEdition(ctx);
  if (!e) throw new Error("Nessun torneo attivo");
  return e;
}

// Solo immagini JPG/PNG/WEBP fino a 5 MB (niente SVG): se non va bene il file caricato viene cancellato.
export async function assertImage(ctx, storageId) {
  const f = await ctx.db.system.get(storageId);
  if (!f || !["image/jpeg", "image/png", "image/webp"].includes(f.contentType) || f.size > 5 * 1024 * 1024) {
    if (f) await ctx.storage.delete(storageId);
    throw new Error("Immagine non valida (solo JPG, PNG, WEBP, max 5 MB)");
  }
}

// Lo slug resta stabile anche se il nome cambia (i link non si rompono).
export const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Solo PDF fino a 10 MB: se il file caricato non va bene viene cancellato.
export async function assertPdf(ctx, storageId) {
  const f = await ctx.db.system.get(storageId);
  if (!f || f.contentType !== "application/pdf" || f.size > 10 * 1024 * 1024) {
    if (f) await ctx.storage.delete(storageId);
    throw new Error("File non valido (solo PDF, max 10 MB)");
  }
}
