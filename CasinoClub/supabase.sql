-- Ejecutar una vez en el mismo Supabase de Bingo. No modifica los otros juegos.
begin;
create table if not exists public.casino_rooms (
 code text primary key check(code ~ '^[A-Z0-9]{6}$'), owner_id uuid not null references auth.users(id),
 title text not null, initial_funds integer not null default 1000 check(initial_funds between 0 and 10000),
 accepting boolean not null default true, game text not null default 'blackjack' check(game in ('blackjack','roulette','craps')),
 phase text not null default 'settled' check(phase in ('betting','playing','settled')), round integer not null default 0,
 deck integer[] not null default '{}', dealer integer[] not null default '{}', point integer not null default 0,
 result jsonb not null default '{}', create_request uuid not null, created_at timestamptz not null default now(), unique(owner_id,create_request)
);
create table if not exists public.casino_players (
 id uuid primary key default gen_random_uuid(), code text not null references public.casino_rooms(code) on delete cascade,
 token_hash text not null, name text not null check(char_length(name) between 1 and 24), active boolean not null default true,
 balance numeric(14,2) not null default 0 check(balance>=0), stake numeric(14,2) not null default 0 check(stake>=0),
 choice text not null default 'red', hand integer[] not null default '{}', status text not null default 'waiting',
 payout numeric(14,2) not null default 0, joined_at timestamptz not null default now(), unique(code,token_hash)
);
create table if not exists public.casino_ledger (
 id bigint generated always as identity primary key, code text not null references public.casino_rooms(code) on delete cascade,
 player_id uuid not null references public.casino_players(id), amount numeric(14,2) not null, reason text not null,
 round integer not null, created_at timestamptz not null default now()
);
create table if not exists public.casino_requests (
 code text not null references public.casino_rooms(code) on delete cascade, request_id uuid not null,
 actor text not null, action text not null, created_at timestamptz not null default now(), primary key(code,request_id)
);
alter table public.casino_rooms enable row level security;
alter table public.casino_players enable row level security;
alter table public.casino_ledger enable row level security;
alter table public.casino_requests enable row level security;
revoke all on public.casino_rooms,public.casino_players,public.casino_ledger,public.casino_requests from anon,authenticated;
create index if not exists casino_ledger_room_idx on public.casino_ledger(code,id desc);

create or replace function public.casino_total(cards integer[]) returns integer language plpgsql immutable set search_path='' as $$
declare c integer; v integer:=0; aces integer:=0; rank integer;
begin foreach c in array cards loop rank:=(c-1)%13+1; v:=v+least(rank,10); if rank=1 then aces:=aces+1; end if; end loop;
 if aces>0 and v+10<=21 then v:=v+10; end if; return v; end $$;

