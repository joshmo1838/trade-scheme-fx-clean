-- Emergency rollback for the additive 4.0 execution tables.
-- Stop runs first. Keep both tables and all orders for audit/history.
begin;
update public.quantum_demo_bot_control
 set mode='stopped',observed_state='stopped',worker_id=null,lease_expires_at=null,
     stopped_at=now(),last_error='4.0 Demo execution rolled back; reconcile any open/unknown order.',
     control_version=control_version+1,updated_at=now()
 where mode='running';
-- Deliberately retain order/control data and RPCs so recovery and settlement
-- reconciliation stay available after the app/worker release is reverted.
commit;
