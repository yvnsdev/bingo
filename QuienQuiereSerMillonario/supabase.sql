-- MILLONARIO MONC · ejecutar en el mismo proyecto Supabase del Bingo.
-- Solo agrega objetos millionaire_*; no modifica las tablas ni funciones del Bingo.
begin;

create table if not exists public.millionaire_questions (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 1 and 300),
  options text[] not null check (cardinality(options)=4),
  correct_index integer not null check (correct_index between 0 and 3),
  expert_hint text not null check (char_length(expert_hint) between 1 and 300),
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.millionaire_rooms (
  code text primary key,
  title text not null check (char_length(title) between 1 and 60),
  owner_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby','rules','question','reveal','finished')),
  question_ids uuid[] not null,
  question_index integer not null default 0,
  lifelines jsonb not null default '{"fifty":false,"call":false,"audience":false,"expert":false}'::jsonb,
  lifeline_at jsonb not null default '{}'::jsonb,
  hidden_options integer[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.millionaire_players (
  token uuid primary key,
  room_code text not null references public.millionaire_rooms(code) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  score integer not null default 0 check (score>=0),
  created_at timestamptz not null default now(),
  unique(room_code,token)
);

create table if not exists public.millionaire_answers (
  room_code text not null references public.millionaire_rooms(code) on delete cascade,
  question_index integer not null,
  player_token uuid not null references public.millionaire_players(token) on delete cascade,
  option_index integer not null check (option_index between 0 and 3),
  answered_at timestamptz not null default now(),
  primary key(room_code,question_index,player_token)
);

create index if not exists millionaire_rooms_owner_idx on public.millionaire_rooms(owner_id);
create index if not exists millionaire_players_room_idx on public.millionaire_players(room_code);
create index if not exists millionaire_answers_room_question_idx on public.millionaire_answers(room_code,question_index);
alter table public.millionaire_rooms add column if not exists lifeline_at jsonb not null default '{}'::jsonb;
alter table public.millionaire_rooms drop constraint if exists millionaire_rooms_status_check;
alter table public.millionaire_rooms add constraint millionaire_rooms_status_check check (status in ('lobby','rules','question','reveal','finished'));

alter table public.millionaire_questions enable row level security;
alter table public.millionaire_rooms enable row level security;
alter table public.millionaire_players enable row level security;
alter table public.millionaire_answers enable row level security;
revoke all on public.millionaire_questions,public.millionaire_rooms,public.millionaire_players,public.millionaire_answers from anon,authenticated;

create or replace function public.millionaire_api(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.millionaire_rooms%rowtype;
  q public.millionaire_questions%rowtype;
  p public.millionaire_players%rowtype;
  v_user uuid:=auth.uid();
  v_code text:=upper(trim(p_data->>'code'));
  v_token uuid;
  v_option integer;
  v_count integer;
  v_correct integer;
  v_kind text;
  v_hidden integer[];
  v_question_ids uuid[];
  v_distribution jsonb;
  v_question jsonb;
  v_my_answer integer;
  v_is_host boolean:=false;
  v_show_distribution boolean:=false;
begin
  if p_action is null or p_action not in ('questions','question_save','question_delete','rooms','create','lookup','join','state','show_rules','start','answer','reveal','next','lifeline') then
    raise exception 'Operación no válida.';
  end if;
  if p_data ? 'token' and nullif(p_data->>'token','') is not null then v_token:=(p_data->>'token')::uuid; end if;

  if p_action in ('questions','question_save','question_delete','rooms','create','show_rules','start','reveal','next','lifeline') and v_user is null then
    raise exception 'Inicia sesión como administrador.';
  end if;

  if p_action='questions' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',mq.id,'text',mq.text,'options',to_jsonb(mq.options),'correct_index',mq.correct_index,'expert_hint',mq.expert_hint,'difficulty',mq.difficulty,'active',mq.active) order by mq.difficulty,mq.created_at desc) from public.millionaire_questions mq),'[]'::jsonb);
  end if;

  if p_action='question_save' then
    if char_length(trim(p_data->>'text')) not between 1 and 300 or jsonb_array_length(p_data->'options')<>4 or char_length(trim(p_data->>'expert_hint')) not between 1 and 300 then raise exception 'Completa la pregunta, sus cuatro alternativas y la pista.'; end if;
    if (p_data->>'correct_index')::integer not between 0 and 3 or (p_data->>'difficulty')::integer not between 1 and 5 then raise exception 'La respuesta o dificultad no es válida.'; end if;
    if nullif(p_data->>'id','') is null then
      insert into public.millionaire_questions(text,options,correct_index,expert_hint,difficulty,active,created_by)
      values(trim(p_data->>'text'),(select array_agg(trim(value) order by ord) from jsonb_array_elements_text(p_data->'options') with ordinality as x(value,ord)),(p_data->>'correct_index')::integer,trim(p_data->>'expert_hint'),(p_data->>'difficulty')::integer,coalesce((p_data->>'active')::boolean,true),v_user) returning * into q;
    else
      update public.millionaire_questions set text=trim(p_data->>'text'),options=(select array_agg(trim(value) order by ord) from jsonb_array_elements_text(p_data->'options') with ordinality as x(value,ord)),correct_index=(p_data->>'correct_index')::integer,expert_hint=trim(p_data->>'expert_hint'),difficulty=(p_data->>'difficulty')::integer,active=coalesce((p_data->>'active')::boolean,true),updated_at=now() where id=(p_data->>'id')::uuid returning * into q;
      if not found then raise exception 'No encontramos esa pregunta.'; end if;
    end if;
    if exists(select 1 from unnest(q.options) x where char_length(x) not between 1 and 160) then raise exception 'Cada alternativa debe tener entre 1 y 160 caracteres.'; end if;
    return jsonb_build_object('id',q.id);
  end if;

  if p_action='question_delete' then
    delete from public.millionaire_questions where id=(p_data->>'id')::uuid and not exists(select 1 from public.millionaire_rooms mr where millionaire_questions.id=any(mr.question_ids));
    if not found then raise exception 'La pregunta está en una partida o ya no existe. Puedes desactivarla en vez de borrarla.'; end if;
    return '{"ok":true}'::jsonb;
  end if;

  if p_action='rooms' then
    return coalesce((select jsonb_agg(jsonb_build_object('code',mr.code,'title',mr.title,'status',mr.status) order by mr.created_at desc) from public.millionaire_rooms mr where mr.owner_id=v_user),'[]'::jsonb);
  end if;

  if p_action='create' then
    v_count:=least(15,greatest(1,coalesce((p_data->>'count')::integer,15)));
    if char_length(trim(p_data->>'title')) not between 1 and 60 then raise exception 'Escribe un nombre de sala de hasta 60 caracteres.'; end if;
    select count(*) into v_correct from public.millionaire_questions where active;
    if v_correct<v_count then raise exception 'Hay % preguntas activas y solicitaste %. Agrega más preguntas o reduce la cantidad.',v_correct,v_count; end if;
    loop
      v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
      begin
        insert into public.millionaire_rooms(code,title,owner_id,question_ids)
        values(v_code,trim(p_data->>'title'),v_user,array(select id from public.millionaire_questions where active order by random() limit v_count)) returning * into r;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
  elsif p_action='lookup' then
    select * into r from public.millionaire_rooms where code=v_code;
    if not found then raise exception 'No encontramos esa sala. Revisa el código.'; end if;
    return jsonb_build_object('code',r.code,'title',r.title,'status',r.status,'open',r.status<>'finished');
  else
    select * into r from public.millionaire_rooms where code=v_code for update;
    if not found then raise exception 'No encontramos esa sala. Revisa el código.'; end if;
    v_is_host:=v_user is not null and r.owner_id=v_user;
    if p_action in ('show_rules','start','reveal','next','lifeline') and not v_is_host then raise exception 'Solo quien creó la sala puede dirigir esta partida.'; end if;
    if p_action='join' then
      if v_token is null then raise exception 'Falta la identificación del participante.'; end if;
      select * into p from public.millionaire_players where token=v_token and room_code=v_code;
      if not found then
        if r.status='finished' then raise exception 'La partida ya terminó.'; end if;
        if char_length(trim(p_data->>'name')) not between 1 and 30 then raise exception 'Escribe un nombre de hasta 30 caracteres.'; end if;
        if (select count(*) from public.millionaire_players where room_code=v_code)>=300 then raise exception 'La sala está llena.'; end if;
        insert into public.millionaire_players(token,room_code,name) values(v_token,v_code,trim(p_data->>'name')) returning * into p;
      end if;
    elsif p_action='show_rules' then
      if r.status<>'lobby' then raise exception 'Las reglas ya fueron presentadas.'; end if;
      if not exists(select 1 from public.millionaire_players where room_code=v_code) then raise exception 'Espera a que entre al menos un participante.'; end if;
      update public.millionaire_rooms set status='rules' where code=v_code returning * into r;
    elsif p_action='start' then
      if r.status<>'rules' then raise exception 'Primero presenta las reglas.'; end if;
      select array_agg(valid.id order by valid.ord) into v_question_ids
      from (
        select mq.id,u.ord
        from unnest(r.question_ids) with ordinality as u(id,ord)
        join public.millionaire_questions mq on mq.id=u.id
      ) valid;
      if coalesce(cardinality(v_question_ids),0)=0 then raise exception 'Las preguntas de esta sala ya no están disponibles. Crea una sala nueva.'; end if;
      update public.millionaire_rooms set status='question',question_index=0,question_ids=v_question_ids where code=v_code returning * into r;
    elsif p_action='answer' then
      if r.status<>'question' then raise exception 'La votación está cerrada.'; end if;
      select * into p from public.millionaire_players where token=v_token and room_code=v_code;
      if not found then raise exception 'Primero debes unirte a la sala.'; end if;
      v_option:=(p_data->>'option')::integer;
      if v_option not between 0 and 3 or v_option=any(r.hidden_options) then raise exception 'Esa alternativa no está disponible.'; end if;
      insert into public.millionaire_answers(room_code,question_index,player_token,option_index) values(v_code,r.question_index,v_token,v_option)
      on conflict(room_code,question_index,player_token) do update set option_index=excluded.option_index,answered_at=now();
    elsif p_action='reveal' then
      if r.status<>'question' then raise exception 'La pregunta ya fue revelada.'; end if;
      select correct_index into v_correct from public.millionaire_questions where id=r.question_ids[r.question_index+1];
      update public.millionaire_players mp set score=score+1000 where room_code=v_code and exists(select 1 from public.millionaire_answers ma where ma.room_code=v_code and ma.question_index=r.question_index and ma.player_token=mp.token and ma.option_index=v_correct);
      update public.millionaire_rooms set status='reveal' where code=v_code returning * into r;
    elsif p_action='next' then
      if r.status<>'reveal' then raise exception 'Primero revela la respuesta.'; end if;
      if r.question_index>=cardinality(r.question_ids)-1 then update public.millionaire_rooms set status='finished' where code=v_code returning * into r;
      else update public.millionaire_rooms set status='question',question_index=question_index+1,hidden_options='{}' where code=v_code returning * into r; end if;
    elsif p_action='lifeline' then
      if r.status<>'question' then raise exception 'Los comodines se usan mientras la pregunta está abierta.'; end if;
      v_kind:=p_data->>'kind';if v_kind not in ('fifty','call','audience','expert') then raise exception 'Comodín no válido.'; end if;
      if coalesce((r.lifelines->>v_kind)::boolean,false) then raise exception 'Ese comodín ya fue utilizado.'; end if;
      if v_kind='fifty' then
        select correct_index into v_correct from public.millionaire_questions where id=r.question_ids[r.question_index+1];
        select array_agg(i) into v_hidden from (select i from generate_series(0,3)i where i<>v_correct order by random() limit 2)x;
        update public.millionaire_rooms set lifelines=jsonb_set(lifelines,array[v_kind],'true'),lifeline_at=jsonb_set(lifeline_at,array[v_kind],to_jsonb(question_index)),hidden_options=v_hidden where code=v_code returning * into r;
      else update public.millionaire_rooms set lifelines=jsonb_set(lifelines,array[v_kind],'true'),lifeline_at=jsonb_set(lifeline_at,array[v_kind],to_jsonb(question_index)) where code=v_code returning * into r; end if;
    end if;
  end if;

  v_is_host:=v_user is not null and r.owner_id=v_user;
  if coalesce((p_data->>'as_host')::boolean,false) and not v_is_host then raise exception 'No tienes acceso al panel de esta sala.'; end if;
  if not v_is_host then
    select * into p from public.millionaire_players where room_code=r.code and token=v_token;
    if not found then raise exception 'Debes unirte a la sala para ver la partida.'; end if;
  end if;

  if r.status not in ('lobby','rules','finished') then
    select * into q from public.millionaire_questions where id=r.question_ids[r.question_index+1];
    if not found then raise exception 'La pregunta actual ya no está disponible. Crea una sala nueva.'; end if;
    v_question:=jsonb_build_object('id',q.id,'text',q.text,'options',to_jsonb(q.options),'difficulty',q.difficulty,
      'correct_index',case when r.status='reveal' then q.correct_index else null end,
      'expert_hint',case when r.status='reveal' or (r.lifeline_at->>'expert')::integer=r.question_index then q.expert_hint else null end);
  end if;
  select option_index into v_my_answer from public.millionaire_answers where room_code=r.code and question_index=r.question_index and player_token=v_token;
  v_show_distribution:=r.status='reveal' or (r.lifeline_at->>'audience')::integer=r.question_index;
  if r.status='reveal' then
    select jsonb_build_array(count(*) filter(where option_index=0),count(*) filter(where option_index=1),count(*) filter(where option_index=2),count(*) filter(where option_index=3)) into v_distribution from public.millionaire_answers where room_code=r.code and question_index=r.question_index;
  elsif (r.lifeline_at->>'audience')::integer=r.question_index then
    v_distribution:=case q.correct_index
      when 0 then '[61,14,16,9]'::jsonb
      when 1 then '[11,64,16,9]'::jsonb
      when 2 then '[12,15,63,10]'::jsonb
      else '[13,16,11,60]'::jsonb
    end;
  end if;
  return jsonb_build_object('code',r.code,'title',r.title,'status',r.status,'index',r.question_index,'total',cardinality(r.question_ids),'question',v_question,
    'players',coalesce((select jsonb_agg(jsonb_build_object('name',mp.name,'score',mp.score) order by mp.score desc,mp.created_at) from public.millionaire_players mp where mp.room_code=r.code),'[]'::jsonb),
    'answer_count',(select count(*) from public.millionaire_answers ma where ma.room_code=r.code and ma.question_index=r.question_index),
    'my_answer',v_my_answer,'distribution',v_distribution,
    'expert_answer',case when (r.lifeline_at->>'expert')::integer=r.question_index then q.correct_index else null end,
    'call_answer',case when (r.lifeline_at->>'call')::integer=r.question_index then q.correct_index else null end,
    'correct_voters',case when r.status='reveal' then coalesce((select jsonb_agg(mp.name order by mp.created_at) from public.millionaire_players mp join public.millionaire_answers ma on ma.player_token=mp.token and ma.room_code=r.code and ma.question_index=r.question_index where mp.room_code=r.code and ma.option_index=q.correct_index),'[]'::jsonb) else '[]'::jsonb end,
    'lifelines',r.lifelines,'lifeline_at',r.lifeline_at,'hidden',to_jsonb(r.hidden_options),'name',p.name,'as_host',v_is_host);
end;
$$;

revoke all on function public.millionaire_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.millionaire_api(text,jsonb) to anon,authenticated;
commit;
