-- 100 LATINOS DIJERON · ejecutar en el mismo proyecto Supabase de Bingo.
-- Crea objetos latinos_* independientes; comparte únicamente Supabase Auth.
begin;

create table if not exists public.latinos_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(question) between 1 and 180),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.latinos_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.latinos_questions(id) on delete cascade,
  position integer not null check (position between 1 and 8),
  answer text not null check (char_length(answer) between 1 and 80),
  points integer not null check (points between 0 and 100),
  unique(question_id,position)
);

create table if not exists public.latinos_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  title text not null check (char_length(title) between 1 and 60),
  owner_id uuid not null references auth.users(id),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists latinos_answers_question_idx on public.latinos_answers(question_id,position);
alter table public.latinos_questions enable row level security;
alter table public.latinos_answers enable row level security;
alter table public.latinos_rooms enable row level security;
revoke all on public.latinos_questions,public.latinos_answers,public.latinos_rooms from anon,authenticated;

create or replace function public.latinos_api(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_id uuid;
  v_answer jsonb;
  v_position integer:=0;
  v_code text:=upper(trim(p_data->>'code'));
  v_room public.latinos_rooms%rowtype;
begin
  if p_action not in ('active_questions','questions','question_save','question_delete','rooms','room_create','room_state','room_update','lookup') then raise exception 'Operación no válida.'; end if;
  if p_action in ('questions','question_save','question_delete','rooms','room_create','room_update') and v_user is null then raise exception 'Inicia sesión como administrador.'; end if;

  if p_action in ('active_questions','questions') then
    return coalesce((select jsonb_agg(jsonb_build_object(
      'id',q.id,'question',q.question,'active',q.active,
      'answers',coalesce((select jsonb_agg(jsonb_build_array(a.answer,a.points) order by a.position) from public.latinos_answers a where a.question_id=q.id),'[]'::jsonb)
    ) order by q.created_at desc) from public.latinos_questions q where p_action='questions' or q.active),'[]'::jsonb);
  end if;

  if p_action='rooms' then
    return coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'title',r.title,'updated_at',r.updated_at) order by r.created_at desc) from public.latinos_rooms r where r.owner_id=v_user),'[]'::jsonb);
  end if;

  if p_action='room_create' then
    if char_length(trim(p_data->>'title')) not between 1 and 60 then raise exception 'Escribe un nombre para la sala.'; end if;
    loop
      v_code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
      begin
        insert into public.latinos_rooms(code,title,owner_id,state) values(v_code,trim(p_data->>'title'),v_user,coalesce(p_data->'state','{}'::jsonb)) returning * into v_room;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    return jsonb_build_object('code',v_room.code,'title',v_room.title,'state',v_room.state);
  end if;

  if p_action in ('lookup','room_state','room_update') then
    select * into v_room from public.latinos_rooms where code=v_code for update;
    if not found then raise exception 'No encontramos esa sala. Revisa el código.'; end if;
    if p_action='lookup' then return jsonb_build_object('code',v_room.code,'title',v_room.title); end if;
    if p_action='room_update' then
      if v_room.owner_id<>v_user then raise exception 'Solo quien creó la sala puede controlar este tablero.'; end if;
      update public.latinos_rooms set state=coalesce(p_data->'state','{}'::jsonb),updated_at=now() where code=v_code returning * into v_room;
    end if;
    return jsonb_build_object('code',v_room.code,'title',v_room.title,'state',v_room.state,'updated_at',v_room.updated_at);
  end if;

  if p_action='question_save' then
    if char_length(trim(p_data->>'question')) not between 1 and 180 then raise exception 'Escribe una pregunta válida.'; end if;
    if jsonb_typeof(p_data->'answers')<>'array' or jsonb_array_length(p_data->'answers') not between 2 and 8 then raise exception 'Agrega entre 2 y 8 respuestas.'; end if;
    if nullif(p_data->>'id','') is null then
      insert into public.latinos_questions(question,active,created_by) values(trim(p_data->>'question'),coalesce((p_data->>'active')::boolean,true),v_user) returning id into v_id;
    else
      v_id:=(p_data->>'id')::uuid;
      update public.latinos_questions set question=trim(p_data->>'question'),active=coalesce((p_data->>'active')::boolean,true),updated_at=now() where id=v_id;
      if not found then raise exception 'No encontramos esa pregunta.'; end if;
      delete from public.latinos_answers where question_id=v_id;
    end if;
    for v_answer in select value from jsonb_array_elements(p_data->'answers') loop
      v_position:=v_position+1;
      if char_length(trim(v_answer->>0)) not between 1 and 80 or (v_answer->>1)::integer not between 0 and 100 then raise exception 'Revisa el texto y puntaje de las respuestas.'; end if;
      insert into public.latinos_answers(question_id,position,answer,points) values(v_id,v_position,trim(v_answer->>0),(v_answer->>1)::integer);
    end loop;
    return jsonb_build_object('id',v_id);
  end if;

  v_id:=(p_data->>'id')::uuid;
  delete from public.latinos_questions where id=v_id;
  if not found then raise exception 'La pregunta ya no existe.'; end if;
  return '{"ok":true}'::jsonb;
end;
$$;

revoke all on function public.latinos_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.latinos_api(text,jsonb) to anon,authenticated;
commit;
