-- Owner-operated Deriv virtual-money Demo: faster sequential signal evaluation.
-- Does NOT change any 15 strategy, contract family, broker API, account or stake.
-- Does NOT permit another order before the previous settles/reconciles.
begin;
lock table public.senfx_demo_bot_control in share row exclusive mode;
do $safety$
begin
 if exists(select 1 from public.senfx_demo_bot_control where mode='running')
 or exists(select 1 from public.senfx_demo_bot_orders
       where status in ('reserved','buy_unknown','open'))
 or exists(select 1 from public.deriv_demo_orders
       where status in ('reserved','buy_unknown','open'))
 then
   raise exception 'Virtual Demo cooldown can only be changed after all sessions are safely stopped and all purchases settled';
 end if;
end;
$safety$;
alter table public.senfx_demo_bot_control
 drop constraint if exists senfx_demo_bot_control_cooldown_seconds_check;
alter table public.senfx_demo_bot_control
 add constraint senfx_demo_bot_control_cooldown_seconds_check
 check (cooldown_seconds>=5);
alter table public.senfx_demo_bot_control
 alter column cooldown_seconds set default 5;
-- Change only the stopped admin Demo pilot; preserve order and risk ledgers.
update public.senfx_demo_bot_control c
 set cooldown_seconds=5,updated_at=now()
 where c.mode='stopped' and c.cooldown_seconds>=5
 and exists(select 1 from public.profiles p
  where p.id=c.user_id and p.role='admin');
commit;
