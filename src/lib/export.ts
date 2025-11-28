import { EarthquakeData } from '@/types/earthquake';
import JSZip from 'jszip';
import { formatDateForCSV } from '@/utils/dateFormat';

export function exportToCSV(data: EarthquakeData[], filename: string) {
    if (!data || data.length === 0) return;

    const headers = ['time', 'latitude', 'longitude', 'depth', 'magnitude', 'locality', 'mmi'];
    const csvContent = [
        headers.join(','),
        ...data.map(eq => {
            // Format date as dd/mm/yyyy HH:mm:ss
            const timeStr = formatDateForCSV(eq.time);
            return [
                timeStr,
                eq.latitude,
                eq.longitude,
                eq.depth,
                eq.magnitude,
                `"${eq.locality || ''}"`,
                eq.mmi || ''
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function exportToJSON(data: EarthquakeData[], filename: string) {
    if (!data || data.length === 0) return;

    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export function exportToGeoJSON(data: EarthquakeData[], filename: string) {
    if (!data || data.length === 0) return;

    const geoJSON = {
        type: "FeatureCollection",
        features: data.map(eq => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [eq.longitude, eq.latitude, -eq.depth] // Depth is negative elevation
            },
            properties: {
                magnitude: eq.magnitude,
                depth: eq.depth,
                time: eq.time instanceof Date ? eq.time.toISOString() : eq.time,
                locality: eq.locality,
                mmi: eq.mmi,
                publicID: eq.eventID
            }
        }))
    };

    const jsonContent = JSON.stringify(geoJSON, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/geo+json' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export async function exportToZip(data: EarthquakeData[], filename: string) {
    if (!data || data.length === 0) return;

    const zip = new JSZip();

    // 1. CSV
    const headers = ['time', 'latitude', 'longitude', 'depth', 'magnitude', 'locality', 'mmi'];
    const csvContent = [
        headers.join(','),
        ...data.map(eq => {
            // Format date as dd/mm/yyyy HH:mm:ss
            const timeStr = formatDateForCSV(eq.time);
            return [
                timeStr,
                eq.latitude,
                eq.longitude,
                eq.depth,
                eq.magnitude,
                `"${eq.locality || ''}"`,
                eq.mmi || ''
            ].join(',');
        })
    ].join('\n');
    zip.file(`${filename.replace('.zip', '')}.csv`, csvContent);

    // 2. JSON - format dates in the data before stringifying
    const jsonData = data.map(eq => ({
        ...eq,
        time: formatDateForCSV(eq.time)
    }));
    const jsonContent = JSON.stringify(jsonData, null, 2);
    zip.file(`${filename.replace('.zip', '')}.json`, jsonContent);

    // 3. GeoJSON
    const geoJSON = {
        type: "FeatureCollection",
        features: data.map(eq => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [eq.longitude, eq.latitude, -eq.depth]
            },
            properties: {
                magnitude: eq.magnitude,
                depth: eq.depth,
                time: eq.time instanceof Date ? eq.time.toISOString() : eq.time,
                locality: eq.locality,
                mmi: eq.mmi,
                publicID: eq.eventID
            }
        }))
    };
    zip.file(`${filename.replace('.zip', '')}.geojson`, JSON.stringify(geoJSON, null, 2));

    // 4. Metadata
    const metadata = {
        description: "Earthquake Data Export",
        downloadTimestamp: new Date().toISOString(),
        totalRecords: data.length,
        dataSummary: {
            magnitudeRange: `${Math.min(...data.map(d => d.magnitude)).toFixed(2)} - ${Math.max(...data.map(d => d.magnitude)).toFixed(2)}`,
            depthRangeKm: `${Math.min(...data.map(d => d.depth)).toFixed(1)} - ${Math.max(...data.map(d => d.depth)).toFixed(1)}`,
            timeRange: `${data[data.length - 1].time} to ${data[0].time}`
        }
    };
    zip.file(`${filename.replace('.zip', '')}_metadata.json`, JSON.stringify(metadata, null, 2));

    // Generate and download
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(content);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