create or replace function public.casino_snapshot(p_code text,p_hash text,p_host boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.casino_rooms%rowtype; payload jsonb; mine jsonb;
begin
 select * into strict r from public.casino_rooms where code=p_code;
 select jsonb_build_object('id',p.id,'name',p.name,'active',p.active,'balance',p.balance,'stake',p.stake,'choice',p.choice,'hand',p.hand,'total',public.casino_total(p.hand),'status',p.status,'payout',p.payout) into mine from public.casino_players p where p.code=p_code and p.token_hash=p_hash;
 payload:=jsonb_build_object('code',r.code,'title',r.title,'game',r.game,'phase',r.phase,'round',r.round,'accepting',r.accepting,'point',r.point,'result',r.result,
 'dealer',case when r.phase='settled' then to_jsonb(r.dealer) when cardinality(r.dealer)>0 then jsonb_build_array(r.dealer[1],null) else '[]'::jsonb end,
 'dealer_total',case when r.phase='settled' then public.casino_total(r.dealer) else null end,
 'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'active',p.active,'balance',p.balance,'stake',p.stake,'choice',p.choice,'status',p.status,'payout',p.payout) order by p.joined_at) from public.casino_players p where p.code=p_code),'[]'::jsonb),'me',mine);
 if p_host then payload:=payload||jsonb_build_object('ledger',coalesce((select jsonb_agg(x order by x.id desc) from (select l.id,p.name,l.amount,l.reason,l.round,l.created_at from public.casino_ledger l join public.casino_players p on p.id=l.player_id where l.code=p_code order by l.id desc limit 60) x),'[]'::jsonb)); end if;
 return payload;
end $$;

-- Pure craps settlement: multiplier includes the original stake; null means pending.
create or replace function public.casino_craps_roll(kind text,bet_point integer,table_point integer,die_a integer,die_b integer) returns jsonb language plpgsql immutable set search_path='' as $$
declare total integer:=die_a+die_b; target integer; factor numeric:=null; next_point integer:=bet_point;
begin
 if kind in ('come','dont_come') and bet_point=-1 then
   if table_point=0 then return jsonb_build_object('point',-1,'factor',null);end if;
   bet_point:=0;next_point:=0;
 end if;
 if kind in ('pass','dont_pass','come','dont_come','red') then
   if bet_point=0 then
     if total in (7,11) then factor:=case when kind in ('dont_pass','dont_come') then 0 else 2 end;
     elsif total in (2,3) then factor:=case when kind in ('dont_pass','dont_come') then 2 else 0 end;
     elsif total=12 then factor:=case when kind in ('dont_pass','dont_come') then 1 else 0 end;
     else next_point:=total;end if;
   elsif total=bet_point then factor:=case when kind in ('dont_pass','dont_come') then 0 else 2 end;
   elsif total=7 then factor:=case when kind in ('dont_pass','dont_come') then 2 else 0 end;end if;
 elsif kind='field' then factor:=case when total in (2,12) then 3 when total in (3,4,9,10,11) then 2 else 0 end;
 elsif kind in ('big6','big8') then
   target:=case when kind='big6' then 6 else 8 end;
   if total=target then factor:=2;elsif total=7 then factor:=0;end if;
 elsif kind in ('place4','place5','place6','place8','place9','place10') and table_point<>0 then
   target:=substring(kind from 6)::integer;
   if total=target then factor:=case when target in (4,10) then 2.8 when target in (5,9) then 2.4 else 13.0/6 end;
   elsif total=7 then factor:=0;end if;
 end if;
 return jsonb_build_object('point',next_point,'factor',factor);
end $$;
revoke all on function public.casino_craps_roll(text,integer,integer,integer,integer) from public;

create or replace function public.casino_api(p_action text,p_data jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); c text:=upper(trim(p_data->>'code')); r public.casino_rooms%rowtype; p public.casino_players%rowtype;
 token text:=p_data->>'token'; hashed text:=encode(sha256(convert_to(coalesce(p_data->>'token',''),'UTF8')),'hex'); host boolean:=false;
 v_actor text; req uuid; amount numeric; chosen text; target uuid; num integer; a integer; b integer; d integer; t integer;
 paid numeric; won boolean; roll_outcome jsonb; resolved boolean:=false; reds integer[]:=array[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
begin
 if p_action not in ('rooms','create','lookup','state','join','bet','hit','stand','open','start','resolve','cancel','grant','access','active','force_stand') then raise exception 'Operación no válida.'; end if;
 if p_action in ('rooms','create','open','start','resolve','cancel','grant','access','active','force_stand') and uid is null then raise exception 'Inicia sesión como administrador.'; end if;
 if p_action='rooms' then return coalesce((select jsonb_agg(jsonb_build_object('code',code,'title',title) order by created_at desc) from public.casino_rooms where owner_id=uid),'[]'::jsonb); end if;
 if p_action='create' then
   req:=(p_data->>'request_id')::uuid; if req is null then raise exception 'Falta identificador de operación.'; end if;
   select * into r from public.casino_rooms where owner_id=uid and create_request=req;
   if found then return public.casino_snapshot(r.code,null,true); end if;
   amount:=(p_data->>'initial_funds')::numeric;
   if amount is null or amount<0 or amount>10000 or mod(amount,10)<>0 or coalesce(char_length(trim(p_data->>'title')),0) not between 1 and 60 then raise exception 'Revisa el nombre y las fichas iniciales.'; end if;
   loop
    c:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    begin insert into public.casino_rooms(code,owner_id,title,initial_funds,create_request) values(c,uid,trim(p_data->>'title'),amount,req) returning * into r; exit;
    exception when unique_violation then
      select * into r from public.casino_rooms where owner_id=uid and create_request=req; if found then return public.casino_snapshot(r.code,null,true); end if;
    end;
   end loop;
   return public.casino_snapshot(c,null,true);
 end if;
 -- All actions in a room serialize here: concurrent taps cannot spend or deal twice.
 select * into r from public.casino_rooms where code=c for update;
 if not found then raise exception 'No encontramos esa sala.'; end if;
 host:=uid is not null and uid=r.owner_id;
 if p_action='lookup' then return jsonb_build_object('code',c,'title',r.title); end if;
 if p_action='state' then return public.casino_snapshot(c,hashed,host); end if;
 if p_action in ('open','start','resolve','cancel','grant','access','active','force_stand') and not host then raise exception 'Solo el administrador de esta sala puede hacerlo.'; end if;
 if p_action in ('join','bet','hit','stand') then
   if token is null or token !~ '^[a-fA-F0-9-]{36}$' then raise exception 'Identificación de participante no válida.'; end if;
   select * into p from public.casino_players where code=c and token_hash=hashed;
   if p_action<>'join' and (p.id is null or not p.active) then raise exception 'Tu lugar está desactivado o no has entrado a la sala.'; end if;
 end if;
 req:=(p_data->>'request_id')::uuid; if req is null then raise exception 'Falta identificador de operación.'; end if;
 v_actor:=case when p_action in ('join','bet','hit','stand') then hashed else uid::text end;
 if exists(select 1 from public.casino_requests where code=c and request_id=req) then
   if not exists(select 1 from public.casino_requests where code=c and request_id=req and casino_requests.actor=v_actor and action=p_action) then raise exception 'Identificador de operación reutilizado.'; end if;
   return public.casino_snapshot(c,hashed,host);
 end if;
 insert into public.casino_requests(code,request_id,actor,action) values(c,req,v_actor,p_action);
 if p_action in ('bet','hit','stand','open','start','resolve','cancel','force_stand') and (p_data->>'round')::integer is distinct from r.round then raise exception 'La ronda cambió. Espera la actualización de la mesa.'; end if;
 if p_action='join' then
   if p.id is null then
     if not r.accepting then raise exception 'El administrador cerró el acceso.'; end if;
     if (select count(*) from public.casino_players where code=c and active)>=20 then raise exception 'Esta sala ya tiene 20 participantes.'; end if;
     if coalesce(char_length(trim(p_data->>'name')),0) not between 1 and 24 then raise exception 'Escribe tu nombre.'; end if;
     insert into public.casino_players(code,token_hash,name,balance) values(c,hashed,trim(p_data->>'name'),r.initial_funds) returning * into p;
     insert into public.casino_ledger(code,player_id,amount,reason,round) values(c,p.id,r.initial_funds,'Fondo inicial',r.round);
   end if;
 elsif p_action='access' then update public.casino_rooms set accepting=coalesce((p_data->>'accepting')::boolean,false) where code=c;
 elsif p_action='active' then
   target:=(p_data->>'player_id')::uuid;
   if exists(select 1 from public.casino_players where code=c and id=target and stake>0) and r.phase<>'settled' then raise exception 'Primero resuelve o cancela su apuesta.'; end if;
   if (p_data->>'active')::boolean and (select count(*) from public.casino_players where code=c and active)>=20 then raise exception 'Límite de 20 participantes.'; end if;
   update public.casino_players set active=coalesce((p_data->>'active')::boolean,false) where code=c and id=target;
   if not found then raise exception 'Participante no encontrado.'; end if;
 elsif p_action='grant' then
   amount:=(p_data->>'amount')::numeric;target:=nullif(p_data->>'player_id','')::uuid;
   if amount is null or amount<10 or amount>10000 or mod(amount,10)<>0 then raise exception 'Entrega entre 10 y 10.000 fichas, en múltiplos de 10.'; end if;
   for p in select * from public.casino_players where code=c and active and (target is null or id=target) loop
     update public.casino_players set balance=balance+amount where id=p.id;
     insert into public.casino_ledger(code,player_id,amount,reason,round) values(c,p.id,amount,'Entrega del administrador',r.round);
   end loop;
 elsif p_action='open' then
   if r.phase<>'settled' then raise exception 'Resuelve o cancela la ronda actual.'; end if;
   chosen:=p_data->>'game'; if chosen is null or chosen not in ('blackjack','roulette','craps') then raise exception 'Juego no válido.'; end if;
   update public.casino_rooms set game=chosen,phase='betting',round=round+1,dealer='{}',deck='{}',point=0,result='{}' where code=c;
   update public.casino_players set stake=0,hand='{}',status='waiting',payout=0,choice='red' where code=c;
 elsif p_action='bet' then
   if r.phase<>'betting' then raise exception 'Las apuestas están cerradas.'; end if;
   amount:=(p_data->>'amount')::numeric; chosen:=coalesce(p_data->>'choice','red');
   if r.game='craps' then
     if chosen='red' then chosen:='pass';end if;
     if chosen not in ('pass','dont_pass','come','dont_come','field','big6','big8','place4','place5','place6','place8','place9','place10') then raise exception 'Selecciona una zona válida de craps.';end if;
     if chosen in ('place6','place8') and mod(amount,30)<>0 then raise exception 'Para Place 6 u 8 apuesta múltiplos de 30 fichas.';end if;
   end if;
   if amount is null or amount<0 or amount>5000 or mod(amount,10)<>0 or amount>p.balance+p.stake then raise exception 'Apuesta no válida o saldo insuficiente.'; end if;
   if r.game='roulette' and chosen not in ('red','black','even','odd','low','high') then
     if chosen !~ '^(00|[0-9]|[12][0-9]|3[0-6])$' then raise exception 'Selecciona una apuesta de ruleta válida.'; end if;
   end if;
   update public.casino_players set balance=balance+stake-amount,stake=amount,choice=chosen,status=case when amount>0 then 'bet' else 'waiting' end where id=p.id;
   insert into public.casino_ledger(code,player_id,amount,reason,round) values(c,p.id,p.stake-amount,'Ajuste de apuesta',r.round);
 elsif p_action='start' then
   if r.phase<>'betting' or not exists(select 1 from public.casino_players where code=c and active and stake>0) then raise exception 'Abre apuestas y espera al menos una apuesta.'; end if;
   r.phase:='playing';
   if r.game='blackjack' then
     select array_agg(n order by random()) into r.deck from generate_series(1,312) n;
     r.dealer:=r.deck[1:2];r.deck:=r.deck[3:cardinality(r.deck)];
     for p in select * from public.casino_players where code=c and active and stake>0 order by joined_at loop
       update public.casino_players set hand=r.deck[1:2],status=case when public.casino_total(r.deck[1:2])=21 then 'blackjack' else 'playing' end where id=p.id;
       r.deck:=r.deck[3:cardinality(r.deck)];
     end loop;
     if public.casino_total(r.dealer)=21 then update public.casino_players set status='stand' where code=c and status='playing'; end if;
   else update public.casino_players set status='playing',hand=case when r.game='craps' then array[case when choice in ('come','dont_come') then -1 else 0 end] else hand end where code=c and active and stake>0;
   end if;
   update public.casino_rooms set phase=r.phase,deck=r.deck,dealer=r.dealer where code=c;
 elsif p_action in ('hit','stand','force_stand') then
   if r.phase<>'playing' or r.game<>'blackjack' then raise exception 'No hay una mano de blackjack activa.'; end if;
   if p_action='force_stand' then select * into p from public.casino_players where code=c and id=(p_data->>'player_id')::uuid; end if;
   if p.id is null or p.status<>'playing' then raise exception 'Esta mano ya terminó su turno.'; end if;
   if p_action='hit' then
     if cardinality(r.deck)=0 then raise exception 'No quedan cartas. Cancela la ronda para devolver apuestas.'; end if;
     p.hand:=array_append(p.hand,r.deck[1]);r.deck:=r.deck[2:cardinality(r.deck)];
     t:=public.casino_total(p.hand);
     update public.casino_players set hand=p.hand,status=case when t>21 then 'bust' when t=21 then 'stand' else 'playing' end where id=p.id;
     update public.casino_rooms set deck=r.deck where code=c;
   else update public.casino_players set status='stand' where id=p.id; end if;
 elsif p_action='cancel' then
   if r.phase='settled' then raise exception 'La ronda ya terminó.'; end if;
   for p in select * from public.casino_players where code=c and stake>0 and (r.game<>'craps' or status in ('playing','bet')) loop
     update public.casino_players set balance=balance+stake,payout=stake,status='refunded' where id=p.id;
     insert into public.casino_ledger(code,player_id,amount,reason,round) values(c,p.id,p.stake,'Ronda cancelada',r.round);
   end loop;
   update public.casino_rooms set phase='settled',result=jsonb_build_object('cancelled',true) where code=c;
 elsif p_action='resolve' then
   if r.phase<>'playing' then raise exception 'La ronda no está en juego.'; end if;
   if r.game='blackjack' then
     if exists(select 1 from public.casino_players where code=c and status='playing') then raise exception 'Hay jugadores tomando decisiones. Espera o usa Plantar en su fila.'; end if;
     while public.casino_total(r.dealer)<17 loop
       if cardinality(r.deck)=0 then raise exception 'No quedan cartas. Cancela la ronda.'; end if;
       r.dealer:=array_append(r.dealer,r.deck[1]);r.deck:=r.deck[2:cardinality(r.deck)];
     end loop;
     d:=public.casino_total(r.dealer);resolved:=true;r.result:=jsonb_build_object('dealer_total',d);
   elsif r.game='roulette' then num:=floor(random()*38);resolved:=true;r.result:=jsonb_build_object('number',case when num=37 then '00' else num::text end,'color',case when num in (0,37) then 'green' when num=any(reds) then 'red' else 'black' end);
   else
     a:=1+floor(random()*6);b:=1+floor(random()*6);num:=a+b;
     for p in select * from public.casino_players where code=c and stake>0 and status='playing' loop
       roll_outcome:=public.casino_craps_roll(p.choice,coalesce(p.hand[1],0),r.point,a,b);
       if roll_outcome->>'factor' is null then
         update public.casino_players set hand=array[(roll_outcome->>'point')::integer] where id=p.id;
       else
         paid:=round(p.stake*(roll_outcome->>'factor')::numeric,2);
         update public.casino_players set balance=balance+paid,payout=paid,status=case when paid>stake then 'win' when paid=stake then 'push' else 'loss' end where id=p.id;
         insert into public.casino_ledger(code,player_id,amount,reason,round) values(c,p.id,paid,'Craps: '||p.choice,r.round);
       end if;
     end loop;
     if r.point=0 and num in (4,5,6,8,9,10) then r.point:=num;
     elsif r.point<>0 and (num=7 or num=r.point) then r.point:=0;end if;
     r.phase:=case when exists(select 1 from public.casino_players where code=c and status='playing' and stake>0) then 'playing' else 'settled' end;
     r.result:=jsonb_build_object('dice',jsonb_build_array(a,b),'total',num);
     update public.casino_rooms set phase=r.phase,point=r.point,result=r.result where code=c;
     return public.casino_snapshot(c,hashed,host);
   end if;
   if resolved then
     for p in select * from public.casino_players where code=c and stake>0 loop
       paid:=0;
       if r.game='blackjack' then
         t:=public.casino_total(p.hand);
         if t>21 then paid:=0;
         elsif t=21 and cardinality(p.hand)=2 then paid:=case when d=21 and cardinality(r.dealer)=2 then p.stake else p.stake*2.5 end;
         elsif d=21 and cardinality(r.dealer)=2 then paid:=0;
         elsif d>21 or t>d then paid:=p.stake*2;
         elsif t=d then paid:=p.stake; end if;
       elsif r.game='roulette' then
         if p.choice ~ '^[0-9]+$' then if (p.choice='00' and num=37) or (p.choice<>'00' and p.choice::integer=num) then paid:=p.stake*36;end if;
         elsif num between 1 and 36 and ((p.choice='red' and num=any(reds)) or (p.choice='black' and not(num=any(reds))) or (p.choice='even' and num%2=0) or (p.choice='odd' and num%2=1) or (p.choice='low' and num<=18) or (p.choice='high' and num>=19)) then paid:=p.stake*2;end if;
       elsif won then paid:=p.stake*2;end if;
       update public.casino_players set balance=balance+paid,payout=paid,status=case when paid>p.stake then 'win' when paid=p.stake then 'push' else 'loss' end where id=p.id;
       insert into public.casino_ledger(code,player_id,amount,reason,round) values(c,p.id,paid,'Liquidación de ronda',r.round);
     end loop;
     r.phase:='settled';
   end if;
   update public.casino_rooms set phase=r.phase,dealer=r.dealer,deck=r.deck,point=r.point,result=r.result where code=c;
 end if;
 return public.casino_snapshot(c,hashed,host);
end $$;
revoke all on function public.casino_total(integer[]),public.casino_snapshot(text,text,boolean),public.casino_api(text,jsonb) from public;
grant execute on function public.casino_api(text,jsonb) to anon,authenticated;
commit;
