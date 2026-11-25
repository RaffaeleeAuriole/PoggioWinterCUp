-- Classifica e statistiche: calcolate SEMPRE dai risultati (nessun contatore da tenere allineato)
create or replace view standings as
with res as (
  select home_team_id team_id, home_goals gf, away_goals ga from matches where status='finished'
  union all
  select away_team_id, away_goals, home_goals from matches where status='finished'),
agg as (
  select t.id team_id, t.slug, t.name, t.short_name, t.logo_path,
    count(r.team_id)::int pg,
    (count(*) filter (where r.gf > r.ga))::int w,
    (count(*) filter (where r.gf = r.ga))::int d,
    (count(*) filter (where r.gf < r.ga))::int l,
    coalesce(sum(r.gf),0)::int gf, coalesce(sum(r.ga),0)::int ga
  from teams t left join res r on r.team_id = t.id
  where t.archived_at is null group by t.id)
select row_number() over (order by (w*3+d) desc, (gf-ga) desc, gf desc, name) as pos,
  team_id, slug, name, short_name, logo_path, pg, w, d, l, gf, ga, (gf-ga) as gd, (w*3+d) as pts
from agg;

create or replace view scorers as
select p.id player_id, p.first_name, p.last_name, p.shirt_number, p.photo_path,
  t.id team_id, t.slug team_slug, t.name team_name, count(*)::int goals
from match_goals g
join matches m on m.id = g.match_id and m.status = 'finished'
join players p on p.id = g.player_id
join teams t on t.id = g.team_id
where not g.own_goal
group by p.id, t.id
order by goals desc, p.last_name;

-- Chiusura/correzione partita: atomica, rieseguibile senza doppi conteggi
create or replace function close_match(p_match uuid, p_home int, p_away int, p_goals jsonb default '[]'::jsonb)
returns void language plpgsql as $$
declare m matches%rowtype; g jsonb; v_home int := 0; v_away int := 0; tid uuid; own boolean; pid uuid;
begin
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Partita non trovata'; end if;
  if m.status = 'cancelled' then raise exception 'Partita annullata'; end if;
  if p_home < 0 or p_away < 0 then raise exception 'Risultato non valido'; end if;
  delete from match_goals where match_id = p_match;
  for g in select * from jsonb_array_elements(coalesce(p_goals,'[]'::jsonb)) loop
    tid := (g->>'team_id')::uuid; pid := (g->>'player_id')::uuid; own := coalesce((g->>'own_goal')::boolean,false);
    if tid not in (m.home_team_id, m.away_team_id) then raise exception 'Squadra del marcatore non valida'; end if;
    if not exists (select 1 from players where id = pid) then raise exception 'Giocatore non trovato'; end if;
    insert into match_goals(match_id, player_id, team_id, own_goal) values (p_match, pid, tid, own);
    if (tid = m.home_team_id) <> own then v_home := v_home + 1; else v_away := v_away + 1; end if;
  end loop;
  if v_home <> p_home or v_away <> p_away then
    raise exception 'I marcatori (%-%) non corrispondono al risultato (%-%)', v_home, v_away, p_home, p_away;
  end if;
  update matches set home_goals = p_home, away_goals = p_away, status = 'finished' where id = p_match;
end $$;

create or replace function transfer_player(p_player uuid, p_to uuid, p_date date default current_date, p_note text default null, p_new_number int default null)
returns void language plpgsql as $$
declare pl players%rowtype;
begin
  select * into pl from players where id = p_player for update;
  if not found then raise exception 'Giocatore non trovato'; end if;
  if pl.retired_at is not null or pl.archived_at is not null then raise exception 'Giocatore non attivo'; end if;
  if pl.team_id = p_to then raise exception 'Il giocatore e'' gia'' in questa squadra'; end if;
  insert into transfers(player_id, from_team_id, to_team_id, transferred_at, note) values (p_player, pl.team_id, p_to, p_date, p_note);
  update players set team_id = p_to, shirt_number = coalesce(p_new_number, shirt_number) where id = p_player;
end $$;  -- se il numero e' gia' occupato nella nuova rosa, l'indice univoco annulla tutto: l'admin sceglie un altro numero

create or replace function awards_unlocked() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select (value #>> '{}')::boolean from site_settings where key = 'awards_unlocked'), false) $$;

-- Man of the Week ricevuti: statistica del giocatore (si filtrera' per edizione quando arrivano le edizioni)
create or replace view motw_counts as
select player_id, count(*)::int motw from weekly_awards where kind = 'man_of_week' and is_published group by player_id;
