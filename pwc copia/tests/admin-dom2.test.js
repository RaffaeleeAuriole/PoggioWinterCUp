// @vitest-environment jsdom
// Moduli Top 7, Man/Team of the Week e Premi nel browser simulato.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";

const load = (f) => new Function("window", "document", fs.readFileSync(new URL("../frontend/js/" + f, import.meta.url), "utf8"))(window, document);
const tick = () => new Promise((r) => setTimeout(r, 0));
const pl = (id, role) => ({ id, firstName: "G", lastName: id, shirtNumber: 1, role, strengths: [], photoUrl: null });
const team = (id, name, players) => ({ _id: id, name, shortName: name.slice(0, 2).toUpperCase(), colorPrimary: null, colorSecondary: null, logoUrl: null, coach: null, president: null, captainId: null, starId: null, players });
const H = team("tH", "Alfa", [pl("hg", "POR"), pl("h1", "ATT"), pl("h2", "ATT"), pl("h3", "ATT")]), A = team("tA", "Beta", [pl("a1", "ATT"), pl("a2", "ATT"), pl("a3", "ATT")]);
let calls, client;
globalThis.confirm = () => true;

beforeEach(() => {
  document.body.innerHTML = '<div id="adm-toast"></div><div id="adm-app"></div>';
  calls = [];
  client = {
    onUpdate(name, args, cb) { if (name === "public:teams") cb([H, A]); else if (name === "public:calendar") cb([{ id: "d1", number: 1, playDate: null, matches: [] }]); else if (name === "admin:listTop7") cb([]); else if (name === "admin:listFinalAwards") cb([]); else if (name === "public:weekly") cb({ current: [], history: [] }); else if (name === "public:finalAwards") cb({ unlocked: false, awards: [] }); return () => {}; },
    mutation: async (name, args) => { calls.push({ name, args }); return null; },
  };
  load("render.js"); load("admin.js");
  window.PWC_ADMIN.mount(client);
  document.querySelector('[data-sec="top7"]').click();
});

const change = (el, value) => { el.value = value; el.dispatchEvent(new window.Event("change", { bubbles: true })); };
const sel = (form, name) => document.querySelector(`form[data-form="${form}"] [name="${name}"]`);
const submit = async (form) => { document.querySelector(`form[data-form="${form}"]`).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await tick(); await tick(); };
const call = (name) => calls.find((c) => c.name === name);
const toast = () => document.getElementById("adm-toast").textContent;

describe("Top 7 nel browser simulato", () => {
  it("cambiando modulo le scelte restano e le etichette cambiano; si pubblica", async () => {
    change(sel("top7", "p0"), "hg");
    change(sel("top7", "formation"), "3-2-1");
    expect(document.querySelector('form[data-form="top7"]').textContent).toContain("Difensore 3");
    expect(sel("top7", "p0").value).toBe("hg");   // la scelta non si perde cambiando modulo
    ["h1", "h2", "h3", "a1", "a2", "a3"].forEach((id, i) => change(sel("top7", "p" + (i + 1)), id));
    document.querySelector('[data-act="top7-save"][data-publish="1"]').click(); await tick(); await tick();
    expect(call("content:saveTop7").args).toEqual({ formation: "3-2-1", playerIds: ["hg", "h1", "h2", "h3", "a1", "a2", "a3"], publish: true });
  });
  it("giocatore ripetuto o scelte mancanti: messaggio e nessun invio", async () => {
    change(sel("top7", "p0"), "hg"); change(sel("top7", "p1"), "h1");
    document.querySelector('[data-act="top7-save"][data-publish="0"]').click(); await tick();
    expect(call("content:saveTop7")).toBeUndefined(); expect(toast()).toContain("tutti e 7");
    ["hg", "h2", "h3", "a1", "a2", "a3"].forEach((id, i) => change(sel("top7", "p" + (i + 1)), id));   // hg ripetuto
    document.querySelector('[data-act="top7-save"][data-publish="0"]').click(); await tick();
    expect(toast()).toContain("due volte");
  });
});

describe("Man e Team of the Week", () => {
  it("MOTW: giornata, giocatore e motivazione", async () => {
    change(sel("motw", "matchdayId"), "d1"); change(sel("motw", "playerId"), "h1"); sel("motw", "reason").value = "Bravo";
    await submit("motw");
    expect(call("content:setWeeklyAward").args).toEqual({ matchdayId: "d1", kind: "man_of_week", playerId: "h1", reason: "Bravo" });
  });
  it("TOTW: serve la squadra", async () => {
    change(sel("totw", "matchdayId"), "d1");
    await submit("totw");
    expect(call("content:setWeeklyAward")).toBeUndefined(); expect(toast()).toContain("squadra");
    change(sel("totw", "teamId"), "tA"); await submit("totw");
    expect(call("content:setWeeklyAward").args).toEqual({ matchdayId: "d1", kind: "team_of_week", teamId: "tA" });
  });
});

describe("Premi finali", () => {
  beforeEach(() => document.querySelector('[data-sec="awards"]').click());
  it("assegna un premio (titolo di default dal tipo) e sblocca la sezione", async () => {
    change(sel("award", "playerId"), "a1");
    await submit("award");
    expect(call("content:assignFinalAward").args).toEqual({ kind: "mvp", title: "MVP", playerId: "a1", published: true });
    document.querySelector('[data-act="awards-toggle"]').click(); await tick();
    expect(call("content:setAwardsUnlocked").args).toEqual({ unlocked: true });
  });
  it("premio senza giocatore: errore chiaro", async () => {
    await submit("award");
    expect(call("content:assignFinalAward")).toBeUndefined(); expect(toast()).toContain("giocatore");
  });
});
