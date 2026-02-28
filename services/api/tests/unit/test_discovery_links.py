from app.domain.harvester_pipeline import discover_recipe_links


def test_discover_recipe_links_from_itemlist():
    html = """
    <script type="application/ld+json">
      {
        "@type": "ItemList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "url": "/recipes/a"},
          {"@type": "ListItem", "position": 2, "url": "/recipes/b"}
        ]
      }
    </script>
    """
    links = discover_recipe_links(html, "https://example.com", max_links=5)
    assert "https://example.com/recipes/a" in links
    assert "https://example.com/recipes/b" in links


def test_discover_recipe_links_from_sitemap():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/recipes/a</loc></url>
      <url><loc>https://example.com/about</loc></url>
      <url><loc>https://example.com/cocktails/b</loc></url>
    </urlset>
    """
    links = discover_recipe_links(xml, "https://example.com", max_links=10)
    assert "https://example.com/recipes/a" in links
    assert "https://example.com/cocktails/b" in links
    assert all("/about" not in link for link in links)
