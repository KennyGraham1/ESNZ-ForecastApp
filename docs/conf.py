"""Sphinx configuration for the ESNZ-ForecastApp documentation.

Markdown sources are parsed with MyST-Parser; the site uses the classic
Read the Docs theme (sphinx_rtd_theme). Mermaid fences render via
sphinxcontrib-mermaid and math via MyST dollarmath + MathJax.
"""

# -- Project information -----------------------------------------------------
project = "ESNZ-ForecastApp"
author = "ESNZ-ForecastApp Contributors"
copyright = "2026, ESNZ-ForecastApp Contributors"

# -- General configuration ---------------------------------------------------
extensions = [
    "myst_parser",
    "sphinxcontrib.mermaid",
]

# Markdown via MyST.
source_suffix = {".md": "markdown"}
master_doc = "index"

# MyST features: $…$ / $$…$$ math, AMS environments, ::: fences, definition
# lists, and GitHub-style heading anchors so cross-page #anchor links resolve.
myst_enable_extensions = [
    "dollarmath",
    "amsmath",
    "colon_fence",
    "deflist",
    "attrs_inline",
]
myst_heading_anchors = 3

# Treat ```mermaid fenced code blocks as the sphinxcontrib-mermaid directive.
myst_fence_as_directive = ["mermaid"]

# Files in docs/ that are not documentation pages.
exclude_patterns = [
    "_build",
    "Thumbs.db",
    ".DS_Store",
    "requirements.txt",
    "reference/*.pdf",
    "javascripts/**",
]

# -- HTML output -------------------------------------------------------------
html_theme = "sphinx_rtd_theme"
html_title = "ESNZ-ForecastApp"
html_theme_options = {
    "collapse_navigation": False,
    "navigation_depth": 3,
    "titles_only": False,
    "style_external_links": True,
}

# Render Mermaid on the client with the raw (script) method — works on
# Read the Docs without a headless-browser/puppeteer build step.
mermaid_output_format = "raw"
mermaid_version = "10.9.1"
