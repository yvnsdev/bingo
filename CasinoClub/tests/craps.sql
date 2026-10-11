-- Run after supabase.sql. Pure rule checks: no room or balance changes.
do $$
declare r jsonb; a integer; b integer; total integer;
begin
 for a in 1..6 loop for b in 1..6 loop
   total:=a+b;
   r:=public.casino_craps_roll('pass',0,0,a,b);
   if total in (7,11) then assert (r->>'factor')::numeric=2;
   elsif total in (2,3,12) then assert (r->>'factor')::numeric=0;
   else assert r->>'factor' is null;assert (r->>'point')::integer=total;end if;
   r:=public.casino_craps_roll('field',0,0,a,b);
   assert (r->>'factor')::numeric=case when total in (2,12) then 3 when total in (3,4,9,10,11) then 2 else 0 end;
 end loop;end loop;
 assert public.casino_craps_roll('dont_pass',0,0,6,6)->>'factor'='1';
 assert public.casino_craps_roll('dont_pass',6,6,3,4)->>'factor'='2';
 assert public.casino_craps_roll('pass',6,6,3,4)->>'factor'='0';
 assert public.casino_craps_roll('come',-1,0,3,4)->>'factor' is null;
 assert public.casino_craps_roll('come',-1,6,3,4)->>'factor'='2';
 assert public.casino_craps_roll('come',-1,6,2,2)->>'point'='4';
 assert public.casino_craps_roll('dont_come',-1,6,6,6)->>'factor'='1';
 assert public.casino_craps_roll('place6',0,0,3,4)->>'factor' is null;
 assert round((public.casino_craps_roll('place6',0,4,3,3)->>'factor')::numeric*30,2)=65;
 assert public.casino_craps_roll('place10',0,4,3,4)->>'factor'='0';
 assert public.casino_craps_roll('big8',0,0,4,4)->>'factor'='2';
end $$;
