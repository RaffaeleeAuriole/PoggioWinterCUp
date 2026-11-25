// @vitest-environment jsdom
// Trasferimenti, News, Match Day, Regolamento, Torneo e Tabellone nel browser simulato.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";

const load = (f) => new Function("window", "document", fs.readFileSync(new URL("../frontend/js/" + f, import.meta.url), "utf8"))(window, document);
const tick = () => new Promise((r) => setTimeout(r, 0));
const pl = (id) => ({ id, firstName: "G", lastName: id, shirtNumber: 1, role: "ATT", strengths: [], photoUrl: null });
const team = (id, name, players) => ({ _id: id, name, shortName: name.slice(0, 2).toUpperCase(), colorPrimary: null, colorSecondary: null, logoUrl: null, coach: null, president: null, captainId: null, starId: null, players });
const H = team("tH", "Alfa", [pl("h1")]), A = team("tA", "Beta", [pl("a1")]);
const match = { id: "m1", kickoff: null, status: "scheduled", homeGoals: null, awayGoals: null, walkover: false, home: H, away: A };
const ko = [{ round: "semi", position: 1, legs: [] }, { round: "semi", position: 2, legs: [] }, { round: "final", position: 1, legs: [] }];
const news = [{ id: "n1", title: "Titolo", subtitle: "", body: "Corpo", category: "Risultati", status: "published", publishedAt: 1, backgroundUrl: null }];
let calls, confirmAnswer;
globalThis.confirm = () => confirmAnswer;

beforeEach(() => {
  document.body.innerHTML = '<div id="adm-toast"></div><div id="adm-app"></div>';
  calls = []; confirmAnswer = true;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ storageId: "s1" }) });
  const data = { "public:teams": [H, A], "public:calendar": [{ id: "d1", number: 1, playDate: null, matches: [match] }], "admin:listNews": news, "admin:listTransfers": [], "public:homeMatchDay": null, "public:regulation": null, "public:editions": [{ _id: "e1", name: "Winter Cup 2026", year: 2026, status: "active" }], "public:knockout": ko, "admin:listTop7": [], "admin:listFinalAwards": [], "public:weekly": { current: [], history: [] }, "public:finalAwards": { unlocked: false, awards: [] } };
  const client = {
    onUpdate(name, args, cb) { if (name in data) cb(data[name]); return () => {}; },
    mutation: async (name, args) => { calls.push({ name, args }); if (name === "files:generateUploadUrl") return "https://u.example/up"; if (name === "content:saveNews") return "n1"; return null; },
  };
  load("render.js"); load("admin.js");
  window.PWC_ADMIN.mount(client);
});

const go = (sec) => document.querySelector(`[data-sec="${sec}"]`).click();
const form = (k, extra = "") => document.querySelector(`form[data-form="${k}"]${extra}`);
const set = (f, name, value) => { f.elements[name].value = value; };
const submit = async (f) => { f.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await tick(); await tick(); };
const click = async (sel, root = document) => { root.querySelector(sel).click(); await tick(); await tick(); };
const call = (n) => calls.find((c) => c.name === n);
const toast = () => document.getElementById("adm-toast").textContent;
const withFile = (input, file) => Object.defineProperty(input, "files", { value: [file], configurable: true });

describe("Trasferimenti", () => {
  beforeEach(() => go("transfers"));
  it("manda i dati giusti; senza squadra rifiuta", async () => {
    const f = form("transfer"); set(f, "playerId", "h1"); set(f, "date", "2026-11-24"); await submit(f);
    expect(call("admin:transferPlayer")).toBeUndefined(); expect(toast()).toContain("nuova squadra");
    set(f, "toTeamId", "tA"); set(f, "newNumber", "7"); set(f, "note", "x"); await submit(f);
    expect(call("admin:transferPlayer").args).toEqual({ playerId: "h1", toTeamId: "tA", date: "2026-11-24", newNumber: 7, note: "x" });
  });
});

describe("News", () => {
  beforeEach(() => go("news"));
  const nuova = () => form("news", ":not([data-id])");
  it("salva e pubblica: due chiamate; bozza: una sola", async () => {
    const f = nuova(); set(f, "title", "Ciao"); set(f, "category", "Eventi"); set(f, "body", "Testo");
    await click('[data-publish="1"]', f);
    expect(call("content:saveNews").args).toEqual({ title: "Ciao", subtitle: "", body: "Testo", category: "Eventi" });
    expect(call("content:setNewsStatus").args).toEqual({ id: "n1", status: "published" });
    calls.length = 0;
    const g = nuova(); set(g, "title", "Bozza"); set(g, "category", "Eventi"); set(g, "body", "T"); await click('[data-publish="0"]', g);
    expect(call("content:saveNews")).toBeTruthy(); expect(call("content:setNewsStatus")).toBeUndefined();
  });
  it("senza titolo: messaggio e nessun invio", async () => {
    await click('[data-publish="1"]', nuova());
    expect(call("content:saveNews")).toBeUndefined(); expect(toast()).toContain("titolo");
  });
  it("modifica una news esistente e cambia lo stato", async () => {
    const f = form("news", '[data-id="n1"]'); set(f, "title", "Nuovo titolo"); await click('[data-publish="keep"]', f);
    expect(call("content:saveNews").args).toMatchObject({ id: "n1", title: "Nuovo titolo" }); expect(call("content:setNewsStatus")).toBeUndefined();
    await click('[data-act="news-hide"]'); expect(call("content:setNewsStatus").args).toEqual({ id: "n1", status: "hidden" });
  });
});

