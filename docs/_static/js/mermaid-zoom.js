// Add pan + zoom controls to every Mermaid diagram.
//
// Mermaid renders client-side (sphinxcontrib-mermaid "raw" mode); svg-pan-zoom is
// loaded from the CDN before this file (see conf.py html_js_files). We poll until
// both the library and at least one rendered <svg> are present, then attach
// svg-pan-zoom to each diagram: +/- and reset buttons, double-click zoom, and
// drag-to-pan. Mouse-wheel zoom is left off so it doesn't hijack page scrolling.
(function () {
    "use strict";

    var DIAGRAM_HEIGHT = 480; // px viewport height per diagram

    function ready() {
        return typeof window.svgPanZoom === "function" &&
            document.querySelector(".mermaid svg");
    }

    function enhance() {
        document.querySelectorAll(".mermaid").forEach(function (box) {
            var svg = box.querySelector("svg");
            if (!svg || box.dataset.zoomReady === "1") return;
            box.dataset.zoomReady = "1";

            // Give the SVG a stable viewport so pan/zoom has dimensions to work with.
            svg.removeAttribute("width");
            svg.removeAttribute("height");
            svg.style.width = "100%";
            svg.style.height = DIAGRAM_HEIGHT + "px";
            svg.style.maxWidth = "100%";
            svg.style.cursor = "grab";

            var pz = window.svgPanZoom(svg, {
                zoomEnabled: true,
                controlIconsEnabled: true,   // on-screen +, -, reset buttons
                fit: true,
                center: true,
                minZoom: 0.3,
                maxZoom: 20,
                zoomScaleSensitivity: 0.35,
                dblClickZoomEnabled: true,
                mouseWheelZoomEnabled: false // keep wheel for page scroll
            });

            window.addEventListener("resize", function () {
                pz.resize();
                pz.fit();
                pz.center();
            });
        });
    }

    function waitFor(tries) {
        tries = tries || 0;
        if (ready()) { enhance(); return; }
        if (tries > 60) return;          // give up after ~12 s
        setTimeout(function () { waitFor(tries + 1); }, 200);
    }

    if (document.readyState === "complete") {
        waitFor();
    } else {
        window.addEventListener("load", function () { waitFor(); });
    }
})();
