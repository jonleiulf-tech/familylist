#!/usr/bin/env python3
"""Speiler arrangementer fra Spond inn i psiusn.no.

Kjøres av .github/workflows/psi-spond-sync.yml, ikke i nettleseren.

Hva den gjør:
  1. Logger inn i Spond som PSIs egen konto (aldri en privatperson sin).
  2. Henter arrangementer for hver PSI-gruppe som har spondGroupId satt.
  3. Skriver dem til Supabase-tabellen events med source='spond' og
     external_id = Spond-ID-en, så neste kjøring oppdaterer i stedet for
     å lage duplikater.

Hva den IKKE gjør, med vilje:
  - Leser aldri medlemmer, svar, oppmøte, betaling eller meldinger.
    to_event_row() bygger raden fra en hviteliste, så nye felter i Spond
    kan ikke lekke inn ved et uhell.
  - Rører aldri rader et menneske har laget (source='manual').
  - Rører aldri hidden_by_admin, så styret kan skjule en post uten at
    neste kjøring overstyrer dem.

Spond har ikke et offentlig API. Biblioteket (pypi.org/project/spond)
snakker med det interne, og kan slutte å virke uten forvarsel. Derfor:
feiler dette, står nettsiden som før på grunnskjemaet i src/data/psi.js.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# Vindu vi synker. Litt bakover for at avlysninger i går skal komme med.
DAYS_BACK = 2
DAYS_AHEAD = 120

# Overskrift → type. Første treff vinner. Norsk og engelsk.
KIND_PATTERNS = [
    ("match", r"\b(kamp|kamper|turnering|cup|seriespill|match|tournament)\b"),
    ("training", r"\b(trening|treninger|økt|okt|training|practice|session)\b"),
    ("meeting", r"\b(møte|moete|styremøte|årsmøte|meeting)\b"),
    ("social", r"\b(sosial|fest|kick.?off|julebord|hyttetur|pizza|social|party)\b"),
]

WEBSITE_FIELDS = (
    "id", "sport_slug", "kind", "title", "description", "starts_at", "ends_at",
    "all_day", "venue", "link_url", "status", "source", "external_id",
)


# ---------------------------------------------------------------- rene funksjoner


def spond_groups(sports: list[dict]) -> list[tuple[str, str]]:
    """[(psi-slug, spond-gruppe-id)] for aktive grupper som er koblet."""
    out = []
    for s in sports:
        if s.get("active") is False:
            continue
        gid = (s.get("spondGroupId") or "").strip()
        if gid:
            out.append((s["slug"], gid))
    return out


def event_kind(heading: str) -> str:
    """Gjetter type ut fra overskriften. Ukjent blir 'event'."""
    text = (heading or "").lower()
    for kind, pattern in KIND_PATTERNS:
        if re.search(pattern, text):
            return kind
    return "event"


def venue_of(event: dict) -> str | None:
    loc = event.get("location") or {}
    for key in ("feature", "address"):
        value = (loc.get(key) or "").strip()
        if value:
            return value[:200]
    return None


def to_event_row(event: dict, sport_slug: str) -> dict | None:
    """Ett Spond-arrangement → én rad i events, eller None hvis det skal hoppes over.

    Bygger raden felt for felt fra en hviteliste. Alt annet Spond sender
    (deltakere, svar, betaling, oppgaver) blir liggende igjen her.
    """
    uid = event.get("id")
    start = event.get("startTimestamp")
    heading = (event.get("heading") or "").strip()
    if not uid or not start or not heading:
        return None
    if event.get("hidden"):
        return None
    if (event.get("type") or event.get("spondType")) == "AVAILABILITY":
        return None  # tilgjengelighetsforespørsel, ikke et arrangement

    cancelled = bool(event.get("cancelled"))
    description = (event.get("description") or "").strip()
    return {
        "sport_slug": sport_slug,
        "kind": event_kind(heading),
        "title": {"nb": heading[:200], "en": ""},
        "description": {"nb": description[:2000], "en": ""} if description else None,
        "starts_at": start,
        "ends_at": event.get("endTimestamp"),
        "all_day": False,
        "venue": venue_of(event),
        "link_url": f"https://spond.com/client/sponds/{uid}/",
        "status": "cancelled" if cancelled else "published",
        "source": "spond",
        "external_id": str(uid),
    }


def plan(existing_ids: set[str], incoming: list[dict]) -> tuple[list[dict], list[str]]:
    """(rader som skal skrives, external_id-er som skal slettes).

    Slettes: Spond-rader i vinduet vårt som ikke lenger finnes i Spond.
    Et slettet arrangement i Spond skal forsvinne fra nettsiden også.
    """
    incoming_ids = {row["external_id"] for row in incoming}
    return incoming, sorted(existing_ids - incoming_ids)


def summarize(rows: list[dict], stale: list[str], groups: list[tuple[str, str]]) -> str:
    per_group = {}
    for row in rows:
        per_group[row["sport_slug"]] = per_group.get(row["sport_slug"], 0) + 1
    parts = [f"{slug}: {per_group.get(slug, 0)}" for slug, _ in groups]
    return f"{len(rows)} arrangementer ({', '.join(parts) or 'ingen grupper koblet'}), {len(stale)} fjernet"


# ---------------------------------------------------------------- Supabase (REST)


class Supabase:
    """Minimal klient. Bruker service_role-nøkkelen, som bare finnes i CI."""

    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/").removesuffix("/rest/v1")
        self.key = key

    def _call(self, method: str, path: str, body=None, prefer: str | None = None):
        req = urllib.request.Request(f"{self.url}/rest/v1/{path}", method=method)
        req.add_header("apikey", self.key)
        req.add_header("Authorization", f"Bearer {self.key}")
        req.add_header("Content-Type", "application/json")
        if prefer:
            req.add_header("Prefer", prefer)
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urllib.request.urlopen(req, data, timeout=60) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw.strip() else []
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {method} {path}: {e.code} {e.read().decode()[:400]}") from e

    def sports(self) -> list[dict]:
        rows = self._call("GET", "sports?select=slug,active,data&order=sort_order")
        return [{**r["data"], "slug": r["slug"], "active": r["active"]} for r in rows]

    def spond_event_ids(self, since: str) -> set[str]:
        q = f"events?select=external_id&source=eq.spond&starts_at=gte.{urllib.parse.quote(since)}"
        return {r["external_id"] for r in self._call("GET", q) if r.get("external_id")}

    def upsert_events(self, rows: list[dict]) -> None:
        for i in range(0, len(rows), 100):
            self._call("POST", "events?on_conflict=external_id", rows[i:i + 100],
                       prefer="resolution=merge-duplicates,return=minimal")

    def delete_events(self, external_ids: list[str]) -> None:
        for i in range(0, len(external_ids), 100):
            ids = ",".join(f'"{x}"' for x in external_ids[i:i + 100])
            self._call("DELETE", f"events?source=eq.spond&external_id=in.({urllib.parse.quote(ids)})",
                       prefer="return=minimal")

    def log_run(self, status: str, message: str, detail: dict) -> None:
        try:
            self._call("POST", "sync_runs", {
                "source": "spond", "status": status, "message": message[:1000], "detail": detail,
            }, prefer="return=minimal")
        except RuntimeError as e:
            print(f"Kunne ikke skrive kjørelogg: {e}", file=sys.stderr)


# ---------------------------------------------------------------- kjøring


async def fetch_from_spond(username: str, password: str, groups: list[tuple[str, str]]):
    """(rader, oppdagede grupper). Importeres her så testene slipper aiohttp."""
    from spond import spond

    client = spond.Spond(username=username, password=password)
    rows: list[dict] = []
    discovered: list[dict] = []
    try:
        for group in await client.get_groups() or []:
            discovered.append({"id": group.get("id"), "name": group.get("name")})

        now = datetime.now(timezone.utc)
        for slug, group_id in groups:
            events = await client.get_events(
                group_id=group_id,
                min_end=now - timedelta(days=DAYS_BACK),
                max_start=now + timedelta(days=DAYS_AHEAD),
                max_events=200,
            ) or []
            for event in events:
                row = to_event_row(event, slug)
                if row:
                    rows.append(row)
    finally:
        await client.clientsession.close()
    return rows, discovered


def main() -> int:
    username = os.environ.get("SPOND_USERNAME", "").strip()
    password = os.environ.get("SPOND_PASSWORD", "")
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    dry_run = "--dry-run" in sys.argv

    if not url or not key:
        print("Mangler SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        return 2
    if not username or not password:
        print("Mangler SPOND_USERNAME og SPOND_PASSWORD.", file=sys.stderr)
        return 2

    db = Supabase(url, key)
    groups = spond_groups(db.sports())
    if not groups:
        msg = "Ingen grupper har spondGroupId. Sett den i /admin under hver gruppe."
        print(msg)
        db.log_run("skipped", msg, {})
        return 0

    since = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).isoformat()
    try:
        rows, discovered = asyncio.run(fetch_from_spond(username, password, groups))
    except Exception as e:                                    # noqa: BLE001
        msg = f"Klarte ikke hente fra Spond: {type(e).__name__}: {e}"
        print(msg, file=sys.stderr)
        db.log_run("error", msg, {})
        return 1

    to_write, stale = plan(db.spond_event_ids(since), rows)
    summary = summarize(to_write, stale, groups)
    if dry_run:
        print(f"[tørrkjøring] {summary}")
        for row in to_write:
            print(f"  {row['starts_at']}  {row['sport_slug']:<12} {row['kind']:<9} {row['title']['nb']}")
        return 0

    if to_write:
        db.upsert_events(to_write)
    if stale:
        db.delete_events(stale)
    db.log_run("ok", summary, {"groups": discovered})
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
