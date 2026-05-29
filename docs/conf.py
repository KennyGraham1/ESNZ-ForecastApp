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
    "prev_next_buttons_location": "bottom",
}

# Show the "Edit on GitHub" link (top-right) like the Read the Docs docs site.
# On Read the Docs hosting this is added automatically; this also enables it for
# local builds.
html_context = {
    "display_github": True,
    "github_user": "KennyGraham1",
    "github_repo": "ESNZ-ForecastApp",
    "github_version": "main",
    "conf_py_path": "/docs/",
}

# Widen the content area beyond the theme's 800px cap (see _static/css/custom.css).
html_static_path = ["_static"]
html_css_files = ["css/custom.css"]

# Pan/zoom controls for Mermaid diagrams (svg-pan-zoom from CDN + our init).
html_js_files = [
    "https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js",
    "js/mermaid-zoom.js",
]

# Render Mermaid on the client with the raw (script) method — works on
# Read the Docs without a headless-browser/puppeteer build step.
mermaid_output_format = "raw"
mermaid_version = "10.9.1"
