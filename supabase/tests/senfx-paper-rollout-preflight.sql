-- SENFX paper-only rollout preflight; read-only and safe in CI or production.
-- Run after the established paper-risk ledger exists, BEFORE phases 3 and 4.
-- Does not select customer data, update tables, or activate workers.
do $preflight$
declare
  missing text[];
  incomplete integer;
  present integer;
begin
  select array_agg(required.name)
    into missing
    from (values
      ('auth.users'),('public.bots'),('public.customer_bots'),
      ('public.customer_bot_configurations'),('public.customer_paper_trades'),
      ('public.customer_paper_daily_risk'),('public.customer_paper_trade_reservations')
    ) as required(name)
    where to_regclass(required.name) is null;
  if missing is not null then
    raise exception 'Required paper prerequisites are missing: %', missing;
  end if;

  select count(*) into incomplete
    from (values
      ('public','bots','id'),('public','bots','name'),
      ('public','bots','market'),('public','bots','is_published'),
      ('public','customer_bots','customer_id'),('public','customer_bots','bot_id'),
      ('public','customer_bots','trading_mode'),('public','customer_bots','selected'),
      ('public','customer_bots','control_status'),
      ('public','customer_bot_configurations','customer_id'),
      ('public','customer_bot_configurations','bot_id'),
      ('public','customer_bot_configurations','trading_mode'),
      ('public','customer_bot_configurations','stake_amount'),
      ('public','customer_bot_configurations','daily_loss_limit'),
      ('public','customer_paper_daily_risk','realized_loss'),
      ('public','customer_paper_daily_risk','reserved_loss'),
      ('public','customer_paper_trade_reservations','id'),
      ('public','customer_paper_trades','reservation_id')
    ) as required(schema_name,table_name,column_name)
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema=required.schema_name
        and c.table_name=required.table_name
        and c.column_name=required.column_name
    );
  if incomplete>0 then
    raise exception 'Paper prerequisites have % incompatible/missing columns', incomplete;
  end if;

  select count(*) into present
  from (values
    ('public.bot_execution_runs'),
    ('public.bot_execution_commands'),
    ('public.bot_execution_paper_positions')
  ) as expected(name)
  where to_regclass(expected.name) is not null;
  if present not in (0,3) then
    raise exception 'Partial prior execution schema (% of 3 tables); stop and inspect manually',present;
  end if;
  raise notice 'PASS: Paper rollout prerequisites and partial-schema safety gate; existing execution tables: %/3',present;
end
$preflight$;
