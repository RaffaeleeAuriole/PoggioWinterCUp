import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Registrazione admin: NON e' pubblica. Funziona solo se ALLOW_ADMIN_SIGNUP="true" (da attivare nel pannello Convex
// durante la configurazione iniziale e da disattivare subito dopo) e finché non si raggiunge MAX_ADMINS (default 2).
export const createUserPassword = internalMutation({
  args: { method: v.object({ name: v.string(), profile: v.any() }) },
  returns: v.id("users"),
  handler: async (ctx, _args) => {
    if (process.env.ALLOW_ADMIN_SIGNUP !== "true") throw new Error("Registrazione chiusa");
    const max = Number(process.env.MAX_ADMINS ?? "2");
    if ((await ctx.db.query("users").collect()).length >= max) throw new Error("Numero massimo di amministratori raggiunto");
    return await ctx.db.insert("users", { createdAt: Date.now() });
  },
});
