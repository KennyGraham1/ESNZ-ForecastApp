/**
 * QuakeML 1.2 file parser.
 *
 * QuakeML is a self-describing XML format — column mapping is unnecessary.
 * This parser sets `isDirectImport = true` so CatalogUpload skips the
 * column-mapping wizard and imports directly.
 *
 * Key QuakeML conventions handled here:
 *   - Depth is stored in **metres** → divided by 1000 to produce km.
 *   - preferredOriginID / preferredMagnitudeID choose the canonical
 *     origin/magnitude when multiple are present.
 *   - Locality comes from <description type="region name"><text>.
 *   - Event ID is the last path component of the publicID attribute.
 *   - All element lookups are namespace-agnostic via getElementsByTagNameNS('*', …).
 */

import { FileParser } from './types';
import { FilePreviewResult, CustomParseResult } from '@/lib/csvPreview';
import { ImportOptions, PreviewStatistics } from '@/types/csvUpload';
import { EarthquakeData } from '@/types/earthquake';

// ── XML helpers ───────────────────────────────────────────────────────────────

/** First element with the given local name under parent, any namespace. */
function firstEl(parent: Element | Document, localName: string): Element | null {
    const found = parent.getElementsByTagNameNS('*', localName);
    return found.length > 0 ? found[0] : null;
}

/**
 * Text content of the given QuakeML quantity element.
 * Handles both `<tag><value>TEXT</value></tag>` (standard) and
 * `<tag>TEXT</tag>` (simplified) patterns.
 */
function quantityValue(parent: Element, tagName: string): string | null {
    const container = firstEl(parent, tagName);
    if (!container) return null;
    const valEl = firstEl(container, 'value');
    const raw = valEl ? valEl.textContent : container.textContent;
    return raw?.trim() || null;
}

/** Text content of the first child with the given local name. */
function childText(parent: Element, localName: string): string | null {
    const el = firstEl(parent, localName);
    return el ? el.textContent?.trim() || null : null;
}

/** Last path component of a QuakeML publicID URI. */
function extractEventId(publicID: string): string {
    if (!publicID) return '';
    return publicID.split('/').pop() || publicID;
}

/**
 * Find the element in `elements` whose publicID attribute matches `preferredId`.
 * Falls back to the first element when no match is found.
 */
function findPreferred(elements: Element[], preferredId: string | null): Element | null {
    if (elements.length === 0) return null;
    if (preferredId) {
        for (const el of elements) {
            const id = el.getAttribute('publicID') || el.getAttribute('publicid') || '';
            if (id === preferredId) return el;
        }
    }
    return elements[0];
}

/** Region name from QuakeML event descriptions. */
function getLocality(eventEl: Element): string {
    const descs = eventEl.getElementsByTagNameNS('*', 'description');
    for (let i = 0; i < descs.length; i++) {
        const typeEl = firstEl(descs[i], 'type');
        if (typeEl?.textContent?.trim().toLowerCase() === 'region name') {
            const textEl = firstEl(descs[i], 'text');
            const val = textEl?.textContent?.trim();
            if (val) return val;
        }
    }
    return 'Unknown Location';
}

// ── Core parse ────────────────────────────────────────────────────────────────

interface ParseResult {
    events: EarthquakeData[];
    errors: string[];
    warnings: string[];
}

function parseQuakeML(xml: string): ParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const events: EarthquakeData[] = [];

    const domParser = new DOMParser();
    const doc = domParser.parseFromString(xml, 'application/xml');

    // DOMParser signals XML errors via a <parsererror> element.
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) {
        return {
            events: [],
            errors: [`XML parse error: ${parseErr.textContent?.slice(0, 300) ?? 'unknown'}`],
            warnings: [],
        };
    }

    const eventEls = Array.from(doc.getElementsByTagNameNS('*', 'event'));
    if (eventEls.length === 0) {
        return {
            events: [],
            errors: ['No <event> elements found — is this a valid QuakeML file?'],
            warnings: [],
        };
    }

    for (let i = 0; i < eventEls.length; i++) {
        const eventEl = eventEls[i];
        const num = i + 1;

        // Event public ID
        const publicID = eventEl.getAttribute('publicID') || eventEl.getAttribute('publicid') || '';
        const eventID = extractEventId(publicID) || `qml_${num}`;

        // Preferred origin
        const prefOriginId = childText(eventEl, 'preferredOriginID');
        const origins = Array.from(eventEl.getElementsByTagNameNS('*', 'origin'));
        const originEl = findPreferred(origins, prefOriginId);
        if (!originEl) {
            warnings.push(`Event ${num} (${eventID}): no origin element — skipped`);
            continue;
        }

        // Origin time
        const timeStr = quantityValue(originEl, 'time');
        if (!timeStr) {
            warnings.push(`Event ${num} (${eventID}): no origin time — skipped`);
            continue;
        }
        const time = new Date(timeStr);
        if (isNaN(time.getTime())) {
            warnings.push(`Event ${num} (${eventID}): unparseable time "${timeStr}" — skipped`);
            continue;
        }

        // Coordinates
        const latStr = quantityValue(originEl, 'latitude');
        const lonStr = quantityValue(originEl, 'longitude');
        const latitude = latStr !== null ? parseFloat(latStr) : NaN;
        const longitude = lonStr !== null ? parseFloat(lonStr) : NaN;
        if (isNaN(latitude) || isNaN(longitude)) {
            warnings.push(`Event ${num} (${eventID}): invalid coordinates — skipped`);
            continue;
        }

        // Depth: QuakeML uses metres; EarthquakeData uses km.
        const depthStr = quantityValue(originEl, 'depth');
        const depthKm = depthStr !== null && !isNaN(parseFloat(depthStr))
            ? parseFloat(depthStr) / 1000
            : 0;

        // Preferred magnitude
        const prefMagId = childText(eventEl, 'preferredMagnitudeID');
        const magnitudeEls = Array.from(eventEl.getElementsByTagNameNS('*', 'magnitude'));
        const magEl = findPreferred(magnitudeEls, prefMagId);
        const magStr = magEl ? quantityValue(magEl, 'mag') : null;
        const magnitude = magStr !== null ? parseFloat(magStr) : NaN;
        if (isNaN(magnitude)) {
            warnings.push(`Event ${num} (${eventID}): invalid or missing magnitude — skipped`);
            continue;
        }

        events.push({
            eventID,
            time,
            timeMs: time.getTime(),
            latitude,
            longitude,
            depth: depthKm,
            magnitude,
            locality: getLocality(eventEl),
        });
    }

    // Newest first (consistent with GeoNet catalog)
    events.sort((a, b) => b.timeMs! - a.timeMs!);

    return { events, errors, warnings };
}

