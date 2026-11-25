// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import vm from "node:vm";

const ctx = { atob, setTimeout, clearTimeout }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../frontend/js/admin-session.js", import.meta.url), "utf8"), ctx);
const createSession = ctx.PWC_SESSION;
const jwt = (expMs) => "h." + Buffer.from(JSON.stringify({ exp: Math.floor(expMs / 1000) })).toString("base64url") + ".s";
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

function fakeClient() {
  const c = { calls: [], authFn: null, n: 0 };
  c.accept = true; c.setAuth = (f, cb) => { c.authFn = f; cb && cb(c.accept); };
  c.mutation = async (name, args) => {
    c.calls.push(name);
    if (name === "auth:signInWithUsernamePassword") return args.password === "giusta" ? { status: "complete", tokens: { accessToken: jwt(Date.now() + 60000), refreshToken: "r1", refreshTokenExpiresAt: 1, userId: "u" } } : { status: "error", userError: { error: "INVALID_CREDENTIALS" } };
    if (name === "auth:refreshSession") { await new Promise((r) => setTimeout(r, 10)); return args.refreshToken === "r1" ? { kind: "rotated", tokens: { accessToken: jwt(Date.now() + 60000), refreshToken: "r2", refreshTokenExpiresAt: 1, userId: "u" } } : { kind: "noSession" }; }
    return null;
  };
  return c;
}

describe("sessione admin nel browser", () => {
  it("password sbagliata: nessuna sessione; giusta: token salvato e client autenticato", async () => {
    const c = fakeClient(), st = store(), s = createSession(c, st);
    expect(await s.signIn("admin", "sbagliata")).toEqual({ ok: false, error: "INVALID_CREDENTIALS" });
    expect(st.getItem("pwc.refresh")).toBeNull(); expect(c.authFn).toBeNull();
    expect(await s.signIn("admin", "giusta")).toEqual({ ok: true, accepted: true });
    expect(st.getItem("pwc.refresh")).toBe("r1");
    expect(await c.authFn({ forceRefreshToken: false })).toBeTruthy();
    expect(c.calls.filter((x) => x === "auth:refreshSession").length).toBe(0);   // token ancora valido: nessun rinnovo
  });
  it("se il server rifiuta il token lo segnala (accepted: false)", async () => {
    const c = fakeClient(); c.accept = false;
    expect(await createSession(c, store()).signIn("admin", "giusta")).toEqual({ ok: true, accepted: false });
  });
  it("rinnovo: un solo rinnovo anche con richieste in parallelo, e il refresh token ruota", async () => {
    const c = fakeClient(), st = store(), s = createSession(c, st);
    await s.signIn("admin", "giusta");
    const [a, b] = await Promise.all([c.authFn({ forceRefreshToken: true }), c.authFn({ forceRefreshToken: true })]);
    expect(a).toBe(b);
    expect(c.calls.filter((x) => x === "auth:refreshSession").length).toBe(1);
    expect(st.getItem("pwc.refresh")).toBe("r2");
  });
  it("al ricaricamento riprende la sessione; sessione scaduta = uscita; signOut cancella tutto", async () => {
    const c = fakeClient(), st = store();
    expect(await createSession(c, st).resume()).toBe(false);
    st.setItem("pwc.refresh", "r1");
    expect(await createSession(c, st).resume()).toBe(true);
    st.setItem("pwc.refresh", "vecchio");
    expect(await createSession(fakeClient(), st).resume()).toBe(false);
    expect(st.getItem("pwc.refresh")).toBeNull();
    const s = createSession(c, st); await s.signIn("admin", "giusta"); await s.signOut();
    expect(st.getItem("pwc.refresh")).toBeNull();
    expect(c.calls).toContain("auth:signOut");
  });
});
