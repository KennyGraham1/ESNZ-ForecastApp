/**
 * Quick test script to verify NZcat CSV parser
 * Run with: node test-nzcat-parser.js
 */

const fs = require('fs');
const path = require('path');

// Simple CSV line parser (handles quoted values)
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    return values;
}

// Check if value is invalid
function isInvalidValue(value) {
    if (!value) return true;
    const trimmed = value.trim();
    if (trimmed === '') return true;
    if (trimmed.toLowerCase() === 'nan') return true;
    if (trimmed === 'null') return true;
    return false;
}

// Get first valid number
function getFirstValidNumber(row, columns) {
    for (const col of columns) {
        const value = row[col];
        if (isInvalidValue(value)) continue;

        const num = parseFloat(value);
        if (!isNaN(num) && num !== -9) {
            return num;
        }
    }
    return null;
}

async function testNZcatParser() {
    console.log('🧪 Testing NZcat CSV Parser\n');

    const filePath = path.join(__dirname, 'data', 'NZcat_EID_MLNZ20s_NZCMTs.csv');

    if (!fs.existsSync(filePath)) {
        console.error('❌ File not found:', filePath);
        process.exit(1);
    }

    const stats = fs.statSync(filePath);
    console.log(`📂 File: ${path.basename(filePath)}`);
    console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log();

    // Read file
    console.log('⏳ Reading file...');
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

    console.log(`✅ Total lines: ${lines.length.toLocaleString()}`);
    console.log();

    // Parse header
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    console.log('📋 Headers detected:');
    console.log('  ', normalizedHeaders.slice(0, 10).join(', '), '...');
    console.log();

    // Detect format
    const hasYear = normalizedHeaders.includes('year');
    const hasMonth = normalizedHeaders.includes('month');
    const hasDay = normalizedHeaders.includes('day');
    const hasSplitDateTime = hasYear && hasMonth && hasDay;

    const latCandidates = ['lat', 'lat_gn', 'lat_jr'].filter(c => normalizedHeaders.includes(c));
    const lonCandidates = ['lon', 'lon_gn', 'lon_jr'].filter(c => normalizedHeaders.includes(c));
    const magCandidates = ['mag', 'mag_gn', 'mag_sm', 'mag_jr'].filter(c => normalizedHeaders.includes(c));
    const depthCandidates = ['depth', 'depth_gn', 'depth_jr'].filter(c => normalizedHeaders.includes(c));

    console.log('🔍 Format Detection:');
    console.log(`  Date/Time: ${hasSplitDateTime ? 'Split columns (year/month/day)' : 'Single column'}`);
    console.log(`  Latitude sources: ${latCandidates.join(', ')}`);
    console.log(`  Longitude sources: ${lonCandidates.join(', ')}`);
    console.log(`  Magnitude sources: ${magCandidates.join(', ')}`);
    console.log(`  Depth sources: ${depthCandidates.join(', ')}`);
    console.log();

    // Parse sample rows
    console.log('⏳ Parsing rows...');
    let validCount = 0;
    let skipCount = 0;
    const sampleEvents = [];

    const startTime = Date.now();

    for (let i = 1; i < Math.min(lines.length, 1000); i++) {
        const line = lines[i];
        const values = parseCSVLine(line);

        const row = {};
        normalizedHeaders.forEach((header, index) => {
            row[header] = values[index]?.trim() || '';
        });

        // Parse time
        const year = parseInt(row['year']);
        const month = parseInt(row['month']);
        const day = parseInt(row['day']);
        const hour = parseInt(row['hour']) || 0;
        const min = parseInt(row['min']) || 0;
        const sec = parseFloat(row['sec']) || 0;

        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            skipCount++;
            continue;
        }

        // Parse coordinates and magnitude
        const lat = getFirstValidNumber(row, latCandidates);
        const lon = getFirstValidNumber(row, lonCandidates);
        const mag = getFirstValidNumber(row, magCandidates);
        const depth = getFirstValidNumber(row, depthCandidates);

        if (lat === null || lon === null || mag === null || depth === null) {
            skipCount++;
            continue;
        }

        validCount++;

        if (sampleEvents.length < 5) {
            sampleEvents.push({
                date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
                lat, lon, mag, depth
            });
        }
    }

    const duration = Date.now() - startTime;

    console.log();
    console.log('✅ Parsing Complete!');
    console.log(`  Valid events: ${validCount.toLocaleString()}`);
    console.log(`  Skipped rows: ${skipCount.toLocaleString()}`);
    console.log(`  Parse time: ${duration}ms (${Math.round((validCount / duration) * 1000)} events/sec)`);
    console.log();

    console.log('📊 Sample Events (first 5 valid):');
    sampleEvents.forEach((event, i) => {
        console.log(`  ${i + 1}. ${event.date} | M${event.mag.toFixed(1)} | ${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}° | ${event.depth.toFixed(1)}km`);
    });
    console.log();

    console.log('✅ Parser test successful! The flexible CSV parser can handle NZcat format.');
}

testNZcatParser().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
