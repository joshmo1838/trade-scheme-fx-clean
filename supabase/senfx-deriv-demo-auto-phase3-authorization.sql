-- OPERATOR-ONLY: separately approved third ONE-USD VIRTUAL Demo pilot grant.
-- Never run before a restorable production backup, QA approval, and current
-- DERIV_DEMO_PILOT_USER_ID allowlist verification; do not run on a preview.
-- One existing phase-2 consumed admin grant must be the only eligible candidate.
-- This does not enable broker trading and never edits historical authorizations.
begin;
do $authorize$
declare
 v_user uuid;
 v_account text;
 v_matches integer;
begin
 select count(*) into v_matches from public.senfx_demo_auto_one_shots g
 join public.deriv_connections c on c.user_id = g.user_id
 where g.status='reserved' and g.consumed_order_id is not null
   and g.account_id = c.active_account_id
   and c.status='connected' and c.active_account_type='demo'
   and (c.expires_at is null or c.expires_at > now())
   and (select count(*) from public.deriv_demo_orders o
        where o.user_id=g.user_id and o.buy_requested_at is not null) = 2
   and (select count(*) from public.deriv_demo_orders o
        where o.user_id=g.user_id and o.buy_requested_at is not null
          and o.status in ('won','lost','sold')) = 2
   and not exists (select 1 from public.deriv_demo_orders o
        where o.user_id=g.user_id and o.status in ('reserved','buy_unknown','open'))
   and not exists (select 1 from public.senfx_demo_auto_phase3_one_shots v3
        where v3.user_id=g.user_id)
   and not exists (select 1 from public.deriv_demo_daily_risk r
        where r.user_id=g.user_id and r.account_id=g.account_id
        and r.risk_date=(now() at time zone 'UTC')::date
        and (r.currency <> 'USD' or r.daily_loss_limit <> 1
             or r.realized_loss <> 0 or r.reserved_loss <> 0));
 if v_matches <> 1 then
   raise exception 'Phase-3 authorization requires exactly one individually verified pilot admin and zero unresolved exposure';
 end if;
 select g.user_id,g.account_id into strict v_user,v_account
 from public.senfx_demo_auto_one_shots g
 join public.deriv_connections c on c.user_id=g.user_id
 where g.status='reserved' and g.consumed_order_id is not null
   and g.account_id=c.active_account_id
   and c.status='connected' and c.active_account_type='demo'
   and (c.expires_at is null or c.expires_at > now())
   and (select count(*) from public.deriv_demo_orders o
        where o.user_id=g.user_id and o.buy_requested_at is not null)=2
   and (select count(*) from public.deriv_demo_orders o
        where o.user_id=g.user_id and o.buy_requested_at is not null
          and o.status in ('won','lost','sold'))=2
   and not exists (select 1 from public.deriv_demo_orders o
        where o.user_id=g.user_id and o.status in ('reserved','buy_unknown','open'))
   and not exists (select 1 from public.senfx_demo_auto_phase3_one_shots v3
        where v3.user_id=g.user_id)
   and not exists (select 1 from public.deriv_demo_daily_risk r
        where r.user_id=g.user_id and r.account_id=g.account_id
        and r.risk_date=(now() at time zone 'UTC')::date
        and (r.currency <> 'USD' or r.daily_loss_limit <> 1
             or r.realized_loss <> 0 or r.reserved_loss <> 0));
 insert into public.senfx_demo_auto_phase3_one_shots(user_id,account_id,status,expires_at)
 values(v_user,v_account,'armed',now()+interval '2 hours');
end;
$authorize$;
commit;
