import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const ruolo = v.union(v.literal("POR"), v.literal("DIF"), v.literal("CEN"), v.literal("ATT"));

// Ogni dato appartiene a un'edizione (editionId): le edizioni archiviate non hanno nulla in comune con le nuove.
export default defineSchema({
  // Account admin: creati solo durante la configurazione iniziale (vedi users.js). Credenziali e sessioni stanno nei componenti di Convex Auth.
  users: defineTable({ createdAt: v.number() }),

  editions: defineTable({
    name: v.string(), year: v.number(),
    status: v.union(v.literal("active"), v.literal("archived")),
    venue: v.optional(v.string()), regulationId: v.optional(v.id("_storage")), regulationName: v.optional(v.string()), regulationUpdatedAt: v.optional(v.number()), awardsUnlocked: v.boolean(), homeMatchId: v.optional(v.id("matches")), createdAt: v.number(), closedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),

  teams: defineTable({
    editionId: v.id("editions"), slug: v.string(), name: v.string(), shortName: v.string(),
    colorPrimary: v.optional(v.string()), colorSecondary: v.optional(v.string()),
    logoId: v.optional(v.id("_storage")),
    coach: v.optional(v.string()), president: v.optional(v.string()), captainId: v.optional(v.id("players")), starId: v.optional(v.id("players")),   // "stella" della squadra, scelta dall'admin
   
    archived: v.boolean(),
  }).index("by_edition", ["editionId"]).index("by_edition_slug", ["editionId", "slug"]),

  players: defineTable({
    editionId: v.id("editions"), teamId: v.id("teams"),
    firstName: v.string(), lastName: v.string(), shirtNumber: v.number(), role: ruolo,
    photoId: v.optional(v.id("_storage")), strengths: v.array(v.string()),
    note: v.optional(v.string()), notePublic: v.optional(v.boolean()),
    retired: v.boolean(), archived: v.boolean(),   // ritirato: resta nello storico, non selezionabile
  }).index("by_team", ["teamId"]).index("by_edition", ["editionId"]),

  transfers: defineTable({
    editionId: v.id("editions"), playerId: v.id("players"),
    fromTeamId: v.id("teams"), toTeamId: v.id("teams"), date: v.string(), note: v.optional(v.string()),
  }).index("by_player", ["playerId"]),

  matchdays: defineTable({ editionId: v.id("editions"), number: v.number(), playDate: v.optional(v.string()) })
    .index("by_edition_number", ["editionId", "number"]),

  matches: defineTable({
    editionId: v.id("editions"), matchdayId: v.id("matchdays"),
    homeTeamId: v.id("teams"), awayTeamId: v.id("teams"), kickoff: v.optional(v.number()),
    status: v.union(v.literal("scheduled"), v.literal("live"), v.literal("finished"), v.literal("postponed"), v.literal("cancelled")),
    homeGoals: v.optional(v.number()), awayGoals: v.optional(v.number()),
    backgroundId: v.optional(v.id("_storage")),   // foto di sfondo Match Day (green screen)
    backgroundVisible: v.boolean(),
    walkover: v.optional(v.boolean()),   // vittoria a tavolino: risultato assegnato, nessun marcatore
  }).index("by_edition", ["editionId"]).index("by_matchday", ["matchdayId"]),

  matchGoals: defineTable({   // una riga = un gol
    editionId: v.id("editions"), matchId: v.id("matches"), playerId: v.id("players"),
    teamId: v.id("teams"), ownGoal: v.boolean(),
  }).index("by_match", ["matchId"]).index("by_player", ["playerId"]).index("by_edition", ["editionId"]),

  top7: defineTable({
    editionId: v.id("editions"), matchdayId: v.optional(v.id("matchdays")),
    formation: v.union(v.literal("2-3-1"), v.literal("3-2-1"), v.literal("2-2-2"), v.literal("3-1-2")),
    slots: v.array(v.object({ slot: v.number(), playerId: v.id("players") })), published: v.boolean(),
    wasPublished: v.optional(v.boolean()),   // true = e' stata pubblicata: resta nello storico pubblico; false = bozza o nascosta
  }).index("by_edition", ["editionId"]),

  weeklyAwards: defineTable({   // Man e Team of the Week: in home 7 giorni dalla pubblicazione, poi nello storico
    editionId: v.id("editions"), matchdayId: v.id("matchdays"),
    kind: v.union(v.literal("man_of_week"), v.literal("team_of_week")),
    playerId: v.optional(v.id("players")), teamId: v.optional(v.id("teams")),
    reason: v.optional(v.string()), backgroundId: v.optional(v.id("_storage")),
    published: v.boolean(), publishedAt: v.optional(v.number()),
    homeVisible: v.optional(v.boolean()),
  }).index("by_edition", ["editionId"]),

  finalAwards: defineTable({
    editionId: v.id("editions"),
    kind: v.union(v.literal("mvp"), v.literal("capocannoniere"), v.literal("miglior_portiere"), v.literal("custom")),
    title: v.string(), playerId: v.id("players"), reason: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")), published: v.boolean(),
  }).index("by_edition", ["editionId"]),

  news: defineTable({
    editionId: v.id("editions"), slug: v.string(), title: v.string(), subtitle: v.optional(v.string()), body: v.string(),
    category: v.string(), backgroundId: v.optional(v.id("_storage")),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("hidden")),
    deleted: v.boolean(), publishedAt: v.optional(v.number()),
    homeVisible: v.optional(v.boolean()),
  }).index("by_edition_status", ["editionId", "status"]),

  knockout: defineTable({   // semifinali: andata e ritorno; teamA = meglio classificata del girone
    editionId: v.id("editions"), round: v.union(v.literal("semi"), v.literal("final")), position: v.number(),
    teamAId: v.optional(v.id("teams")), teamBId: v.optional(v.id("teams")),
    legs: v.array(v.object({ scoreA: v.number(), scoreB: v.number() })),
    extraTime: v.optional(v.boolean()), pensA: v.optional(v.number()), pensB: v.optional(v.number()),   // supplementari/rigori: solo fasi finali
  }).index("by_edition", ["editionId"]),

  // Impostazioni del sito (una sola riga): per ora il logo, cambiabile solo dall'admin.
  siteSettings: defineTable({ logoId: v.optional(v.id("_storage")) }),
});
