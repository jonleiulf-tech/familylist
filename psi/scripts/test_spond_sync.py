#!/usr/bin/env python3
"""Tester for kartleggingen i spond_sync.py. Kjøres med:

    python3 -m unittest discover -s scripts

Ingen avhengigheter: bare standardbiblioteket, så den kan kjøres uten
å installere spond.
"""
import unittest

from spond_sync import event_kind, plan, spond_groups, summarize, to_event_row, venue_of

FOTBALL = {"slug": "fotball", "active": True, "spondGroupId": "abc123"}
PADEL = {"slug": "padel", "active": True}
GAMMEL = {"slug": "gammel", "active": False, "spondGroupId": "xyz"}


class TestKobling(unittest.TestCase):
    def test_bare_aktive_grupper_med_id(self):
        self.assertEqual(spond_groups([FOTBALL, PADEL, GAMMEL]), [("fotball", "abc123")])

    def test_tom_id_teller_ikke(self):
        self.assertEqual(spond_groups([{"slug": "x", "spondGroupId": "  "}]), [])


class TestType(unittest.TestCase):
    def test_gjenkjenner_norsk_og_engelsk(self):
        self.assertEqual(event_kind("Trening tirsdag"), "training")
        self.assertEqual(event_kind("Indoor training"), "training")
        self.assertEqual(event_kind("Kamp mot USN Bø"), "match")
        self.assertEqual(event_kind("Turnering i Skien"), "match")
        self.assertEqual(event_kind("Styremøte"), "meeting")
        self.assertEqual(event_kind("Kick-off med pizza"), "social")

    def test_ukjent_blir_arrangement(self):
        self.assertEqual(event_kind("Noe helt annet"), "event")
        self.assertEqual(event_kind(""), "event")

    def test_kamp_vinner_over_trening(self):
        # «Trening før kamp» er en trening; «Kamp etter trening» er en kamp.
        # Kamp sjekkes først, som er det tryggeste for en kalender.
        self.assertEqual(event_kind("Kamp etter trening"), "match")


class TestRad(unittest.TestCase):
    def base(self, **over):
        event = {
            "id": "sp1", "heading": "Kamp mot USN Bø", "description": "Hjemmekamp",
            "startTimestamp": "2026-09-19T12:00:00Z", "endTimestamp": "2026-09-19T14:00:00Z",
            "location": {"feature": "Porsgrunn Arena", "address": "Kjølnes"},
        }
        event.update(over)
        return event

    def test_kartlegger_feltene(self):
        row = to_event_row(self.base(), "fotball")
        self.assertEqual(row["sport_slug"], "fotball")
        self.assertEqual(row["kind"], "match")
        self.assertEqual(row["title"], {"nb": "Kamp mot USN Bø", "en": ""})
        self.assertEqual(row["venue"], "Porsgrunn Arena")
        self.assertEqual(row["status"], "published")
        self.assertEqual(row["source"], "spond")
        self.assertEqual(row["external_id"], "sp1")
        self.assertEqual(row["link_url"], "https://spond.com/client/sponds/sp1/")

    def test_tar_aldri_med_persondata(self):
        # Alt Spond sender utenom hvitelista skal bli igjen.
        row = to_event_row(self.base(
            responses={"acceptedIds": ["medlem-a", "medlem-b"], "declinedIds": ["medlem-c"]},
            owners=[{"id": "medlem-a", "email": "noen@example.com"}],
            recipients={"group": {"members": [{"firstName": "Ola"}]}},
            payment={"amount": 100},
        ), "fotball")
        flat = repr(row)
        for lekkasje in ("acceptedIds", "medlem-a", "example.com", "Ola", "payment", "owners"):
            self.assertNotIn(lekkasje, flat)
        self.assertEqual(set(row) - {
            "sport_slug", "kind", "title", "description", "starts_at", "ends_at",
            "all_day", "venue", "link_url", "status", "source", "external_id",
        }, set())

    def test_avlyst_blir_avlyst(self):
        self.assertEqual(to_event_row(self.base(cancelled=True), "fotball")["status"], "cancelled")

    def test_hopper_over_skjulte_og_forespoersler(self):
        self.assertIsNone(to_event_row(self.base(hidden=True), "fotball"))
        self.assertIsNone(to_event_row(self.base(type="AVAILABILITY"), "fotball"))

    def test_hopper_over_ufullstendige(self):
        self.assertIsNone(to_event_row(self.base(heading=""), "fotball"))
        self.assertIsNone(to_event_row(self.base(startTimestamp=None), "fotball"))
        self.assertIsNone(to_event_row({"heading": "Uten id"}, "fotball"))

    def test_sted_faller_tilbake_paa_adresse(self):
        self.assertEqual(venue_of({"location": {"feature": "", "address": "Skien"}}), "Skien")
        self.assertIsNone(venue_of({}))

    def test_tom_beskrivelse_blir_none(self):
        self.assertIsNone(to_event_row(self.base(description="  "), "fotball")["description"])


class TestPlan(unittest.TestCase):
    def test_fjerner_det_som_er_borte_i_spond(self):
        incoming = [{"external_id": "a", "sport_slug": "fotball"}]
        write, stale = plan({"a", "b"}, incoming)
        self.assertEqual(write, incoming)
        self.assertEqual(stale, ["b"])

    def test_ingenting_aa_fjerne(self):
        self.assertEqual(plan(set(), [{"external_id": "a", "sport_slug": "x"}])[1], [])

    def test_oppsummering_teller_per_gruppe(self):
        rows = [{"sport_slug": "fotball", "external_id": "1"}, {"sport_slug": "fotball", "external_id": "2"}]
        self.assertIn("fotball: 2", summarize(rows, ["x"], [("fotball", "g1"), ("padel", "g2")]))
        self.assertIn("padel: 0", summarize(rows, [], [("fotball", "g1"), ("padel", "g2")]))


if __name__ == "__main__":
    unittest.main()
