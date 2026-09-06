#!/usr/bin/env bash
# Kjører alle migrasjonene mot en midlertidig PostgreSQL og prøver
# tilgangsreglene. Krever psql og initdb lokalt.
#
#   npm run db:test
#
# Alle radene i tabellen til slutt skal si OK. Skriptet rydder etter seg.
set -euo pipefail
HER="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PGTESTPORT:-5433}"
ROT="$(mktemp -d)"
DATA="$ROT/pg"
SOCK="$ROT/sock"

for b in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin /opt/homebrew/opt/postgresql*/bin; do
  [ -x "$b/initdb" ] && export PATH="$b:$PATH" && break
done
command -v initdb >/dev/null || { echo "Fant ikke initdb. Installer PostgreSQL først."; exit 1; }

# PostgreSQL nekter å kjøre som root. I containere (CI, Codespaces) er man
# gjerne nettopp det, og da kjøres serveren som «postgres» i stedet.
SOM=""
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || { echo "Kjører som root, og brukeren «postgres» finnes ikke."; exit 1; }
  SOM="postgres"
fi
kjør() { if [ -n "$SOM" ]; then su "$SOM" -c "PATH=$PATH $*"; else eval "$@"; fi; }

rydd() { kjør "pg_ctl -D $DATA -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$ROT"; }
trap rydd EXIT

mkdir -p "$DATA" "$SOCK"
# Serveren kjører som en annen bruker når vi er root, og må slippe til.
[ -n "$SOM" ] && chmod 711 "$ROT" && chown -R "$SOM" "$ROT"
kjør "initdb -D $DATA -A trust -U postgres" >/dev/null
# Bare unix-sokkel: da kan skriptet kjøres selv om noe annet holder porten.
{ echo "listen_addresses = ''"; echo "port = $PORT"; echo "unix_socket_directories = '$SOCK'"; } >> "$DATA/postgresql.conf"
kjør "pg_ctl -D $DATA -l $DATA/log start" >/dev/null
PSQL="psql -h $SOCK -p $PORT -U postgres -q -v ON_ERROR_STOP=1"

$PSQL -c "create database psi" >/dev/null
$PSQL -d psi -f "$HER/supabase/tester/00-supabase-stubb.sql" >/dev/null 2>&1

echo "Migrasjoner:"
for f in $(ls "$HER"/supabase/migrations/[0-9]*.sql | sort); do
  if $PSQL -d psi -f "$f" >/dev/null 2>&1; then
    echo "  OK   $(basename "$f")"
  else
    echo "  FEIL $(basename "$f")"
    $PSQL -d psi -f "$f" 2>&1 | grep -i error | head -3
    exit 1
  fi
done

# Hver migrasjon sier at den er trygg å kjøre flere ganger. Det er en
# påstand, og den prøves her: alt kjøres en gang til på samme base.
echo ""
echo "Migrasjoner, andre gang:"
for f in $(ls "$HER"/supabase/migrations/[0-9]*.sql | sort); do
  if $PSQL -d psi -f "$f" >/dev/null 2>&1; then
    echo "  OK   $(basename "$f")"
  else
    echo "  FEIL $(basename "$f") – ikke trygg å kjøre to ganger"
    $PSQL -d psi -f "$f" 2>&1 | grep -i error | head -3
    exit 1
  fi
done

echo ""
echo "Tallene for 2026 (migrasjon 0015):"
T="$($PSQL -d psi -f "$HER/supabase/tester/tall-2026.sql" 2>&1 | grep -v '^$')"
echo "$T" | sed 's/^/  /'
if echo "$T" | grep -q 'AVVIK'; then
  echo ""
  echo "  ^ Et tall stemmer ikke med regnearket eller hovedbokrapporten."
  exit 1
fi

echo ""
echo "Tilgangsregler for økonomien:"
UT="$($PSQL -d psi -f "$HER/supabase/tester/okonomi-tilgang.sql" 2>&1 | grep -v '^$')"
echo "$UT" | sed 's/^/  /'
if echo "$UT" | grep -q 'AVVIK'; then
  echo ""
  echo "  ^ Minst én tilgangsregel gjør ikke det den skal."
  exit 1
fi
echo ""
echo "Alt i orden."
