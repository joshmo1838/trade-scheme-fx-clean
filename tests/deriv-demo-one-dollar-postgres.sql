-- Disposable GitHub Actions Postgres-only test fixture. NO network / credentials.
-- Never execute this on production or in an existing project database.
\set ON_ERROR_STOP on

create role service_role nologin;

create table public.deriv_connections (
  user_id uuid primary key,
  status text not null default 'connected',
  active_account_id text,
  active_account_type text,
  expires_at timestamptz
);

create table public.deriv_demo_orders (
  id uuid primary key,
  request_id uuid not null,
  user_id uuid not null,
  account_id text not null,
  currency text not null,
  stake_amount numeric not null
    constraint deriv_demo_orders_stake_amount_check check (stake_amount = 1),
  ask_price numeric not null default 1
    constraint deriv_demo_orders_ask_price_check check (ask_price > 0 and ask_price <= 1),
  status text not null default 'quoted',
  risk_date date,
  quote_expires_at timestamptz not null,
  buy_requested_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index deriv_demo_orders_user_request_unique
  on public.deriv_demo_orders(user_id,request_id);
create unique index deriv_demo_orders_one_active_per_user
  on public.deriv_demo_orders(user_id)
  where status in ('reserved','open','buy_unknown');

create table public.deriv_demo_daily_risk (
  user_id uuid not null,
  account_id text not null,
  risk_date date not null,
  currency text not null,
  daily_loss_limit numeric not null default 1
    constraint deriv_demo_daily_risk_daily_loss_limit_check check (daily_loss_limit = 1),
  realized_loss numeric not null default 0,
  reserved_loss numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id,account_id,risk_date)
);

-- Test the actual committed RPC, not a mock of its text.
\ir ../supabase/senfx-deriv-demo-safe-reservation.sql

insert into public.deriv_connections(user_id,active_account_id,active_account_type,expires_at)
values
('00000000-0000-4000-8000-000000000001','D1','demo',now()+interval '1 day'),
('00000000-0000-4000-8000-000000000002','R2','real',now()+interval '1 day'),
('00000000-0000-4000-8000-000000000003','D3','demo',now()+interval '1 day'),
('00000000-0000-4000-8000-000000000004','D4','demo',now()+interval '1 day'),
('00000000-0000-4000-8000-000000000005','D5','demo',now()+interval '1 day'),
('00000000-0000-4000-8000-000000000006','D6','demo',now()+interval '1 day'),
('00000000-0000-4000-8000-000000000007','D7','demo',now()+interval '1 day');

insert into public.deriv_demo_orders
  (id,request_id,user_id,account_id,currency,stake_amount,status,quote_expires_at)
values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','D1','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','D1','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','D2','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','D2','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','R2','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000004','D4','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000005','D5','USD',1,'quoted',now()-interval '15 minutes'),
('10000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000006','D6','EUR',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000007','D7','USD',1,'quoted',now()+interval '15 minutes'),
('10000000-0000-4000-8000-000000000010','20000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000007','D7','USD',1,'quoted',now()+interval '15 minutes');

-- Fake an existing fractional realized virtual loss for the budget check.
insert into public.deriv_demo_daily_risk
  (user_id,account_id,risk_date,currency,daily_loss_limit,realized_loss)
values ('00000000-0000-4000-8000-000000000004','D4',(now() at time zone 'UTC')::date,'USD',1,0.25);

do $tests$
declare
  v jsonb;
begin
  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );
  if v->>'allowed' is distinct from 'true' or (v->>'reservedLoss')::numeric <> 1 then
    raise exception 'One exact $1 Demo USD reservation should pass: %', v;
  end if;

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Repeated same-order reservation should fail: %', v;
  end if;

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Second outstanding same-account order should fail: %', v;
  end if;

  update public.deriv_connections
  set active_account_id = 'D2'
  where user_id = '00000000-0000-4000-8000-000000000001';

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Second outstanding cross-account order should fail: %', v;
  end if;

  update public.deriv_demo_orders
  set status = 'lost',buy_requested_at = now()
  where id = '10000000-0000-4000-8000-000000000001';
  update public.deriv_demo_daily_risk
  set reserved_loss = 0, realized_loss = 1
  where user_id = '00000000-0000-4000-8000-000000000001';

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'A completed pilot must not allow a second attempted buy: %', v;
  end if;

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000005'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Real-money account should fail closed: %', v;
  end if;

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000006'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Daily loss already spent must fail closed: %', v;
  end if;

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000007'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Expired quote should fail closed: %', v;
  end if;
  if (select status from public.deriv_demo_orders
      where id='10000000-0000-4000-8000-000000000007') <> 'expired' then
    raise exception 'Expired quote was not marked expired';
  end if;

  v := public.senfx_demo_reserve_order(
    '00000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000008'
  );
  if v->>'allowed' is distinct from 'false' then
    raise exception 'Non-USD currency must be rejected: %', v;
  end if;
end;
$tests$;

-- Concurrency fixture remains unused by serial tests.
-- Two independent psql processes will reserve 000...007 orders 009 and 010.