// ── Empty stats helper ────────────────────────────────────────────────────────

function emptyStats(): PreviewStatistics {
    return {
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        skippedRows: 0,
        minDate: null,
        maxDate: null,
        minMagnitude: null,
        maxMagnitude: null,
        minDepth: null,
        maxDepth: null,
        minLatitude: null,
        maxLatitude: null,
        minLongitude: null,
        maxLongitude: null,
        sampleWarnings: [],
    };
}

// ── Parser class ──────────────────────────────────────────────────────────────

export class QmlParser implements FileParser {
    /**
     * Skip the column-mapping wizard — QuakeML is self-describing.
     * CatalogUpload checks this flag and offers a one-click import instead.
     */
    readonly isDirectImport = true;

    canParse(file: File): boolean {
        const name = file.name.toLowerCase();
        return name.endsWith('.qml') || name.endsWith('.quakeml') || name.endsWith('.xml');
    }

    async getPreview(file: File): Promise<FilePreviewResult> {
        try {
            const xml = await file.text();
            const { events, errors } = parseQuakeML(xml);

            if (errors.length > 0 && events.length === 0) {
                return {
                    success: false,
                    headers: [],
                    previewRows: [],
                    totalRows: 0,
                    errors,
                    detectedDelimiter: '',
                    commentedLinesSkipped: 0,
                };
            }

            const headers = ['eventID', 'time', 'latitude', 'longitude', 'depth (km)', 'magnitude', 'locality'];
            const previewRows = events.slice(0, 10).map(eq => [
                eq.eventID,
                eq.time.toISOString(),
                eq.latitude.toFixed(4),
                eq.longitude.toFixed(4),
                eq.depth.toFixed(1),
                eq.magnitude.toFixed(1),
                eq.locality,
            ]);

            return {
                success: true,
                headers,
                previewRows,
                totalRows: events.length,
                detectedDelimiter: '',
                commentedLinesSkipped: 0,
            };
        } catch (err) {
            return {
                success: false,
                headers: [],
                previewRows: [],
                totalRows: 0,
                errors: [`Failed to read QuakeML: ${err instanceof Error ? err.message : 'Unknown error'}`],
                detectedDelimiter: '',
                commentedLinesSkipped: 0,
            };
        }
    }

    /** `_options.mapping` is intentionally ignored — QuakeML is self-describing. */
    async parse(file: File, _options: ImportOptions): Promise<CustomParseResult> {
        try {
            const xml = await file.text();
            const { events, errors, warnings } = parseQuakeML(xml);

            if (errors.length > 0 && events.length === 0) {
                return {
                    success: false,
                    data: [],
                    statistics: emptyStats(),
                    errors,
                    warnings,
                };
            }

            // Build statistics
            const stats = emptyStats();
            stats.totalRows = events.length + warnings.length;
            stats.invalidRows = warnings.length;
            stats.sampleWarnings = warnings.slice(0, 5);

            for (const eq of events) {
                stats.validRows++;
                if (!stats.minDate || eq.time < stats.minDate) stats.minDate = eq.time;
                if (!stats.maxDate || eq.time > stats.maxDate) stats.maxDate = eq.time;
                if (stats.minMagnitude === null || eq.magnitude < stats.minMagnitude) stats.minMagnitude = eq.magnitude;
                if (stats.maxMagnitude === null || eq.magnitude > stats.maxMagnitude) stats.maxMagnitude = eq.magnitude;
                if (stats.minDepth === null || eq.depth < stats.minDepth) stats.minDepth = eq.depth;
                if (stats.maxDepth === null || eq.depth > stats.maxDepth) stats.maxDepth = eq.depth;
                if (stats.minLatitude === null || eq.latitude < stats.minLatitude) stats.minLatitude = eq.latitude;
                if (stats.maxLatitude === null || eq.latitude > stats.maxLatitude) stats.maxLatitude = eq.latitude;
                if (stats.minLongitude === null || eq.longitude < stats.minLongitude) stats.minLongitude = eq.longitude;
                if (stats.maxLongitude === null || eq.longitude > stats.maxLongitude) stats.maxLongitude = eq.longitude;
            }

            return {
                success: events.length > 0,
                data: events,
                statistics: stats,
                errors: events.length === 0 ? ['No valid events could be parsed from this QuakeML file'] : errors,
                warnings,
            };
        } catch (err) {
            return {
                success: false,
                data: [],
                statistics: emptyStats(),
                errors: [`Failed to parse QuakeML: ${err instanceof Error ? err.message : 'Unknown error'}`],
                warnings: [],
            };
        }
    }
}
