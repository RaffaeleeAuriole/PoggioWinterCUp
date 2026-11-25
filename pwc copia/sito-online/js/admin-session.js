// Sessione admin nel browser (script classico, nessun build). Convex Auth ha client ufficiali solo per React:
// qui i token si gestiscono a mano come descrive la libreria (access token breve + refresh token che ruota a ogni rinnovo).
(function (root) {
  const KEY = "pwc.refresh";
  const jwtExp = (token) => { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { return 0; } };

  root.PWC_SESSION = function createAdminSession(client, storage) {
    storage = storage || root.sessionStorage;
    let access = null, refreshing = null;
    const save = (tk) => { access = tk.accessToken; storage.setItem(KEY, tk.refreshToken); };
    const clear = () => { access = null; storage.removeItem(KEY); };

    // Un solo rinnovo alla volta: il refresh token ruota e non va usato due volte in parallelo.
    function refresh() {
      if (!refreshing) refreshing = (async () => {
        const rt = storage.getItem(KEY);
        if (!rt) return null;
        const r = await client.mutation("auth:refreshSession", { refreshToken: rt });
        if (r.kind === "rotated") { save(r.tokens); return access; }
        clear(); return null;   // noSession: sessione scaduta o revocata
      })().finally(() => { refreshing = null; });
      return refreshing;
    }
    async function fetchToken({ forceRefreshToken }) {
      if (!forceRefreshToken && access && jwtExp(access) - Date.now() > 20000) return access;
      return await refresh();
    }
    return {
      async signIn(username, password) {
        const r = await client.mutation("auth:signInWithUsernamePassword", { username, password });
        if (r.status !== "complete") return { ok: false, error: r.userError?.error ?? "ERRORE" };
        save(r.tokens);
        // Il server conferma (true) o rifiuta (false) il token; null = nessuna risposta in 8 secondi.
        const accepted = await new Promise((res) => { const t = setTimeout(() => res(null), 8000); client.setAuth(fetchToken, (ok) => { clearTimeout(t); res(ok); }); });
        return { ok: true, accepted };
      },
      async resume() {   // al caricamento della pagina: riprende la sessione se c'e' un refresh token
        if (!storage.getItem(KEY)) return false;
        client.setAuth(fetchToken);
        return (await refresh()) !== null;
      },
      async signOut() {
        const rt = storage.getItem(KEY);
        clear();
        if (rt) { try { await client.mutation("auth:signOut", { refreshToken: rt }); } catch (e) { /* sessione gia' scaduta */ } }
      },
    };
  };
})(typeof window !== "undefined" ? window : globalThis);
