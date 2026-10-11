-- Ejecutar en una base de pruebas después de supabase.sql. Todo se revierte.
begin;
do $test$
declare admin_id uuid; c text; token1 text:=gen_random_uuid()::text; token2 text:=gen_random_uuid()::text;
 v jsonb; other jsonb; pid uuid; req uuid; before_balance numeric; rejected boolean; n integer;
begin
 select id into admin_id from auth.users limit 1;
 if admin_id is null then raise exception 'La base de pruebas necesita una cuenta auth.users.'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 v:=public.casino_api('create',jsonb_build_object('title','TEST CASINO','initial_funds',1000,'request_id',gen_random_uuid()));c:=v->>'code';
 v:=public.casino_api('join',jsonb_build_object('code',c,'token',token1,'name','Jugador 1','request_id',gen_random_uuid()));pid:=(v#>>'{me,id}')::uuid;
 perform public.casino_api('join',jsonb_build_object('code',c,'token',token2,'name','Jugador 2','request_id',gen_random_uuid()));
 req:=gen_random_uuid();
 perform public.casino_api('grant',jsonb_build_object('code',c,'player_id',pid,'amount',500,'request_id',req));
 perform public.casino_api('grant',jsonb_build_object('code',c,'player_id',pid,'amount',500,'request_id',req));
 v:=public.casino_api('state',jsonb_build_object('code',c,'token',token1));
 if (v#>>'{me,balance}')::numeric<>1500 then raise exception 'Grant idempotency failed'; end if;
 perform public.casino_api('open',jsonb_build_object('code',c,'round',0,'game','blackjack','request_id',gen_random_uuid()));
 perform set_config('request.jwt.claim.sub','',true);
 req:=gen_random_uuid();
 perform public.casino_api('bet',jsonb_build_object('code',c,'round',1,'token',token1,'amount',50,'request_id',req));
 v:=public.casino_api('bet',jsonb_build_object('code',c,'round',1,'token',token1,'amount',50,'request_id',req));
 if (v#>>'{me,balance}')::numeric<>1450 then raise exception 'Bet idempotency failed'; end if;
 rejected:=false;begin perform public.casino_api('grant',jsonb_build_object('code',c,'amount',500,'request_id',gen_random_uuid()));exception when others then rejected:=true;end;
 if not rejected then raise exception 'Participant could grant funds'; end if;
 rejected:=false;begin perform public.casino_api('bet',jsonb_build_object('code',c,'round',1,'token',token1,'amount',5000,'request_id',gen_random_uuid()));exception when others then rejected:=true;end;
 if not rejected then raise exception 'Overspending accepted'; end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.casino_api('start',jsonb_build_object('code',c,'round',1,'request_id',gen_random_uuid()));
 perform set_config('request.jwt.claim.sub','',true);
 v:=public.casino_api('state',jsonb_build_object('code',c,'token',token1));other:=public.casino_api('state',jsonb_build_object('code',c,'token',token2));
 if jsonb_array_length(v#>'{me,hand}')<>2 or jsonb_array_length(other#>'{me,hand}')<>0 then raise exception 'Private hand incorrect'; end if;
 if v ? 'deck' or v ? 'ledger' or (v->'players'->0) ? 'hand' or v->'dealer'->1<>'null'::jsonb then raise exception 'Public data leaked'; end if;
 v:=public.casino_api('state',jsonb_build_object('code',c));if v->'me'<>'null'::jsonb then raise exception 'Spectator received private identity'; end if;
 if public.casino_total(array[1,14,9])<>21 or public.casino_total(array[1,13])<>21 or public.casino_total(array[13,12,11])<>30 then raise exception 'Ace totals incorrect'; end if;
 -- A forced fixture makes blackjack payment deterministic.
 update public.casino_players set hand=array[1,13],status='blackjack' where id=pid;
 update public.casino_rooms set dealer=array[10,9] where code=c;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 req:=gen_random_uuid();perform public.casino_api('resolve',jsonb_build_object('code',c,'round',1,'request_id',req));
 perform public.casino_api('resolve',jsonb_build_object('code',c,'round',1,'request_id',req));
 v:=public.casino_api('state',jsonb_build_object('code',c,'token',token1));if (v#>>'{me,balance}')::numeric<>1575 then raise exception 'Blackjack payout or settlement idempotency incorrect'; end if;
 perform public.casino_api('open',jsonb_build_object('code',c,'round',1,'game','roulette','request_id',gen_random_uuid()));
 perform public.casino_api('bet',jsonb_build_object('code',c,'round',2,'token',token1,'amount',100,'choice','red','request_id',gen_random_uuid()));
 req:=gen_random_uuid();perform public.casino_api('cancel',jsonb_build_object('code',c,'round',2,'request_id',req));perform public.casino_api('cancel',jsonb_build_object('code',c,'round',2,'request_id',req));
 v:=public.casino_api('state',jsonb_build_object('code',c,'token',token1));if (v#>>'{me,balance}')::numeric<>1575 then raise exception 'Refund incorrect'; end if;
 perform public.casino_api('open',jsonb_build_object('code',c,'round',2,'game','craps','request_id',gen_random_uuid()));
 perform public.casino_api('bet',jsonb_build_object('code',c,'round',3,'token',token1,'amount',50,'request_id',gen_random_uuid()));
 perform public.casino_api('start',jsonb_build_object('code',c,'round',3,'request_id',gen_random_uuid()));
 for n in 1..10000 loop
   v:=public.casino_api('resolve',jsonb_build_object('code',c,'round',3,'token',token1,'request_id',gen_random_uuid()));
   if v->>'phase'='settled' then exit; end if;
   if (v#>>'{me,balance}')::numeric<>1525 then raise exception 'Craps charged a second bet'; end if;
 end loop;
 if v->>'phase'<>'settled' then raise exception 'Craps did not settle'; end if;
 if (v#>>'{me,balance}')::numeric not in (1525,1625) then raise exception 'Craps payout incorrect'; end if;
 raise notice 'PASS: balances, privacy, permissions, idempotency, blackjack, refunds and craps.';
end $test$;
rollback;
