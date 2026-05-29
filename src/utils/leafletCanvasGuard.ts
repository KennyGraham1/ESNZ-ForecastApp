import L from 'leaflet';

/**
 * Guards Leaflet's canvas renderer against a known 1.9.x teardown race.
 *
 * L.Canvas schedules redraws via requestAnimationFrame. When the map (or a
 * renderer) is removed — e.g. a tab/plot switch or rapid data update — the
 * canvas context is deleted (`delete this._ctx`) but an already-queued frame can
 * still fire `_redraw → _clear → this._ctx.clearRect(...)`, throwing
 * "Cannot read properties of undefined (reading 'clearRect')" and crashing the app.
 *
 * We wrap the context-dereferencing methods so they no-op once `_ctx`/`_container`
 * is gone. This only changes behavior in the torn-down state (where the renderer
 * is being discarded anyway); normal rendering is untouched.
 *
 * Idempotent and global — importing this module anywhere patches the shared
 * L.Canvas prototype exactly once.
 */
const proto = (L as unknown as { Canvas?: { prototype: Record<string, unknown> } }).Canvas?.prototype;

if (proto && !(proto as Record<string, unknown>).__ctxGuardApplied) {
    (proto as Record<string, unknown>).__ctxGuardApplied = true;

    for (const name of ['_redraw', '_update', '_clear', '_draw'] as const) {
        const original = proto[name];
        if (typeof original === 'function') {
            proto[name] = function patched(this: { _ctx?: unknown; _container?: unknown }, ...args: unknown[]) {
                if (!this._ctx || !this._container) return undefined;
                return (original as (...a: unknown[]) => unknown).apply(this, args);
            };
        }
    }
}

export {};
