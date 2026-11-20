#!/usr/bin/env bash
# Disposable GitHub Actions PostgreSQL-only test. NEVER point at production.
set -Eeuo pipefail
if [[ "$PGDATABASE" != "senfx_demo_qa" || "$PGHOST" != "127.0.0.1" || "$GITHUB_ACTIONS" != "true" ]]; then
  echo "Refusing to run outside ephemeral GitHub Actions QA" >&2
  exit 1
fi
# The earlier test step created a disposable baseline with actual committed RPC.
pg_dump --schema-only --format=custom --no-owner --no-acl \
  -f /tmp/senfx-qa-schema.dump senfx_demo_qa
createdb senfx_legacy_qa
pg_restore --exit-on-error --no-owner --no-acl \
  -d senfx_legacy_qa /tmp/senfx-qa-schema.dump
# Mimic exactly the legacy production 10-unit stake / 20-unit risk rules.
psql -X -v ON_ERROR_STOP=1 -d senfx_legacy_qa <<'SQL'
alter table public.deriv_demo_orders drop constraint deriv_demo_orders_stake_amount_check;
alter table public.deriv_demo_orders add constraint deriv_demo_orders_stake_amount_check check (stake_amount = 10);
alter table public.deriv_demo_orders alter column stake_amount set default 10;
alter table public.deriv_demo_orders drop constraint deriv_demo_orders_ask_price_check;
alter table public.deriv_demo_orders add constraint deriv_demo_orders_ask_price_check check (ask_price > 0 and ask_price <= 10);
alter table public.deriv_demo_daily_risk drop constraint deriv_demo_daily_risk_daily_loss_limit_check;
alter table public.deriv_demo_daily_risk add constraint deriv_demo_daily_risk_daily_loss_limit_check check (daily_loss_limit = 20);
alter table public.deriv_demo_daily_risk alter column daily_loss_limit set default 20;
SQL
# Take real pg_dump of the disposable legacy replica, then restore in another DB.
pg_dump --format=custom --no-owner --no-acl \
  -f /tmp/senfx-legacy-qa-backup.dump senfx_legacy_qa
createdb senfx_restored_qa
pg_restore --exit-on-error --no-owner --no-acl \
  -d senfx_restored_qa /tmp/senfx-legacy-qa-backup.dump
# Apply staged migration and the replacement reservation RPC only to restored QA.
psql -X -v ON_ERROR_STOP=1 -d senfx_restored_qa \
  -f supabase/senfx-deriv-demo-one-dollar-stage-only.sql
psql -X -v ON_ERROR_STOP=1 -d senfx_restored_qa \
  -f supabase/senfx-deriv-demo-safe-reservation.sql
psql -X -v ON_ERROR_STOP=1 -d senfx_restored_qa <<'SQL'
do $test$
declare v_stake text; v_risk text;
begin
  select column_default into v_stake from information_schema.columns
  where table_schema='public' and table_name='deriv_demo_orders' and column_name='stake_amount';
  select column_default into v_risk from information_schema.columns
  where table_schema='public' and table_name='deriv_demo_daily_risk' and column_name='daily_loss_limit';
  if v_stake <> '1' or v_risk <> '1' then
    raise exception 'Restored migration left legacy defaults: stake %, risk %',v_stake,v_risk;
  end if;
  if not exists (select 1 from pg_constraint
    where conrelid='public.deriv_demo_orders'::regclass
      and conname='deriv_demo_orders_stake_amount_check'
      and pg_get_constraintdef(oid) like '%stake_amount = (1)%') then
    raise exception 'Restored migration did not enforce exact 1 USD stake';
  end if;
  if not exists (select 1 from pg_constraint
    where conrelid='public.deriv_demo_daily_risk'::regclass
      and conname='deriv_demo_daily_risk_daily_loss_limit_check'
      and pg_get_constraintdef(oid) like '%daily_loss_limit = (1)%') then
    raise exception 'Restored migration did not enforce 1 USD risk';
  end if;
end;
$test$;
insert into public.deriv_connections
  (user_id,status,active_account_id,active_account_type,expires_at)
values ('00000000-0000-4000-8000-000000000099','connected','VIRTUAL99','demo',now()+interval '1 day');
insert into public.deriv_demo_orders
  (id,request_id,user_id,account_id,currency,ask_price,quote_expires_at)
values (
  '10000000-0000-4000-8000-000000000099',
  '20000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-000000000099',
  'VIRTUAL99','USD',1,now()+interval '10 minutes'
);
do $test$
declare v jsonb;
begin
  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000099'
  );
  if v->>'allowed' <> 'true' or (v->>'reservedLoss')::numeric <> 1
     or (v->>'dailyLossLimit')::numeric <> 1 then
    raise exception 'Restored 1 USD Demo reservation failed: %',v;
  end if;
end;
$test$;
SQL
# Negative test: migration must refuse a nonempty legacy DB, with rollback.
psql -X -v ON_ERROR_STOP=1 -d senfx_legacy_qa <<'SQL'
insert into public.deriv_demo_orders (
 id,request_id,user_id,account_id,currency,ask_price,quote_expires_at
) values (
 '10000000-0000-4000-8000-000000000098',
 '20000000-0000-4000-8000-000000000098',
 '00000000-0000-4000-8000-000000000098',
 'VIRTUAL98','USD',10,now()+interval '10 minutes'
);
SQL
if psql -X -v ON_ERROR_STOP=1 -d senfx_legacy_qa \
   -f supabase/senfx-deriv-demo-one-dollar-stage-only.sql \
   >/tmp/senfx-guard-output.txt 2>&1; then
  echo "FAIL: staged migration accepted nonempty legacy orders" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -d senfx_legacy_qa <<'SQL'
do $test$
declare v_stake text; v_limit text;
begin
  select column_default into v_stake from information_schema.columns
  where table_schema='public' and table_name='deriv_demo_orders' and column_name='stake_amount';
  select column_default into v_limit from information_schema.columns
  where table_schema='public' and table_name='deriv_demo_daily_risk' and column_name='daily_loss_limit';
  if v_stake <> '10' or v_limit <> '20' then
    raise exception 'Failed migration unexpectedly changed legacy defaults: % %',v_stake,v_limit;
  end if;
end;
$test$;
SQL
echo "PASS: disposable legacy pg_dump/pg_restore, one-dollar migration, RPC, and fail-closed rollback QA"
