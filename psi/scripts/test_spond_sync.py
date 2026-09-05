#!/usr/bin/env python3
"""Tester for kartleggingen i spond_sync.py. Kjøres med:

    python3 -m unittest discover -s scripts

Ingen avhengigheter: bare standardbiblioteket, så den kan kjøres uten
å installere spond.
"""
import unittest

from spond_sync import (event_kind, first_of, news_slug, plan, plan_news, spond_groups,
                        summarize, summarize_news, title_from, to_event_row, to_news_row, venue_of)

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


class TestInnleggTittel(unittest.TestCase):
    def test_foerste_linje_blir_tittel(self):
        self.assertEqual(title_from("Kick-off på fredag!\n\nTa med gode sko."), "Kick-off på fredag!")

    def test_lang_tekst_klippes_ved_ordgrense(self):
        tittel = title_from("Vi har fått nye tider i hallen fra og med neste uke og det betyr at alle må flytte seg til tirsdag i stedet")
        self.assertLessEqual(len(tittel), 95)
        self.assertTrue(tittel.endswith(" …"))
        self.assertNotIn("  ", tittel)
        # Klippet skal ikke stå midt i et ord.
        self.assertTrue(tittel[:-2].rstrip().split()[-1] in tittel)

    def test_hopper_over_tomme_linjer_foerst(self):
        self.assertEqual(title_from("\n\n  Endelig padel  \nmer tekst"), "Endelig padel")

    def test_slug_er_unik_per_innlegg(self):
        a = news_slug("Kick-off på fredag!", "abc123456")
        b = news_slug("Kick-off på fredag!", "xyz987654")
        self.assertNotEqual(a, b)
        self.assertTrue(a.startswith("kick-off-pa-fredag"))
        self.assertRegex(a, r"^[a-z0-9]+(-[a-z0-9]+)*$")

    def test_slug_taaler_tittel_uten_bokstaver(self):
        self.assertRegex(news_slug("!!! ???", "abc123"), r"^[a-z0-9]+(-[a-z0-9]+)*$")


class TestInnleggRad(unittest.TestCase):
    def post(self, **over):
        p = {"id": "post-1", "text": "Kick-off på fredag!\n\nTa med gode sko.", "timestamp": "2026-09-01T10:00:00Z"}
        p.update(over)
        return p

    def test_kartlegger_feltene(self):
        row = to_news_row(self.post(), "fotball")
        self.assertEqual(row["sport_slug"], "fotball")
        self.assertEqual(row["title"]["nb"], "Kick-off på fredag!")
        self.assertIn("gode sko", row["body"]["nb"])
        self.assertEqual(row["source"], "spond")
        self.assertEqual(row["external_id"], "post-1")
        self.assertEqual(row["published_at"], "2026-09-01T10:00:00Z")

    def test_utkast_som_standard(self):
        self.assertEqual(to_news_row(self.post(), "fotball")["status"], "draft")
        self.assertIs(to_news_row(self.post(), "fotball")["show_on_home"], False)

    def test_kan_publiseres_automatisk_naar_styret_ber_om_det(self):
        self.assertEqual(to_news_row(self.post(), "fotball", publish=True)["status"], "published")

    def test_taaler_andre_feltnavn(self):
        self.assertIsNotNone(to_news_row({"id": "p", "content": "Hei", "createdTime": "2026-01-01T00:00:00Z"}, "padel"))
        self.assertEqual(first_of({"a": " ", "b": "x"}, ("a", "b")), "x")
        self.assertIsNone(first_of({"a": 5}, ("a",)))

    def test_tar_aldri_med_kommentarer_eller_personer(self):
        row = to_news_row(self.post(
            comments=[{"text": "Jeg kan ikke", "author": {"firstName": "Kari"}}],
            author={"id": "medlem-a", "email": "kari@example.com"},
            likes=["medlem-b"],
        ), "fotball")
        flat = repr(row)
        for lekkasje in ("Kari", "example.com", "medlem-a", "likes", "comments"):
            self.assertNotIn(lekkasje, flat)

    def test_hopper_over_tomme_og_slettede(self):
        self.assertIsNone(to_news_row(self.post(text=""), "fotball"))
        self.assertIsNone(to_news_row(self.post(deleted=True), "fotball"))
        self.assertIsNone(to_news_row(self.post(hidden=True), "fotball"))
        self.assertIsNone(to_news_row({"text": "uten id"}, "fotball"))

    def test_uten_dato_faar_dagens(self):
        self.assertTrue(to_news_row({"id": "p", "text": "Hei"}, "padel")["published_at"])


class TestPlanInnlegg(unittest.TestCase):
    def rows(self):
        return [to_news_row({"id": "a", "text": "Ny"}, "fotball"),
                to_news_row({"id": "b", "text": "Gammel"}, "fotball")]

    def test_status_settes_bare_paa_nye(self):
        new, updates, _ = plan_news({"b": "draft"}, self.rows())
        self.assertEqual([r["external_id"] for r in new], ["a"])
        self.assertIn("status", new[0])
        self.assertEqual([r["external_id"] for r in updates], ["b"])
        self.assertNotIn("status", updates[0])   # menneskets valg overlever

    def test_publisert_innlegg_roeres_ikke(self):
        # Noen har lest gjennom og kanskje strøket noe. Da skal ikke
        # synken skrive teksten tilbake fra Spond.
        new, updates, stale = plan_news({"a": "published", "b": "draft"}, self.rows())
        self.assertEqual(new, [])
        self.assertEqual([r["external_id"] for r in updates], ["b"])
        self.assertEqual(stale, [])

    def test_utkast_oppdateres_fra_spond(self):
        _, updates, _ = plan_news({"a": "draft", "b": "draft"}, self.rows())
        self.assertEqual(len(updates), 2)

    def test_borte_fra_spond_ryddes(self):
        _, _, stale = plan_news({"a": "draft", "gammel": "draft"}, [to_news_row({"id": "a", "text": "Ny"}, "fotball")])
        self.assertEqual(stale, ["gammel"])

    def test_oppsummering(self):
        self.assertEqual(summarize_news([1], [2, 3], ["x"]), "1 nye innlegg, 2 oppdatert, 1 fjernet")


if __name__ == "__main__":
    unittest.main()
