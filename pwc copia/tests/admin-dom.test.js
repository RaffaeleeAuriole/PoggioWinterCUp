// @vitest-environment jsdom
// Prova il modulo Risultati "per davvero" in un browser simulato: clic, campi, invio e cosa viene mandato al server.
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";

const load = (f) => new Function("window", "document", fs.readFileSync(new URL("../frontend/js/" + f, import.meta.url), "utf8"))(window, document);
const tick = () => new Promise((r) => setTimeout(r, 0));
const team = (id, name, ids) => ({ _id: id, name, shortName: name.slice(0, 2).toUpperCase(), colorPrimary: null, colorSecondary: null, logoUrl: null, coach: null, president: null, captainId: null, starId: null, players: ids.map((p, i) => ({ id: p, firstName: "G", lastName: p, shirtNumber: i + 1, role: "ATT", strengths: [], photoUrl: null })) });
const H = team("tH", "Alfa", ["h1", "h2"]), A = team("tA", "Beta", ["a1", "a2"]);
const match = { id: "m1", kickoff: null, status: "scheduled", homeGoals: null, awayGoals: null, walkover: false, home: H, away: A };
let calls, client;

beforeEach(() => {
  document.body.innerHTML = '<div id="adm-toast"></div><div id="adm-app"></div>';
  calls = [];
  client = {
    onUpdate(name, args, cb) { if (name === "public:teams") cb([H, A]); else if (name === "public:calendar") cb([{ id: "d1", number: 1, playDate: null, matches: [match] }]); else if (name === "public:matchDetail") cb({ match, matchdayNumber: 1, venue: null, goals: [] }); return () => {}; },
    mutation: async (name, args) => { calls.push({ name, args }); return null; },
  };
  load("render.js"); load("admin.js");
  window.PWC_ADMIN.mount(client);
  document.querySelector('[data-sec="results"]').click();
  const sel = document.querySelector("[data-match-select]"); sel.value = "m1"; sel.dispatchEvent(new window.Event("change", { bubbles: true }));
});

const form = () => document.querySelector('form[data-form="result"]');
const submit = async () => { form().dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); await tick(); await tick(); };
const closeCall = () => calls.find((c) => c.name === "admin:closeMatch");
const addRow = (side, own) => document.querySelector(`[data-act="add-row"][data-side="${side}"]${own ? '[data-own="1"]' : ":not([data-own])"}`).click();

describe("modulo Risultati nel browser simulato", () => {
  it("il modulo compare scegliendo la partita", () => { expect(form()).toBeTruthy(); expect(form().textContent).toContain("Aggiungi autogol"); });

  it("autogol: giocatore della Beta che segna nella propria porta = gol per l'Alfa", async () => {
    form().elements.homeGoals.value = "1"; form().elements.awayGoals.value = "0";
    addRow("home", true);
    document.querySelector('[data-rows-own="home"] [name=sp]').value = "a1";
    await submit();
    expect(closeCall().args).toEqual({ matchId: "m1", homeGoals: 1, awayGoals: 0, goals: [{ playerId: "a1", teamId: "tA", ownGoal: true }] });
  });
  it("marcatori normali di entrambe le squadre", async () => {
    form().elements.homeGoals.value = "2"; form().elements.awayGoals.value = "1";
    addRow("home", false); addRow("away", false);
    const h = document.querySelector('[data-rows="home"] .scorer'), a = document.querySelector('[data-rows="away"] .scorer');
    h.querySelector("[name=sp]").value = "h1"; h.querySelector("[name=sn]").value = "2"; a.querySelector("[name=sp]").value = "a2";
    await submit();
    expect(closeCall().args.goals).toEqual([{ playerId: "h1", teamId: "tH", ownGoal: false }, { playerId: "h1", teamId: "tH", ownGoal: false }, { playerId: "a2", teamId: "tA", ownGoal: false }]);
  });
  it("marcatori che non tornano col risultato: messaggio e nessun invio", async () => {
    form().elements.homeGoals.value = "2"; form().elements.awayGoals.value = "0";
    await submit();
    expect(closeCall()).toBeUndefined();
    expect(document.getElementById("adm-toast").textContent).toContain("non corrispondono");
  });
  it("vittoria a tavolino: solo il risultato, nessun marcatore", async () => {
    form().elements.walkover.checked = true; form().elements.homeGoals.value = "3"; form().elements.awayGoals.value = "0";
    addRow("home", false); document.querySelector('[data-rows="home"] [name=sp]').value = "h1";   // anche con una riga rimasta, col tavolino viene ignorata
    await submit();
    expect(closeCall().args).toEqual({ matchId: "m1", homeGoals: 3, awayGoals: 0, walkover: true, goals: [] });
  });
  it("riga marcatore senza giocatore: errore chiaro", async () => {
    form().elements.homeGoals.value = "1"; form().elements.awayGoals.value = "0"; addRow("home", false);
    await submit();
    expect(closeCall()).toBeUndefined();
    expect(document.getElementById("adm-toast").textContent).toContain("Scegli il giocatore");
  });
});
