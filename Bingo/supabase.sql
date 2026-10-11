-- BINGO CLUB · Ejecutar completo en el SQL Editor de Supabase.
-- Organizadores: Supabase Auth. Jugadores: nombre y token de cartón.
begin;
create table if not exists public.bingo_rooms (
  code text primary key,
  title text not null check (char_length(title) between 1 and 60),
  host_token uuid not null,
  drawn integer[] not null default '{}',
  winner uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.bingo_players (
  token uuid primary key,
  room_code text not null references public.bingo_rooms(code) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  card integer[] not null check (cardinality(card)=25),
  created_at timestamptz not null default now()
);
create index if not exists bingo_players_room_idx on public.bingo_players(room_code);
-- Migración compatible con salas y cartones existentes. Puede ejecutarse de nuevo.
alter table public.bingo_rooms add column if not exists round_number integer not null default 1;
alter table public.bingo_rooms add column if not exists stages text[] not null default array['full'];
alter table public.bingo_rooms add column if not exists stage_index integer not null default 0;
alter table public.bingo_rooms add column if not exists awards jsonb not null default '[]'::jsonb;
alter table public.bingo_rooms add column if not exists owner_id uuid references auth.users(id);
alter table public.bingo_rooms add column if not exists claim_alert jsonb;
alter table public.bingo_rooms add column if not exists claim_token uuid;
create index if not exists bingo_rooms_owner_idx on public.bingo_rooms(owner_id);
alter table public.bingo_rooms enable row level security;
alter table public.bingo_players enable row level security;
revoke all on public.bingo_rooms, public.bingo_players from anon, authenticated;

-- Índices SQL de 1 a 25; el centro libre está en la posición 13.
create or replace function public.bingo_matches(p_card integer[], p_drawn integer[], p_pattern text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  marked boolean[];
  i integer;
begin
  if p_card is null or cardinality(p_card) <> 25 or p_drawn is null then return false; end if;
  select array_agg(x=0 or x=any(p_drawn) order by ord) into marked from unnest(p_card) with ordinality as cells(x,ord);
  if p_pattern='full' then return not exists(select 1 from unnest(marked) m where not m); end if;
  if p_pattern='corners' then return marked[1] and marked[5] and marked[21] and marked[25]; end if;
  if p_pattern='x' then return marked[1] and marked[7] and marked[13] and marked[19] and marked[25] and marked[5] and marked[9] and marked[17] and marked[21]; end if;
  if p_pattern in ('line_B','line_I','line_N','line_G','line_O') then
    i:=strpos('BINGO',right(p_pattern,1));
    return marked[i] and marked[i+5] and marked[i+10] and marked[i+15] and marked[i+20];
  end if;
  if p_pattern='line' then
    for i in 0..4 loop
      if marked[i*5+1] and marked[i*5+2] and marked[i*5+3] and marked[i*5+4] and marked[i*5+5] then return true; end if;
      if marked[i+1] and marked[i+6] and marked[i+11] and marked[i+16] and marked[i+21] then return true; end if;
    end loop;
    return (marked[1] and marked[7] and marked[13] and marked[19] and marked[25]) or (marked[5] and marked[9] and marked[13] and marked[17] and marked[21]);
  end if;
  return false;
end;
$$;
revoke all on function public.bingo_matches(integer[],integer[],text) from public, anon, authenticated;

-- Único acceso público: operaciones controladas. No se exponen tokens ni cartones ajenos.
create or replace function public.bingo_api(p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.bingo_rooms%rowtype;
  p public.bingo_players%rowtype;
  v_code text := upper(trim(p_data->>'code'));
  v_token uuid := (p_data->>'token')::uuid;
  v_name text := trim(p_data->>'name');
  v_title text := trim(p_data->>'title');
  v_card integer[] := array_fill(0, array[25]);
  v_column integer[];
  v_stages text[];
  v_user uuid := auth.uid();
  v_host boolean := false;
  v_valid boolean;
  c integer;
  j integer;
  n integer;
begin
  if p_action not in ('create','join','state','draw','claim','approve_claim','reject_claim','advance','restart','configure','lookup','rooms','adopt') or p_action is null then
    raise exception 'Operación no válida.';
  end if;
  if p_action in ('create','rooms','adopt','draw','approve_claim','reject_claim','advance','restart','configure') and v_user is null then
    raise exception 'Inicia sesión como organizador.';
  end if;
  if p_action='rooms' then
    return coalesce((select jsonb_agg(jsonb_build_object('code',br.code,'title',br.title) order by br.created_at desc) from public.bingo_rooms br where br.owner_id=v_user),'[]'::jsonb);
  end if;
  if p_action='lookup' then
    select * into r from public.bingo_rooms where code=v_code;
    if not found then raise exception 'No encontramos esa sala. Revisa el código.'; end if;
    return jsonb_build_object('code',r.code,'title',r.title,'open',cardinality(r.drawn)=0);
  end if;
  if p_action in ('join','claim','adopt') and v_token is null then raise exception 'Falta la identificación de la sesión.'; end if;
  if p_action in ('create','restart','configure') then
    if jsonb_typeof(p_data->'stages') is distinct from 'array' then raise exception 'Selecciona un estilo de juego válido.'; end if;
    select array_agg(value order by ord) into v_stages from jsonb_array_elements_text(p_data->'stages') with ordinality as s(value,ord);
    if v_stages is null or not(v_stages=array['full'] or v_stages=array['line','full'] or (cardinality(v_stages)=2 and v_stages[1] in ('line_B','line_I','line_N','line_G','line_O') and v_stages[2]='full') or v_stages=array['corners','full'] or v_stages=array['x','full']) then raise exception 'Selecciona un estilo de juego válido.'; end if;
  end if;
  if p_action = 'create' then
    if v_title is null or char_length(v_title) not between 1 and 60 then raise exception 'Escribe un nombre de fiesta de hasta 60 caracteres.'; end if;
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
      begin
        insert into public.bingo_rooms(code,title,host_token,stages,owner_id) values(v_code,v_title,gen_random_uuid(),v_stages,v_user) returning * into r;
        v_host := true;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
  else
    -- Serializa sorteo, inscripción y reclamo para evitar números repetidos o ganadores simultáneos.
    select * into r from public.bingo_rooms where code=v_code for update;
    if not found then raise exception 'No encontramos esa sala. Revisa el código.'; end if;
    -- Migrar una sala antigua exige iniciar sesión y poseer su antiguo token privado.
    if p_action='adopt' then
      if r.owner_id is not null or r.host_token is distinct from v_token then raise exception 'Esta sala no se puede vincular a tu cuenta.'; end if;
      update public.bingo_rooms set owner_id=v_user,host_token=gen_random_uuid() where code=v_code returning * into r;
    end if;
    v_host := v_user is not null and r.owner_id=v_user;
    if p_action in ('draw','claim','approve_claim','reject_claim','advance','restart','configure') then
      if (p_data->>'round')::integer is distinct from r.round_number or (p_data->>'stage')::integer is distinct from r.stage_index then
        raise exception 'La ronda o el premio cambió. Actualiza la sala y vuelve a intentarlo.';
      end if;
    end if;
    if p_action in ('draw','approve_claim','reject_claim','advance','restart','configure') and not coalesce(v_host,false) then raise exception 'Solo el dueño de esta sala puede cambiar el sorteo.'; end if;
    if p_action = 'join' then
      select * into p from public.bingo_players where token=v_token and room_code=v_code;
      if not found then
        if cardinality(r.drawn)>0 then raise exception 'El sorteo ya empezó. Podrás entrar cuando reinicien la ronda.'; end if;
        if v_name is null or char_length(v_name) not between 1 and 30 then raise exception 'Escribe un nombre de hasta 30 caracteres.'; end if;
        if (select count(*) from public.bingo_players where room_code=v_code)>=200 then raise exception 'La sala está llena (200 jugadores).'; end if;
        for c in 0..4 loop
          select array_agg(x order by x) into v_column from (select g as x from generate_series(c*15+1,c*15+15) g order by random() limit 5) chosen;
          for j in 0..4 loop v_card[j*5+c+1] := v_column[j+1]; end loop;
        end loop;
        v_card[13] := 0;
        insert into public.bingo_players(token,room_code,name,card) values(v_token,v_code,v_name,v_card);
      end if;
    elsif p_action = 'draw' then
      if r.claim_token is not null then raise exception 'Revisa el reclamo antes de seguir sorteando.'; end if;
      if r.winner is not null then raise exception 'Este premio ya tiene ganador. Continúa al siguiente o reinicia la ronda.'; end if;
      select g into n from generate_series(1,75) g where not (g=any(r.drawn)) order by random() limit 1;
      if n is null then raise exception 'Ya salieron todos los números.'; end if;
      update public.bingo_rooms set drawn=array_append(drawn,n) where code=v_code returning * into r;
    elsif p_action = 'claim' then
      if r.claim_token is not null then raise exception 'Hay un reclamo en revision. Espera al organizador.'; end if;
      select * into p from public.bingo_players where token=v_token and room_code=v_code;
      if not found then raise exception 'Primero debes unirte a la sala.'; end if;
      if r.winner is not null then raise exception 'Este premio ya tiene un ganador.'; end if;
      update public.bingo_rooms set claim_token=v_token,claim_alert=jsonb_build_object('id',gen_random_uuid(),'name',p.name,'status','pending','pattern',r.stages[r.stage_index+1],'round',r.round_number,'stage',r.stage_index) where code=v_code returning * into r;
    elsif p_action in ('approve_claim','reject_claim') then
      if r.claim_token is null or p_data->>'claim_id' is distinct from r.claim_alert->>'id' then raise exception 'Este reclamo ya cambio o fue revisado.'; end if;
      if p_action='approve_claim' then
        update public.bingo_rooms set winner=claim_token,claim_token=null,claim_alert=jsonb_set(claim_alert,'{status}','"approved"'),
          awards=awards||jsonb_build_array(jsonb_build_object('name',r.claim_alert->>'name','pattern',r.stages[r.stage_index+1],'stage',r.stage_index,'round',r.round_number)) where code=v_code returning * into r;
      else
        update public.bingo_rooms set claim_token=null,claim_alert=jsonb_set(claim_alert,'{status}','"rejected"') where code=v_code returning * into r;
      end if;
    elsif p_action = 'advance' then
      if r.winner is null or r.stage_index>=cardinality(r.stages)-1 then raise exception 'No hay un siguiente premio disponible.'; end if;
      update public.bingo_rooms set stage_index=stage_index+1,winner=null,claim_alert=null,claim_token=null where code=v_code returning * into r;
    elsif p_action in ('restart','configure') then
      if p_action='configure' and (cardinality(r.drawn)>0 or r.winner is not null or jsonb_array_length(r.awards)>0) then raise exception 'Cambia el estilo al reiniciar la ronda.'; end if;
      -- Nunca borrar jugadores ni regenerar cartones al reiniciar.
      update public.bingo_rooms set drawn='{}'::integer[],claim_alert=null,claim_token=null,winner=null,stage_index=0,stages=v_stages,awards='[]'::jsonb,
        round_number=round_number+case when p_action='restart' then 1 else 0 end
        where code=v_code returning * into r;
    end if;
  end if;
  if coalesce((p_data->>'as_host')::boolean,false) and not coalesce(v_host,false) then raise exception 'No tienes acceso al panel de esta sala.'; end if;
  if not coalesce(v_host,false) and not exists(select 1 from public.bingo_players where room_code=v_code and token=v_token) then
    raise exception 'Debes unirte a la sala para ver la partida.';
  end if;
  select * into p from public.bingo_players where room_code=v_code and token=v_token;
  return jsonb_build_object(
    'code',r.code,'title',r.title,'drawn',to_jsonb(r.drawn),'claim_alert',r.claim_alert,
    'round',r.round_number,'stages',to_jsonb(r.stages),'stage',r.stage_index,'awards',r.awards,
    'winner',case when r.winner is null then null else r.round_number::text||':'||r.stage_index::text end,
    'players',coalesce((select jsonb_agg(jsonb_build_object('name',bp.name,'winner',coalesce(bp.token=r.winner,false)) order by bp.created_at) from public.bingo_players bp where bp.room_code=v_code),'[]'::jsonb),
    'review_card',case when v_host and r.claim_token is not null then (select to_jsonb(bp.card) from public.bingo_players bp where bp.token=r.claim_token and bp.room_code=r.code) else null end,'card',to_jsonb(p.card),'name',p.name
  );
end;
$$;
revoke all on function public.bingo_api(text,jsonb) from public, anon, authenticated;
grant execute on function public.bingo_api(text,jsonb) to anon, authenticated;
commit;
