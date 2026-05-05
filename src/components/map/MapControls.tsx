'use client';

/**
 * Shared Leaflet control components used by all map views.
 *
 * FullscreenControl — toggle fullscreen on the map container.
 *   Position: topleft (stacks below the zoom buttons).
 *   Uses the native Fullscreen API; calls map.invalidateSize() after
 *   the browser transition so tiles repaint at the correct resolution.
 *
 * ScaleControl — metric scale bar (bottom-left).
 */

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// ── SVG icon strings (inline so no extra assets needed) ──────────────────────

const ICON_EXPAND = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
  viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 3 21 3 21 9"/>
  <polyline points="9 21 3 21 3 15"/>
  <line x1="21" y1="3" x2="14" y2="10"/>
  <line x1="3"  y1="21" x2="10" y2="14"/>
</svg>`;

const ICON_COMPRESS = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14"
  viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="4 14 10 14 10 20"/>
  <polyline points="20 10 14 10 14 4"/>
  <line x1="10" y1="14" x2="3" y2="21"/>
  <line x1="21" y1="3"  x2="14" y2="10"/>
</svg>`;

// ── FullscreenControl ─────────────────────────────────────────────────────────

export function FullscreenControl({ position = 'topleft' }: { position?: L.ControlPosition }) {
    const map = useMap();

    useEffect(() => {
        // Keep track of the FSChange listener so we can remove it on cleanup.
        let onFSChange: (() => void) | null = null;

        const CtrlClass = L.Control.extend({
            onAdd() {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-fullscreen');

                const btn = L.DomUtil.create('a', 'leaflet-control-fullscreen-btn', container) as HTMLAnchorElement;
                btn.href = '#';
                btn.title = 'Enter fullscreen';
                btn.setAttribute('role', 'button');
                btn.setAttribute('aria-label', 'Toggle fullscreen');
                btn.innerHTML = ICON_EXPAND;

                const mapContainer = map.getContainer();

                const toggle = (e: Event) => {
                    L.DomEvent.preventDefault(e);
                    L.DomEvent.stopPropagation(e);
                    if (!document.fullscreenElement) {
                        mapContainer.requestFullscreen().catch(() => {});
                    } else {
                        document.exitFullscreen().catch(() => {});
                    }
                };

                onFSChange = () => {
                    const isFS = !!document.fullscreenElement;
                    btn.innerHTML = isFS ? ICON_COMPRESS : ICON_EXPAND;
                    btn.title = isFS ? 'Exit fullscreen' : 'Enter fullscreen';
                    btn.setAttribute('aria-label', btn.title);
                    // Delay so the browser has finished resizing before Leaflet measures
                    setTimeout(() => map.invalidateSize({ animate: false }), 150);
                };

                L.DomEvent.on(btn, 'click', toggle);
                document.addEventListener('fullscreenchange', onFSChange);

                return container;
            },

            onRemove() {
                // Listener removed in useEffect cleanup below
            },
        });

        const ctrl = new CtrlClass({ position });
        ctrl.addTo(map);

        return () => {
            ctrl.remove();
            if (onFSChange) document.removeEventListener('fullscreenchange', onFSChange);
        };
    }, [map, position]);

    return null;
}

// ── ScaleControl ──────────────────────────────────────────────────────────────

export function ScaleControl({ position = 'bottomleft' }: { position?: L.ControlPosition }) {
    const map = useMap();

    useEffect(() => {
        const ctrl = L.control.scale({ position, metric: true, imperial: false });
        ctrl.addTo(map);
        return () => { ctrl.remove(); };
    }, [map, position]);

    return null;
}
