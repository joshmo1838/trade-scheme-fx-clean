# SENFX production backup checkpoint — Supabase Free plan

**Read-only operator action.** Do not apply the Phase 3 or Phase 4
migration until a production backup has been both created and restored
successfully into a separate disposable database.

Supabase Free projects do not have the automatic daily backup retention
provided by paid plans. Supabase CLI v3's `db dump` default excludes data
and Supabase-managed schemas such as `auth`, so a schema-only CLI export
is **not** sufficient to recover customer accounts.

A guarded full-database `pg_dump` helper is provided in
`scripts/senfx-backup-production.sh`. It reads from the expected
project and writes a custom-format archive outside the Git repository.
It does NOT send data to GitHub or ChatGPT and does NOT change the database.

## Run on a trusted computer

1. Install PostgreSQL 17 or later client tools (`psql`, `pg_dump`,
   `pg_restore`), `sha256sum`, and `git`. Use an encrypted disk.
2. Open Supabase project `ymkrmdvnmkrxffufxmhg` in the Dashboard,
   then use **Connect** to obtain the host/port/username for the
   production **direct** or **session-pooler** database connection.
3. From a local checkout of this repository, supply only the
   non-secret connection settings (adjust for the session pooler):
   ```bash
   export PGHOST='db.ymkrmdvnmkrxffufxmhg.supabase.co'
   export PGPORT='5432'
   export PGUSER='postgres'
   export PGDATABASE='postgres'
   bash scripts/senfx-backup-production.sh
   ```
   The script prompts for the password privately, or uses an existing
   securely configured `PGPASSFILE`. **Never paste credentials into
   this chat or put a connection string in the repository.**
4. The local archive, inventory and SHA-256 checksum go to
   `~/SENFX-private-backups` by default. Move the archive to a private
   encrypted off-site location. Do not upload it to GitHub.
5. **Verify a restore** into a disposable, separate PostgreSQL/Supabase
   environment with the right extensions and managed roles. Check
   Auth users, paper-trade and reservation counts, RLS permissions,
   function grants, SQL restore errors and application login.
   `pg_restore --list` alone does **not** verify restore success.
6. Document the backup timestamp, checksum, recovery destination,
   restore-test result and any gaps in the recovery plan. Keep
   binary Storage objects and project configuration backed up separately.

The archive is a logical PostgreSQL backup, not a full snapshot of every
Supabase-hosted service. Global role passwords, Storage binary objects
and dashboard configuration can require separate recovery procedures.

**Release gate:** Backups must be verified before enabling any migrations
or customer worker flags, even if GitHub CI is green.

Sources:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/reference/cli/supabase-db-dump
