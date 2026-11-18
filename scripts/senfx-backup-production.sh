#!/usr/bin/env bash
# Read-only, on the operator's trusted machine. Does not install SQL migrations.
set -Eeuo pipefail
umask 077

EXPECTED_PROJECT_REF="ymkrmdvnmkrxffufxmhg"
: "${PGHOST:?Set PGHOST from the Supabase project's Connect panel.}"
: "${PGUSER:?Set PGUSER from the Supabase project's Connect panel.}"
: "${PGDATABASE:?Set PGDATABASE=postgres.}"
if [[ "$PGDATABASE" != "postgres" ]]; then
  echo "Refusing unexpected database name." >&2
  exit 1
fi
if [[ "$PGHOST" == "db.${EXPECTED_PROJECT_REF}.supabase.co" && "$PGUSER" == "postgres" ]]; then
  :
elif [[ "$PGHOST" == *.pooler.supabase.com && "$PGUSER" == "postgres.${EXPECTED_PROJECT_REF}" ]]; then
  :
else
  echo "Refusing host/user combination outside expected SENFX project." >&2
  exit 1
fi

for app in pg_dump pg_restore psql sha256sum git; do
  command -v "$app" >/dev/null 2>&1 || {
    echo "Missing $app. Install PostgreSQL 17+ command-line utilities." >&2
    exit 1
  }
done
client_major=$(pg_dump --version | sed -E 's/.* ([0-9]+)\..*/\1/')
if [[ ! "$client_major" =~ ^[0-9]+$ ]] || ((client_major < 17)); then
  echo "This PostgreSQL 17 project needs pg_dump version 17 or newer." >&2
  exit 1
fi

# Enter passwords securely, never as flags or source-code literals.
if [[ -z "${PGPASSWORD:-}" && -z "${PGPASSFILE:-}" ]]; then
  if [[ ! -t 0 ]]; then
    echo "No interactive password prompt or secure PGPASSFILE configured." >&2
    exit 1
  fi
  read -r -s -p "Database password (hidden): " PGPASSWORD
  echo
  export PGPASSWORD
fi
# Supabase production backups must use TLS; reject accidental plaintext.
if [[ "${PGSSLMODE:-require}" != "require" &&
      "${PGSSLMODE:-require}" != "verify-ca" &&
      "${PGSSLMODE:-require}" != "verify-full" ]]; then
  echo "PGSSLMODE must be require, verify-ca, or verify-full." >&2
  exit 1
fi
export PGSSLMODE="${PGSSLMODE:-require}"
export PGAPPNAME="senfx-readonly-backup"

BACKUP_DIR="${SENFX_BACKUP_DIR:-$HOME/SENFX-private-backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
if git -C "$BACKUP_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Refusing to put a sensitive production database archive in Git." >&2
  exit 1
fi
server_major=$(psql -X -q -A -t -c "select current_setting('server_version_num')::int / 10000")
if [[ ! "$server_major" =~ ^[0-9]+$ ]] || ((server_major != 17)); then
  echo "Production PostgreSQL version changed; review backup process." >&2
  exit 1
fi

STAMP=$(date -u +'%Y%m%dT%H%M%SZ')
FINAL="$BACKUP_DIR/senfx-production-$STAMP.dump"
TEMP=$(mktemp "$BACKUP_DIR/.senfx-archive-XXXXXXXX")
cleanup() {
  [[ ! -e "$TEMP" ]] || rm -f "$TEMP"
  [[ ! -e "$TEMP.list" ]] || rm -f "$TEMP.list"
  unset PGPASSWORD || true
}
trap cleanup EXIT
echo "Creating read-only database archive locally..."
pg_dump --format=custom --no-owner --file="$TEMP" --dbname=postgres
pg_restore --list "$TEMP" > "$TEMP.list"

# A schema-only dump is insufficient. Require actual TABLE DATA entries.
for table in "auth users" "public customer_paper_trades" \
             "public customer_paper_trade_reservations" \
             "public customer_paper_daily_risk"; do
  if ! grep -Eq "TABLE DATA +${table} " "$TEMP.list"; then
    echo "Incomplete dump: missing TABLE DATA for $table. Not a verified backup." >&2
    exit 1
  fi
done

mv "$TEMP" "$FINAL"
mv "$TEMP.list" "$FINAL.list"
chmod 600 "$FINAL" "$FINAL.list"
sha256sum "$FINAL" > "$FINAL.sha256"
chmod 600 "$FINAL.sha256"
echo "PRIVATE ARCHIVE: $FINAL"
echo "Inventory and checksum saved alongside archive."
echo "This checks archive creation, NOT a successful disaster-recovery restore."
echo "Restore into a separate disposable environment before using it as a recovery point."
echo "Do NOT upload the archive to GitHub, ChatGPT, or a public file service."