describe("Match Day", () => {
  beforeEach(() => go("matchday"));
  it("pubblica in home (con e senza sfondo)", async () => {
    const f = form("matchday"); await submit(f);
    expect(call("matches:setHomeMatchDay")).toBeUndefined(); expect(toast()).toContain("partita");
    set(f, "matchId", "m1"); await submit(f);
    expect(call("matches:setMatchBackground")).toBeUndefined(); expect(call("matches:setHomeMatchDay").args).toEqual({ matchId: "m1" });
    calls.length = 0; withFile(f.elements.bg, new File(["x"], "sfondo.png", { type: "image/png" })); await submit(f);
    expect(calls.map((c) => c.name)).toEqual(["files:generateUploadUrl", "matches:setMatchBackground", "matches:setHomeMatchDay"]);
    expect(call("matches:setMatchBackground").args).toEqual({ matchId: "m1", storageId: "s1" });
  });
});

describe("Regolamento", () => {
  beforeEach(() => go("rules"));
  it("carica un PDF; un altro formato viene rifiutato", async () => {
    const f = form("rules"); await submit(f); expect(toast()).toContain("PDF");
    withFile(f.elements.pdf, new File(["x"], "reg.docx", { type: "application/msword" })); await submit(f);
    expect(call("site:setRegulation")).toBeUndefined(); expect(toast()).toContain("PDF");
    withFile(f.elements.pdf, new File(["%PDF"], "reg.pdf", { type: "application/pdf" })); await submit(f);
    expect(call("site:setRegulation").args).toEqual({ storageId: "s1", fileName: "reg.pdf" });
  });
});

describe("Torneo e logo", () => {
  beforeEach(() => go("edition"));
  it("nuovo torneo: chiede conferma e controlla i dati", async () => {
    const f = form("edition-new"); set(f, "year", "1800"); set(f, "name", "X"); await submit(f); expect(toast()).toContain("anno");
    set(f, "year", "2027"); set(f, "name", "Winter Cup 2027"); set(f, "venue", "Campo"); confirmAnswer = false; await submit(f);
    expect(call("admin:createEdition")).toBeUndefined();
    confirmAnswer = true; await submit(f);
    expect(call("admin:createEdition").args).toEqual({ name: "Winter Cup 2027", year: 2027, venue: "Campo" });
  });
  it("chiudi torneo e logo", async () => {
    await click('[data-act="edition-close"]'); expect(call("admin:closeTournament")).toBeTruthy();
    const f = form("logo"); await submit(f); expect(toast()).toContain("logo");
    withFile(f.elements.logo, new File(["x"], "l.png", { type: "image/png" })); await submit(f);
    expect(call("site:setSiteLogo").args).toEqual({ storageId: "s1" });
    await click('[data-act="logo-reset"]'); expect(calls.filter((c) => c.name === "site:setSiteLogo").pop().args).toEqual({});
  });
});

describe("Tabellone", () => {
  beforeEach(() => go("bracket"));
  const semi = () => form("ko", '[data-round="semi"][data-pos="1"]');
  it("semifinale andata e ritorno con controlli", async () => {
    const f = semi(); set(f, "teamAId", "tH"); set(f, "teamBId", "tH"); await submit(f); expect(toast()).toContain("diverse");
    set(f, "teamBId", "tA"); set(f, "l0a", "1"); set(f, "l0b", "0"); set(f, "l1a", "1"); await submit(f); expect(toast()).toContain("Completa");
    set(f, "l1b", "1"); await submit(f);
    expect(call("content:setKnockout").args).toEqual({ round: "semi", position: 1, teamAId: "tH", teamBId: "tA", legs: [{ scoreA: 1, scoreB: 0 }, { scoreA: 1, scoreB: 1 }], extraTime: false });
  });
  it("finale con supplementari e rigori; rigori incompleti rifiutati", async () => {
    const f = form("ko", '[data-round="final"]'); set(f, "l0a", "2"); set(f, "l0b", "2"); f.elements.extraTime.checked = true; set(f, "pensA", "4");
    await submit(f); expect(toast()).toContain("rigori");
    set(f, "pensB", "3"); await submit(f);
    expect(call("content:setKnockout").args).toEqual({ round: "final", position: 1, legs: [{ scoreA: 2, scoreB: 2 }], extraTime: true, pensA: 4, pensB: 3 });
  });
});
