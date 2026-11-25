-- Poggio Winter Cup · schema (solo cio' che serve alle funzioni approvate nell'anteprima v3)
create extension if not exists pgcrypto;
create or replace function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

create table teams(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text not null check (char_length(short_name) between 2 and 4),
  color_primary text, color_secondary text, logo_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table players(
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  first_name text not null, last_name text not null,
  shirt_number int not null check (shirt_number between 1 and 99),
  role text not null check (role in ('POR','DIF','CEN','ATT')),
  photo_path text,
  strengths text[] not null default '{}',
  retired_at timestamptz,            -- ritirato: resta nello storico, non selezionabile
  archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index players_team_number_uq on players(team_id, shirt_number) where retired_at is null and archived_at is null;
create index players_team_idx on players(team_id);

create table player_notes(
  player_id uuid primary key references players(id) on delete cascade,
  note text not null, is_public boolean not null default false,
  updated_at timestamptz not null default now());

create table transfers(
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id),
  from_team_id uuid not null references teams(id),
  to_team_id uuid not null references teams(id),
  transferred_at date not null default current_date, note text,
  created_at timestamptz not null default now(),
  check (from_team_id <> to_team_id));

create table matchdays(
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number > 0), play_date date);

create table matches(
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references matchdays(id),
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  kickoff timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','postponed','cancelled')),
  home_goals int check (home_goals >= 0), away_goals int check (away_goals >= 0),
  background_path text,                       -- foto di sfondo Match Day (green screen)
  background_visible boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (status <> 'finished' or (home_goals is not null and away_goals is not null)));
create index matches_day_idx on matches(matchday_id);

create table match_goals(          -- una riga = un gol
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id),
  team_id uuid not null references teams(id),   -- squadra del giocatore al momento del gol
  own_goal boolean not null default false,
  created_at timestamptz not null default now());
create index match_goals_match_idx on match_goals(match_id);
create index match_goals_player_idx on match_goals(player_id);

create table top7(
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid references matchdays(id),
  formation text not null check (formation in ('2-3-1','3-2-1','2-2-2','3-1-2')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table top7_slots(
  top7_id uuid not null references top7(id) on delete cascade,
  slot int not null check (slot between 1 and 7),
  player_id uuid not null references players(id),
  primary key (top7_id, slot), unique (top7_id, player_id));

create table weekly_awards(
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references matchdays(id),
  kind text not null check (kind in ('man_of_week','team_of_week')),
  player_id uuid references players(id), team_id uuid references teams(id),
  reason text, image_path text, is_published boolean not null default false,
  check ((kind='man_of_week' and player_id is not null) or (kind='team_of_week' and team_id is not null)));

create table final_awards(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('mvp','capocannoniere','miglior_portiere','custom')),
  title text not null, player_id uuid not null references players(id),
  reason text, image_path text, is_published boolean not null default false);

create table site_settings(key text primary key, value jsonb not null);
insert into site_settings values ('awards_unlocked','false'::jsonb);

create table news_articles(
  id uuid primary key default gen_random_uuid(),
  slug text not null unique, title text not null, subtitle text, body text not null,
  category text not null check (category in ('Trasferimenti','Comunicati ufficiali','Match Day','Risultati','Premi','Eventi','Novita del torneo')),
  image_path text,
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  is_featured boolean not null default false,
  published_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table knockout_matches(
  id uuid primary key default gen_random_uuid(),
  round text not null check (round in ('semi','final')), position int not null check (position between 1 and 2),
  team_a_id uuid references teams(id), team_b_id uuid references teams(id),
  score_a int, score_b int, extra_time boolean not null default false, pens_a int, pens_b int,
  winner_team_id uuid references teams(id),
  status text not null default 'scheduled' check (status in ('scheduled','live','finished')),
  played_at timestamptz, unique (round, position));
insert into knockout_matches(round,position) values ('semi',1),('semi',2),('final',1);

create table admin_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'admin' check (role in ('superadmin','admin')),
  created_at timestamptz not null default now());

create trigger t_upd before update on teams for each row execute function set_updated_at();
create trigger t_upd before update on players for each row execute function set_updated_at();
create trigger t_upd before update on matches for each row execute function set_updated_at();
create trigger t_upd before update on top7 for each row execute function set_updated_at();
create trigger t_upd before update on news_articles for each row execute function set_updated_at();

-- Staff di squadra: allenatore, presidente, capitano
alter table teams add column coach text, add column president text, add column captain_id uuid references players(id);
