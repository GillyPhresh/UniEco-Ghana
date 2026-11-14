import importlib.util
import json
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("ingest.py")
SPEC = importlib.util.spec_from_file_location("unieco_feed_ingest", MODULE_PATH)
ingest = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(ingest)


class FeedParserTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            "id": "knust", "label": "KNUST", "university_name": "KNUST",
            "feed_url": "https://www.knust.edu.gh/rss.xml", "source_domain": "knust.edu.gh",
        }
        self.now = datetime(2026, 11, 1, tzinfo=timezone.utc)

    def test_rss_extracts_short_attributed_item_and_official_image(self):
        xml = b'''<?xml version="1.0"?><rss><channel><item>
          <title>KNUST announces research workshop</title>
          <guid>story-1</guid><link>https://www.knust.edu.gh/news/workshop?utm_source=test</link>
          <pubDate>Sat, 31 Oct 2026 12:00:00 GMT</pubDate>
          <description><![CDATA[<p>Join researchers.</p><script>ignore me</script><img src="https://www.knust.edu.gh/files/workshop.jpg">]]></description>
        </item></channel></rss>'''
        [item] = ingest.parse_feed(self.source, xml, self.now)
        self.assertEqual(item["category"], "events")
        self.assertEqual(item["canonical_url"], "https://www.knust.edu.gh/news/workshop")
        self.assertEqual(item["media_type"], "image")
        self.assertEqual(item["media_url"], "https://www.knust.edu.gh/files/workshop.jpg")
        self.assertNotIn("ignore me", item["excerpt"])
        self.assertEqual(len(item["source_item_key"]), 64)

    def test_atom_feed_uses_alternate_link_and_skips_off_domain_media(self):
        xml = b'''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:m="http://search.yahoo.com/mrss/">
          <entry><title>New campus research programme</title><id>tag:knust.edu.gh,2026:77</id>
          <link rel="alternate" href="https://knust.edu.gh/programmes/research"/>
          <updated>2026-10-31T10:00:00Z</updated><summary>Research opportunities for students.</summary>
          <m:thumbnail url="https://example.net/outside.jpg"/></entry></feed>'''
        [item] = ingest.parse_feed(self.source, xml, self.now)
        self.assertEqual(item["canonical_url"], "https://knust.edu.gh/programmes/research")
        self.assertIsNone(item["media_url"])
        self.assertIsNone(item["media_type"])

    def test_external_article_link_is_never_queued(self):
        xml = b'''<rss><channel><item><title>University news headline</title>
        <guid>bad-1</guid><link>https://evil.example/collect</link><description>Text</description></item></channel></rss>'''
        self.assertEqual(ingest.parse_feed(self.source, xml, self.now), [])

    def test_old_and_far_future_items_are_skipped(self):
        xml = b'''<rss><channel>
        <item><title>Old university notice</title><guid>old</guid><link>https://knust.edu.gh/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
        <item><title>Future university notice</title><guid>future</guid><link>https://knust.edu.gh/future</link><pubDate>Tue, 01 Dec 2026 00:00:00 GMT</pubDate></item>
        </channel></rss>'''
        self.assertEqual(ingest.parse_feed(self.source, xml, self.now), [])

    def test_unsafe_xml_declarations_are_rejected(self):
        with self.assertRaises(ValueError):
            ingest.parse_feed(self.source, b'<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', self.now)

    def test_feed_config_is_fixed_and_uses_only_https_source_hosts(self):
        sources = ingest.load_sources()
        self.assertGreaterEqual(len(sources), 4)
        for source in sources:
            self.assertTrue(source["feed_url"].startswith("https://"))
            self.assertTrue(ingest.host_allowed(__import__("urllib.parse").parse.urlsplit(source["feed_url"]).hostname, source["source_domain"]))

    def test_homepage_feed_discovery_only_accepts_advertised_rss_or_atom_links(self):
        parser = ingest.AdvertisedFeedParser()
        parser.feed('''<html><head>
          <link rel="alternate" type="application/rss+xml" href="/news/feed.xml">
          <link rel="alternate" type="application/atom+xml" href="https://evil.example/feed.xml">
          <link rel="stylesheet" href="/theme.css">
        </head></html>''')
        self.assertEqual(parser.urls, ["/news/feed.xml", "https://evil.example/feed.xml"])
        page = b"<html><head><title>School</title></head></html>"
        self.assertFalse(ingest.is_feed_document(page))
        self.assertTrue(ingest.is_feed_document(b"<?xml version='1.0'?><rss><channel/></rss>"))
        self.assertFalse(ingest.is_feed_document(b"<!DOCTYPE rss><rss/>"))

    def test_official_school_news_page_extracts_attributed_headline_date_and_image(self):
        page = b'''<html><body><article><h2><a href="/news/student-research-day">School hosts student research day</a></h2>
          <time datetime="2026-10-31T12:00:00Z"></time><img src="/media/research-day.jpg">
          <p>Students presented new projects at the annual campus research day.</p></article></body></html>'''
        [item] = ingest.parse_feed(self.source, page, self.now, "https://www.knust.edu.gh/news/")
        self.assertEqual(item["title"], "School hosts student research day")
        self.assertEqual(item["canonical_url"], "https://www.knust.edu.gh/news/student-research-day")
        self.assertEqual(item["published_at"], "2026-10-31T12:00:00Z")
        self.assertEqual(item["media_url"], "https://www.knust.edu.gh/media/research-day.jpg")
        self.assertEqual(item["media_type"], "image")

    def test_standard_html_doctype_is_allowed_for_official_news(self):
        page = b'''<!DOCTYPE html><html><body><article>
          <h2><a href="/news/campus-fair">University announces annual campus fair event</a></h2>
          <time datetime="2026-10-31"></time><p>Registration opens for the annual campus fair.</p>
        </article></body></html>'''
        [item] = ingest.parse_feed(self.source, page, self.now, "https://www.knust.edu.gh/news/")
        self.assertEqual(item["canonical_url"], "https://www.knust.edu.gh/news/campus-fair")
        self.assertEqual(item["category"], "events")
        self.assertFalse(ingest.has_unsafe_xml_declarations(page))

    def test_school_news_fallback_rejects_external_article_and_recognizes_section_links(self):
        links = ingest.NewsSectionParser()
        links.feed('<a href="/news">News and events</a><a href="https://evil.example/news">News</a>')
        self.assertEqual(links.urls, ["/news", "https://evil.example/news"])
        page = b'<a href="https://evil.example/news/fake">A valid-looking university announcement</a>'
        self.assertEqual(ingest.parse_feed(self.source, page, self.now, "https://www.knust.edu.gh/"), [])

    def test_school_news_fallback_filters_navigation_labels(self):
        parser = ingest.NewsArticleParser()
        parser.feed('<a href="/research">Explore research &amp; policy →</a>'
                    '<a href="/news/campus-day">University students celebrate annual campus day</a>')
        results = parser.results()
        self.assertEqual([item["title"] for item in results], ["University students celebrate annual campus day"])

    def test_feed_worker_restricts_remote_source_directory_to_unieco(self):
        self.assertTrue(ingest.sources_url().startswith("https://www.uniecoghana.com/api/internal/campus-feed/ingest"))

    def test_source_directory_accepts_all_207_school_records(self):
        sources = [dict(self.source, id=f"school-{index}") for index in range(207)]
        with patch.object(ingest, "fetch_configured_sources", return_value=sources), patch.dict(ingest.os.environ, {"UNIECO_FEED_INGEST_TOKEN": "x" * 40}):
            self.assertEqual(len(ingest.load_sources()), 207)

    def test_feed_batch_round_robins_instead_of_filling_from_one_school(self):
        schools = [[{"source": "one", "item": index} for index in range(25)],
                   [{"source": "two", "item": index} for index in range(25)],
                   [{"source": "three", "item": index} for index in range(25)]]
        batch = ingest.balanced_batch(schools, limit=5)
        self.assertEqual([item["source"] for item in batch], ["one", "two", "three", "one", "two"])

    def test_url_cleaning_removes_tracking_and_rejects_non_https(self):
        safe = ingest.safe_source_url("/news?a=1&utm_campaign=x&fbclid=y#section", "https://atu.edu.gh/feed/", "atu.edu.gh")
        self.assertEqual(safe, "https://atu.edu.gh/news?a=1")
        self.assertIsNone(ingest.safe_source_url("http://atu.edu.gh/news", "https://atu.edu.gh/feed/", "atu.edu.gh"))

    def test_official_opportunity_page_extracts_only_relevant_same_domain_links(self):
        source = {
            "id": "neip-student-enterprise", "label": "NEIP student enterprise programme",
            "university_name": "National opportunities across Ghana",
            "feed_url": "https://neip.gov.gh/projects", "source_domain": "neip.gov.gh",
            "source_kind": "opportunities",
        }
        page = b'''<html><body>
          <a href="/programs/seed">Students Entrepreneurship and Enterprise Development programme</a>
          <a href="https://evil.example/seed">Student enterprise seed funding application</a>
          <a href="/about">About the Authority</a>
          <script><a href="/fake">Business grant opportunity</a></script>
        </body></html>'''
        [item] = ingest.parse_feed(source, page, self.now)
        self.assertEqual(item["canonical_url"], "https://neip.gov.gh/programs/seed")
        self.assertEqual(item["category"], "opportunities")
        self.assertIsNone(item["published_at"])
        self.assertIn("Confirm current eligibility", item["excerpt"])

    def test_opportunity_page_rejects_dtd_and_entities(self):
        source = {
            "id": "neip-student-enterprise", "feed_url": "https://neip.gov.gh/projects",
            "source_domain": "neip.gov.gh", "source_kind": "opportunities",
        }
        with self.assertRaises(ValueError):
            ingest.parse_feed(source, b'<!DOCTYPE html [<!ENTITY x SYSTEM "file:///etc/passwd">]><html/>', self.now)


if __name__ == "__main__":
    unittest.main()
