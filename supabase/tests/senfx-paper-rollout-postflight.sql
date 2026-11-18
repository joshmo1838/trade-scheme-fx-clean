-- SENFX phase 3+4 paper-only rollout assertions. Read-only.
-- Run on isolated PostgreSQL in CI and on the deployed schema after migrations.
do $postflight$
declare
  row_name text;
  fn text;
begin
  foreach row_name in array array[
    'public.bot_execution_runs',
    'public.bot_execution_commands',
    'public.bot_execution_paper_positions'
  ] loop
    if to_regclass(row_name) is null then
      raise exception 'Missing paper execution table: %',row_name;
    end if;
    if not exists (select 1 from pg_class c
      where c.oid=to_regclass(row_name) and c.relrowsecurity=true) then
      raise exception 'Paper execution table has RLS disabled: %',row_name;
    end if;
    if has_table_privilege('anon',row_name,'SELECT')
      or has_table_privilege('anon',row_name,'INSERT')
      or has_table_privilege('authenticated',row_name,'INSERT')
      or has_table_privilege('authenticated',row_name,'UPDATE')
      or has_table_privilege('authenticated',row_name,'DELETE') then
      raise exception 'Unexpected customer mutation or anonymous visibility grant: %',row_name;
    end if;
    if not has_table_privilege('authenticated',row_name,'SELECT') then
      raise exception 'Customer-specific read grant missing on %',row_name;
    end if;
  end loop;

  foreach fn in array array[
    'public.senfx_queue_paper_bot_command(uuid,uuid,uuid,text)',
    'public.senfx_paper_worker_sync(uuid,text,text)',
    'public.senfx_paper_worker_reserve(uuid,text,bigint,text,text,numeric,bigint)',
    'public.senfx_paper_worker_tick(uuid,text,bigint,numeric,bigint)'
  ] loop
    if to_regprocedure(fn) is null then
      raise exception 'Missing paper RPC: %',fn;
    end if;
    if has_function_privilege('anon',fn,'EXECUTE') or
       has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Privileged paper RPC callable by customer/anon: %',fn;
    end if;
    if not has_function_privilege('service_role',fn,'EXECUTE') then
      raise exception 'Service role lacks paper RPC: %',fn;
    end if;
  end loop;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='bot_execution_positions_one_open_per_run'
  ) then
    raise exception 'One-open-position risk uniqueness index missing';
  end if;

  raise notice 'PASS: 3 RLS execution tables, 4 server-only RPCs, and one-open-position index';
end
$postflight$;
