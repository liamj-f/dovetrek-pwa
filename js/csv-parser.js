/**
 * DoveTrek CSV Parser Module
 * Parses opening times and distance matrix CSVs
 */

const CSVParser = (function() {

    /**
     * Parse CSV text into array of objects
     * @param {string} csvText - Raw CSV content
     * @param {boolean} hasHeader - Whether first row is header
     * @returns {Array} Array of objects with header keys or arrays
     */
    function parse(csvText, hasHeader = true) {
        // Remove BOM if present
        const cleanedText = csvText.replace(/^\uFEFF/, '');
        const lines = cleanedText.trim().split(/\r?\n/);
        if (lines.length === 0) return [];

        const result = [];
        let headers = null;

        for (let i = 0; i < lines.length; i++) {
            const values = parseLine(lines[i]);

            if (i === 0 && hasHeader) {
                headers = values.map(h => h.trim());
                continue;
            }

            if (headers) {
                const obj = {};
                headers.forEach((header, idx) => {
                    obj[header] = values[idx] !== undefined ? values[idx].trim() : '';
                });
                result.push(obj);
            } else {
                result.push(values);
            }
        }

        return result;
    }

    /**
     * Parse a single CSV line handling quoted fields
     */
    function parseLine(line) {
        const result = [];
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
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }

    /**
     * Parse openings CSV into checkpoint data
     * Format: CP,BNG,1000,1030,1100,...,1700 (time slots as columns, 0/1 values)
     * @param {string} csvText - Raw CSV content
     * @returns {Object} { checkpoints: Map, startTime: number, finishWindow: {open, close}, timeSlots: Array }
     */
    function parseOpenings(csvText) {
        const rows = parse(csvText, true);
        if (rows.length === 0) return { checkpoints: new Map(), startTime: 600, finishWindow: { open: 960, close: 1020 }, timeSlots: [] };

        // Extract headers to find time slots
        const firstRow = rows[0];
        const headers = Object.keys(firstRow);

        // Find time slot columns (4-digit numbers like 1000, 1030, etc.)
        const timeSlots = headers
            .filter(h => /^\d{4}$/.test(h))
            .map(h => {
                const hours = parseInt(h.substring(0, 2), 10);
                const minutes = parseInt(h.substring(2, 4), 10);
                return { header: h, minutes: hours * 60 + minutes };
            })
            .sort((a, b) => a.minutes - b.minutes);

        const checkpoints = new Map();
        let startTime = 600; // 10:00 default
        let finishWindow = { open: 960, close: 1020 }; // 16:00-17:00 default

        for (const row of rows) {
            const name = (row['CP'] || row['Checkpoint'] || row['checkpoint'] || '').trim();
            if (!name) continue;

            const bng = (row['BNG'] || row['bng'] || '').trim();

            // Parse open slots from time columns
            const openSlots = parseTimeSlots(row, timeSlots);

            const checkpoint = {
                name,
                bng,
                openSlots,
                coords: null // Will be filled by BNG converter
            };

            // Handle special checkpoints
            const upperName = name.toUpperCase();
            if (upperName === 'START' || upperName === 'STRT') {
                checkpoint.isStart = true;
                // Start time is the first open slot
                if (openSlots.length > 0) {
                    startTime = openSlots[0].open;
                }
            } else if (upperName === 'FINISH' || upperName === 'FIN') {
                checkpoint.isFinish = true;
                // Finish window is the first open slot range
                if (openSlots.length > 0) {
                    finishWindow = {
                        open: openSlots[0].open,
                        close: openSlots[0].close
                    };
                }
            }

            checkpoints.set(name, checkpoint);
        }

        return { checkpoints, startTime, finishWindow, timeSlots };
    }

    /**
     * Parse time slots from row data
     * Converts grid of 0/1 values into open slot ranges
     */
    function parseTimeSlots(row, timeSlots) {
        const openSlots = [];
        let currentSlot = null;

        for (let i = 0; i < timeSlots.length; i++) {
            const slot = timeSlots[i];
            const isOpen = row[slot.header] === '1';

            if (isOpen) {
                if (!currentSlot) {
                    // Start a new open slot
                    currentSlot = { open: slot.minutes, close: slot.minutes };
                }
                // Extend the close time (add 30 min for each slot)
                currentSlot.close = slot.minutes + 30;
            } else {
                if (currentSlot) {
                    // Close the current slot
                    openSlots.push(currentSlot);
                    currentSlot = null;
                }
            }
        }

        // Don't forget the last slot if still open
        if (currentSlot) {
            openSlots.push(currentSlot);
        }

        return openSlots;
    }

    /**
     * Parse distance matrix CSV
     * Expected format: From,To,Distance,HeightGain,Source or similar
     * Also handles: Origin,Destination,Dist,Ascent,etc.
     * @param {string} csvText - Raw CSV content
     * @returns {Map} Map of "from|to" -> {distance, heightGain, source}
     */
    function parseDistances(csvText) {
        const rows = parse(csvText, true);
        const distances = new Map();

        // Try to detect column names
        if (rows.length === 0) return distances;

        const sampleRow = rows[0];
        const headers = Object.keys(sampleRow);

        // Find the columns we need (handle various naming conventions)
        const fromCol = headers.find(h => /^(from|origin|start|startcp|source)$/i.test(h)) || headers[0];
        const toCol = headers.find(h => /^(to|dest|destination|end|target|finishcp|finish)$/i.test(h)) || headers[1];
        const distCol = headers.find(h => /^(dist|distance|length|km)$/i.test(h));
        const heightCol = headers.find(h => /^(height|heightgain|height_gain|ascent|climb|elevation)$/i.test(h));
        const sourceCol = headers.find(h => /^(source|provider|api)$/i.test(h));

        for (const row of rows) {
            const from = (row[fromCol] || '').trim();
            const to = (row[toCol] || '').trim();
            const distance = distCol ? parseFloat(row[distCol]) : 0;
            const heightGain = heightCol ? parseFloat(row[heightCol]) : 0;
            const source = sourceCol ? row[sourceCol] : 'Unknown';

            if (from && to && !isNaN(distance) && distance > 0) {
                const key = `${from}|${to}`;
                distances.set(key, {
                    from,
                    to,
                    distance: distance,
                    heightGain: heightGain || 0,
                    source: source || 'Unknown'
                });
            }
        }

        return distances;
    }

    /**
     * Parse time string (HH:MM, HHMM, or H:MM) to minutes since midnight
     */
    function parseTime(timeStr) {
        if (!timeStr) return 0;

        const cleaned = timeStr.toString().trim();

        // Handle HHMM format (e.g., 1030)
        if (/^\d{4}$/.test(cleaned)) {
            const hours = parseInt(cleaned.substring(0, 2), 10);
            const minutes = parseInt(cleaned.substring(2, 4), 10);
            return hours * 60 + minutes;
        }

        // Handle HH:MM or H:MM format
        const parts = cleaned.split(':');
        if (parts.length === 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (!isNaN(hours) && !isNaN(minutes)) {
                return hours * 60 + minutes;
            }
        }

        return 0;
    }

    /**
     * Format minutes since midnight to HH:MM string
     */
    function formatTime(totalMinutes) {
        if (typeof totalMinutes !== 'number' || isNaN(totalMinutes)) return '--:--';

        const hours = Math.floor(totalMinutes / 60);
        const minutes = Math.floor(totalMinutes % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    // Public API
    return {
        parse,
        parseOpenings,
        parseDistances,
        parseTime,
        formatTime
    };
})();
