#!/usr/bin/env python3
"""Speiler arrangementer fra Spond inn i psiusn.no.

Kjøres av .github/workflows/psi-spond-sync.yml, ikke i nettleseren.

Hva den gjør:
  1. Logger inn i Spond som PSIs egen konto (aldri en privatperson sin).
  2. Henter arrangementer og vegginnlegg for hver PSI-gruppe som har
     spondGroupId satt.
  3. Skriver arrangementer til events og innlegg til news, begge med
     source='spond' og external_id = Spond-ID-en, så neste kjøring
     oppdaterer i stedet for å lage duplikater.

Hva den IKKE gjør, med vilje:
  - Leser aldri medlemmer, svar, oppmøte, betaling, kommentarer eller
    meldinger. to_event_row() og to_news_row() bygger radene fra en
    hviteliste, så nye felter i Spond kan ikke lekke inn ved et uhell.
  - Publiserer aldri innlegg av seg selv. Et innlegg skrevet til en lukket
    gruppe er ikke automatisk noe som tåler å ligge åpent på nett, så det
    kommer inn som utkast og et menneske trykker publiser. Vil styret ha
    det motsatt, settes spondAutoPublishPosts i innstillingene.
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
MAX_POSTS_PER_GROUP = 20

# Hvor mye av innlegget som blir overskrift på nettsiden.
TITLE_MAX = 90

# Overskrift → type. Første treff vinner. Norsk og engelsk.
KIND_PATTERNS = [
    ("match", r"\b(kamp|kamper|turnering|cup|seriespill|match|tournament)\b"),
    ("training", r"\b(trening|treninger|økt|okt|training|practice|session)\b"),
    ("meeting", r"\b(møte|moete|styremøte|årsmøte|meeting)\b"),
    ("social", r"\b(sosial|fest|kick.?off|julebord|hyttetur|pizza|social|party)\b"),
]

# Spond dokumenterer ikke formen på innlegg, så vi leter etter flere
# navn og tåler at ett av dem mangler. Tørrkjøringen skriver ut hvilke
# nøkler som faktisk kom, så dette kan strammes inn når vi vet.
POST_TEXT_KEYS = ("text", "content", "message", "body")
POST_TIME_KEYS = ("timestamp", "createdTime", "postedTime", "created")


# ---------------------------------------------------------------- rene funksjoner


def rens_navn(navn: str) -> str:
    """«Psi volleyball», «PSI Volleyball» og «volleyball» blir det samme."""
    return re.sub(r"[^a-z0-9]", "", (navn or "").lower().replace("psi", "", 1))


def auto_matches(sports: list[dict], discovered: list[dict]) -> list[tuple[str, str, str, str]]:
    """Grupper som kan kobles trygt: [(slug, spond_id, psi-navn, spond-navn)].

    Kobler bare når navnet treffer entydig, og bare grupper som ikke
    allerede har en ID. Er to Spond-grupper like nok til å forveksles,
    lar vi begge være og overlater valget til et menneske.
    """
    ledige = [g for g in discovered if g.get("id") and g.get("name")]
    ut = []
    for sport in sports:
        if sport.get("active") is False or (sport.get("spondGroupId") or "").strip():
            continue
        # Både navnet og slug-en teller. «PSI Klatring» i Spond treffer da
        # også en gruppe som heter noe annet på nettsiden, så lenge
        # adressen er /idretter/klatring.
        mål = {rens_navn(sport.get("name", "")), rens_navn(sport.get("slug", ""))} - {""}
        treff = [g for g in ledige if rens_navn(g["name"]) in mål]
        if len(treff) == 1:
            ut.append((sport["slug"], treff[0]["id"], sport.get("name", sport["slug"]), treff[0]["name"]))
    return ut


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


def first_of(source: dict, keys) -> str | None:
    """Første nøkkel som finnes og har innhold. Tåler at Spond bytter navn."""
    for key in keys:
        value = source.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def title_from(text: str) -> str:
    """Innlegg i Spond har ingen overskrift, bare tekst. Første setning blir tittel."""
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    if len(first) > TITLE_MAX:
        cut = first[:TITLE_MAX]
        # Klipp heller ved siste mellomrom enn midt i et ord.
        first = (cut[:cut.rfind(" ")] if " " in cut else cut).rstrip(",.;:-") + " …"
    return first


def news_slug(title: str, uid: str) -> str:
    """Adresse på nettsiden. Spond-ID-en bakerst gjør den unik."""
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()
                  .replace("æ", "ae").replace("ø", "o").replace("å", "a")).strip("-")
    return f"{base[:60].strip('-') or 'innlegg'}-{str(uid)[-6:].lower()}"


def to_news_row(post: dict, sport_slug: str, publish: bool = False) -> dict | None:
    """Ett Spond-innlegg → én rad i news, eller None hvis det skal hoppes over.

    Kommer inn som utkast med mindre styret har bedt om noe annet: et
    innlegg til en lukket gruppe er ikke nødvendigvis ment for åpen nett.
    """
    uid = post.get("id")
    text = first_of(post, POST_TEXT_KEYS)
    when = first_of(post, POST_TIME_KEYS)
    if not uid or not text:
        return None
    if post.get("hidden") or post.get("deleted"):
        return None

    title = title_from(text)
    if not title:
        return None
    return {
        "slug": news_slug(title, uid),
        "sport_slug": sport_slug,
        "title": {"nb": title, "en": ""},
        "lead": None,
        "body": {"nb": text[:8000], "en": ""},
        "image_id": None,
        "link_url": None,
        "status": "published" if publish else "draft",
        "published_at": when or datetime.now(timezone.utc).isoformat(),
        "show_on_home": False,
        "source": "spond",
        "external_id": str(uid),
    }


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


def plan(existing_ids: set[str], incoming: list[dict]) -> tuple[list[dict], list[dict], list[str]]:
    """(nye, oppdateringer, external_id-er som skal slettes).

    Delt i nye og gamle fordi vi skriver dem hver for seg: en unik indeks
    med «where external_id is not null» duger ikke til PostgREST sin
    on_conflict, som lager en ON CONFLICT uten det forbeholdet. Postgres
    svarer da 42P10. Enklere å styre det selv enn å svekke indeksen.

    Slettes: Spond-rader i vinduet vårt som ikke lenger finnes i Spond.
    Et slettet arrangement i Spond skal forsvinne fra nettsiden også.
    """
    new = [row for row in incoming if row["external_id"] not in existing_ids]
    updates = [row for row in incoming if row["external_id"] in existing_ids]
    incoming_ids = {row["external_id"] for row in incoming}
    return new, updates, sorted(existing_ids - incoming_ids)


def plan_news(existing: dict[str, str], incoming: list[dict]) -> tuple[list[dict], list[dict], list[str]]:
    """(nye, oppdateringer, external_id-er som kan slettes).

    `existing` er {external_id: status} for innleggene vi har fra før.

    Regelen er at mennesket vinner så snart det har tatt i innlegget:

      ukjent          → legges inn som utkast (eller publisert, om styret
                        har bedt om automatisk publisering)
      finnes, utkast  → teksten oppdateres fra Spond. Ingen har lest det
                        ennå, så det er trygt, og rettelser i Spond kommer med.
      finnes, ellers  → røres ikke. Er det publisert, har noen lest gjennom
                        og kanskje strøket noe som ikke hørte hjemme på en
                        åpen nettside. Det skal ikke skrives over.

    Forsvinner et innlegg fra Spond, ryddes det bort her også — men bare
    hvis det fortsatt er et utkast (se delete_draft_news).
    """
    new, updates = [], []
    for row in incoming:
        status = existing.get(row["external_id"])
        if status is None:
            new.append(row)
        elif status == "draft":
            updates.append({k: v for k, v in row.items() if k != "status"})
    incoming_ids = {row["external_id"] for row in incoming}
    return new, updates, sorted(set(existing) - incoming_ids)


def summarize(rows: list[dict], stale: list[str], groups: list[tuple[str, str]]) -> str:
    per_group = {}
    for row in rows:
        per_group[row["sport_slug"]] = per_group.get(row["sport_slug"], 0) + 1
    parts = [f"{slug}: {per_group.get(slug, 0)}" for slug, _ in groups]
    return f"{len(rows)} arrangementer ({', '.join(parts) or 'ingen grupper koblet'}), {len(stale)} fjernet"


def summarize_news(new: list[dict], updates: list[dict], stale: list[str]) -> str:
    return f"{len(new)} nye innlegg, {len(updates)} oppdatert, {len(stale)} fjernet"


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

    def setting(self, key: str, default=False):
        """Én verdi fra content-raden 'site'. Tåler at raden ikke finnes."""
        try:
            rows = self._call("GET", "content?select=value&key=eq.site")
        except RuntimeError:
            return default
        value = (rows[0]["value"] if rows else {}) or {}
        return value.get(key, default)

    def set_group_id(self, slug: str, group_id: str) -> None:
        """Skriver spondGroupId inn i sports.data uten å røre resten."""
        rows = self._call("GET", f"sports?select=data&slug=eq.{urllib.parse.quote(slug)}")
        if not rows:
            return
        data = dict(rows[0]["data"] or {})
        data["spondGroupId"] = group_id
        self._call("PATCH", f"sports?slug=eq.{urllib.parse.quote(slug)}", {"data": data},
                   prefer="return=minimal")

    def spond_event_ids(self, since: str) -> set[str]:
        q = f"events?select=external_id&source=eq.spond&starts_at=gte.{urllib.parse.quote(since)}"
        return {r["external_id"] for r in self._call("GET", q) if r.get("external_id")}

    def insert_rows(self, tabell: str, rows: list[dict]) -> None:
        for i in range(0, len(rows), 100):
            self._call("POST", tabell, rows[i:i + 100], prefer="return=minimal")

    def update_by_external_id(self, tabell: str, rows: list[dict]) -> None:
        """Én PATCH per rad. Det er noen titalls i timen; det tåler vi."""
        for row in rows:
            eid = urllib.parse.quote(str(row["external_id"]), safe="")
            felt = {k: v for k, v in row.items() if k != "external_id"}
            self._call("PATCH", f"{tabell}?source=eq.spond&external_id=eq.{eid}", felt,
                       prefer="return=minimal")

    def delete_events(self, external_ids: list[str]) -> None:
        for i in range(0, len(external_ids), 100):
            ids = ",".join(f'"{x}"' for x in external_ids[i:i + 100])
            self._call("DELETE", f"events?source=eq.spond&external_id=in.({urllib.parse.quote(ids)})",
                       prefer="return=minimal")

    def spond_news(self) -> dict[str, str]:
        """{external_id: status} for innlegg vi allerede har hentet."""
        rows = self._call("GET", "news?select=external_id,status&source=eq.spond")
        return {r["external_id"]: r["status"] for r in rows if r.get("external_id")}

    def delete_draft_news(self, external_ids: list[str]) -> None:
        """Rydder bare bort utkast. Publiserte innlegg har noen tatt eierskap til."""
        for i in range(0, len(external_ids), 100):
            ids = ",".join(f'"{x}"' for x in external_ids[i:i + 100])
            self._call("DELETE", f"news?source=eq.spond&status=eq.draft&external_id=in.({urllib.parse.quote(ids)})",
                       prefer="return=minimal")

    def log_run(self, status: str, message: str, detail: dict) -> None:
        try:
            self._call("POST", "sync_runs", {
                "source": "spond", "status": status, "message": message[:1000], "detail": detail,
            }, prefer="return=minimal")
        except RuntimeError as e:
            print(f"Kunne ikke skrive kjørelogg: {e}", file=sys.stderr)


# ---------------------------------------------------------------- kjøring


async def fetch_from_spond(username: str, password: str, groups: list[tuple[str, str]],
                           publish_posts: bool = False, want_posts: bool = True):
    """(arrangementer, innlegg, grupper, nøkler sett i innlegg).

    Importeres her så testene slipper å ha aiohttp installert.
    """
    from spond import spond

    client = spond.Spond(username=username, password=password)
    rows: list[dict] = []
    news: list[dict] = []
    discovered: list[dict] = []
    post_keys: set[str] = set()
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

            if not want_posts:
                continue
            # include_comments=False: kommentarer er samtaler mellom
            # medlemmer, og skal ikke ut på en offentlig nettside.
            posts = await client.get_posts(
                group_id=group_id, max_posts=MAX_POSTS_PER_GROUP, include_comments=False,
            ) or []
            for post in posts:
                if isinstance(post, dict):
                    post_keys.update(post.keys())
                row = to_news_row(post, slug, publish=publish_posts)
                if row:
                    news.append(row)
    finally:
        await client.clientsession.close()
    return rows, news, discovered, sorted(post_keys)


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
    publish_posts = bool(db.setting("spondAutoPublishPosts", False))
    want_posts = bool(db.setting("spondSyncPosts", True))
    since = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).isoformat()

    # Vi logger inn selv om ingen grupper er koblet ennå. Uten det ville
    # /admin aldri fått vite hvilke Spond-grupper som finnes, og man kunne
    # ikke koble noe — man må jo ha ID-ene for å sette dem inn.
    try:
        rows, posts, discovered, post_keys = asyncio.run(
            fetch_from_spond(username, password, groups, publish_posts, want_posts))
    except Exception as e:                                    # noqa: BLE001
        msg = f"Klarte ikke hente fra Spond: {type(e).__name__}: {e}"
        print(msg, file=sys.stderr)
        db.log_run("error", msg, {})
        return 1

    # Kobler det som kan kobles trygt, slik at ingen trenger å lime inn
    # 32 tegn hex for hånd. Bare entydige navnetreff, og bare grupper uten
    # ID fra før — resten står urørt.
    nye = auto_matches(db.sports(), discovered)
    if nye:
        for slug, group_id, psi_navn, spond_navn in nye:
            db.set_group_id(slug, group_id)
            print(f"Koblet {psi_navn} → «{spond_navn}» ({group_id})")
        groups = spond_groups(db.sports())
        # Hent på nytt, nå som vi vet hvilke grupper som hører til hvem.
        try:
            rows, posts, discovered, post_keys = asyncio.run(
                fetch_from_spond(username, password, groups, publish_posts, want_posts))
        except Exception as e:                                # noqa: BLE001
            msg = f"Koblet {len(nye)} gruppe(r), men klarte ikke hente fra Spond: {type(e).__name__}: {e}"
            print(msg, file=sys.stderr)
            db.log_run("error", msg, {"groups": discovered})
            return 1

    if not groups:
        msg = ("Ingen PSI-grupper er koblet til Spond, og ingen navn traff "
               f"entydig. Fant {len(discovered)} gruppe(r) i Spond — koble dem "
               "under Innstillinger → Spond i /admin.")
        print(msg)
        for g in discovered:
            print(f"  {g.get('id')}  {g.get('name')}")
        db.log_run("skipped", msg, {"groups": discovered})
        return 0

    nye_arr, oppdaterte_arr, stale = plan(db.spond_event_ids(since), rows)
    to_write = nye_arr + oppdaterte_arr
    new_news, updated_news, stale_news = plan_news(db.spond_news() if want_posts else {}, posts)
    summary = f"{summarize(to_write, stale, groups)}. {summarize_news(new_news, updated_news, stale_news)}"

    if dry_run:
        print(f"[tørrkjøring] {summary}")
        for row in to_write:
            print(f"  ARR  {row['starts_at']}  {row['sport_slug']:<12} {row['kind']:<9} {row['title']['nb']}")
        for row in new_news + updated_news:
            print(f"  INNL {row['published_at']}  {row['sport_slug']:<12} {row['title']['nb']}")
        if post_keys:
            # Bare nøkkelnavn, aldri innhold: nok til å se formen, uten å
            # legge igjen persondata i en byggelogg.
            print(f"  (felter i innlegg fra Spond: {', '.join(post_keys)})")
        return 0

    if nye_arr:
        db.insert_rows("events", nye_arr)
    if oppdaterte_arr:
        db.update_by_external_id("events", oppdaterte_arr)
    if stale:
        db.delete_events(stale)
    if new_news:
        db.insert_rows("news", new_news)
    if updated_news:
        db.update_by_external_id("news", updated_news)
    if stale_news:
        db.delete_draft_news(stale_news)
    db.log_run("ok", summary, {
        "groups": discovered,
        "posts": {"new": len(new_news), "updated": len(updated_news), "removed": len(stale_news),
                  "auto_published": publish_posts, "enabled": want_posts},
    })
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
