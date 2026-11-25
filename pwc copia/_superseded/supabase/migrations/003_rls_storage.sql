-- Il browser legge soltanto (chiave anon). Tutte le scritture passano dal backend PHP con service_role.
do $$ declare t text; begin
  foreach t in array array['teams','players','player_notes','transfers','matchdays','matches','match_goals','top7','top7_slots','weekly_awards','final_awards','site_settings','news_articles','knockout_matches','admin_profiles']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;

create policy pub_teams on teams for select to anon, authenticated using (archived_at is null);
create policy pub_players on players for select to anon, authenticated using (archived_at is null);
create policy pub_notes on player_notes for select to anon, authenticated using (is_public);
create policy pub_transfers on transfers for select to anon, authenticated using (true);
create policy pub_matchdays on matchdays for select to anon, authenticated using (true);
create policy pub_matches on matches for select to anon, authenticated using (true);
create policy pub_goals on match_goals for select to anon, authenticated using (true);
create policy pub_top7 on top7 for select to anon, authenticated using (is_published);
create policy pub_top7_slots on top7_slots for select to anon, authenticated using (exists (select 1 from top7 x where x.id = top7_id and x.is_published));
create policy pub_weekly on weekly_awards for select to anon, authenticated using (is_published);
create policy pub_final on final_awards for select to anon, authenticated using (is_published and awards_unlocked());
create policy pub_news on news_articles for select to anon, authenticated using (status='published' and deleted_at is null and published_at <= now());
create policy pub_knockout on knockout_matches for select to anon, authenticated using (true);
-- site_settings e admin_profiles: nessuna policy = nessun accesso dal browser

grant select on standings, scorers to anon, authenticated;
revoke all on function close_match(uuid,int,int,jsonb) from public, anon, authenticated;
revoke all on function transfer_player(uuid,uuid,date,text,int) from public, anon, authenticated;

-- Storage: bucket pubblico in lettura, solo immagini (niente SVG), 5 MB. Upload solo da PHP (service_role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media','media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy media_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
grant select on motw_counts to anon, authenticated;
