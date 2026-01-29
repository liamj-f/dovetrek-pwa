/**
 * DoveTrek GitHub Loader Module
 * Fetches checkpoint and distance data from GitHub repository
 */

const GitHubLoader = (function() {

    const REPO_OWNER = 'liamj-f';
    const REPO_NAME = 'Dovetrek';
    const MAIN_BRANCH = 'main';
    const FILESTORE_BRANCH = 'FileStore';

    const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;

    // Known years with data
    const KNOWN_YEARS = [2017, 2018, 2019, 2024, 2025];

    // Distance data sources (in order of preference)
    const DISTANCE_SOURCES = ['Bing Maps', 'Google Maps', 'Azure Maps & OpenTopoData'];

    // Known distance files with exact dates
    const KNOWN_DISTANCE_FILES = {
        2025: [
            { source: 'Bing Maps', date: '2025-02-25' },
            { source: 'Google Maps', date: '2025-03-02' },
            { source: 'Azure Maps & OpenTopoData', date: '2025-02-23' }
        ]
    };

    /**
     * Fetch available years from repository
     * Falls back to known years if API call fails
     */
    async function fetchAvailableYears() {
        // Return known years (GitHub API rate limiting makes directory listing unreliable)
        // Could enhance this later with API call to list CheckpointData directory
        return KNOWN_YEARS.slice().sort((a, b) => b - a); // Descending order
    }

    /**
     * Fetch openings CSV for a given year
     * @param {number} year - Competition year
     * @returns {Promise<string>} Raw CSV content
     */
    async function fetchOpenings(year) {
        // Try cache first
        const cached = await Storage.getOpenings(year);
        if (cached) {
            console.log(`[GitHubLoader] Using cached openings for ${year}`);
            return cached;
        }

        // Fetch from GitHub
        const url = `${RAW_BASE}/${MAIN_BRANCH}/CheckpointData/Openings_${year}.csv`;
        console.log(`[GitHubLoader] Fetching openings: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch openings for ${year}: ${response.status}`);
        }

        const csvText = await response.text();

        // Cache for offline use
        await Storage.saveOpenings(year, csvText);

        return csvText;
    }

    /**
     * Fetch distances CSV for a given year
     * Tries multiple sources and finds most recent file
     * @param {number} year - Competition year
     * @returns {Promise<string>} Raw CSV content
     */
    async function fetchDistances(year) {
        // Try cache first
        const cached = await Storage.getDistances(year);
        if (cached) {
            console.log(`[GitHubLoader] Using cached distances for ${year}`);
            return cached;
        }

        // Try to fetch from FileStore branch
        // File naming pattern: Distances_DF_{year}_{source}_{date}.csv

        for (const source of DISTANCE_SOURCES) {
            try {
                // List files would require GitHub API, so we'll try known patterns
                // For now, try to fetch with a recent date pattern
                const attempts = await tryFetchDistanceFile(year, source);
                if (attempts) {
                    await Storage.saveDistances(year, source, attempts);
                    return attempts;
                }
            } catch (e) {
                console.log(`[GitHubLoader] Failed to fetch ${source} distances:`, e.message);
            }
        }

        // If all else fails, return null (will use calculated distances)
        console.log(`[GitHubLoader] No distance data found for ${year}`);
        return null;
    }

    /**
     * Try to fetch distance file with various date patterns
     */
    async function tryFetchDistanceFile(year, source) {
        // First, try known exact files
        const knownFiles = KNOWN_DISTANCE_FILES[year] || [];
        const knownFile = knownFiles.find(f => f.source === source);

        if (knownFile) {
            const filename = `Distances_DF_${year}_${source}_${knownFile.date}.csv`;
            const url = `${RAW_BASE}/${FILESTORE_BRANCH}/DataFrames/${encodeURIComponent(filename)}`;

            try {
                const response = await fetch(url);
                if (response.ok) {
                    console.log(`[GitHubLoader] Found known distance file: ${filename}`);
                    return await response.text();
                }
            } catch (e) {
                console.log(`[GitHubLoader] Known file not found: ${filename}`);
            }
        }

        // Try recent dates as fallback
        const dates = generateRecentDates();

        for (const date of dates) {
            const filename = `Distances_DF_${year}_${source}_${date}.csv`;
            const url = `${RAW_BASE}/${FILESTORE_BRANCH}/DataFrames/${encodeURIComponent(filename)}`;

            try {
                const response = await fetch(url);
                if (response.ok) {
                    console.log(`[GitHubLoader] Found distance file: ${filename}`);
                    return await response.text();
                }
            } catch (e) {
                // Continue to next date
            }
        }

        // Also try without date suffix
        const baseFilename = `Distances_DF_${year}_${source}.csv`;
        const baseUrl = `${RAW_BASE}/${FILESTORE_BRANCH}/DataFrames/${encodeURIComponent(baseFilename)}`;

        try {
            const response = await fetch(baseUrl);
            if (response.ok) {
                return await response.text();
            }
        } catch (e) {
            // Fall through
        }

        return null;
    }

    /**
     * Generate recent date strings for file matching
     */
    function generateRecentDates() {
        const dates = [];
        const now = new Date();

        // Generate dates for past 2 years, various months
        for (let year = now.getFullYear(); year >= now.getFullYear() - 1; year--) {
            for (let month = 12; month >= 1; month--) {
                for (let day = 28; day >= 1; day -= 7) {
                    const m = month.toString().padStart(2, '0');
                    const d = day.toString().padStart(2, '0');
                    dates.push(`${year}-${m}-${d}`);
                }
            }
        }

        return dates.slice(0, 50); // Limit attempts
    }

    /**
     * Load all data for a year (openings + distances)
     * @param {number} year - Competition year
     * @returns {Promise<Object>} {openings, distances, checkpoints}
     */
    async function loadYear(year) {
        // Fetch openings
        const openingsCSV = await fetchOpenings(year);
        const openingsData = CSVParser.parseOpenings(openingsCSV);

        // Convert BNG to coordinates
        for (const [name, cp] of openingsData.checkpoints) {
            if (cp.bng) {
                cp.coords = BNGConverter.convert(cp.bng);
            }
        }

        // Fetch distances (may be null)
        const distancesCSV = await fetchDistances(year);
        let distanceMap = null;

        if (distancesCSV) {
            distanceMap = CSVParser.parseDistances(distancesCSV);
        } else {
            // Calculate distances as fallback
            console.log(`[GitHubLoader] Calculating distances from coordinates`);
            distanceMap = DistanceCalc.calculateDistances(openingsData.checkpoints);
        }

        return {
            year,
            checkpoints: openingsData.checkpoints,
            startTime: openingsData.startTime,
            finishWindow: openingsData.finishWindow,
            distances: distanceMap,
            distanceSource: distancesCSV ? 'GitHub' : 'Calculated'
        };
    }

    /**
     * Clear cached data
     */
    async function clearCache() {
        await Storage.clearCache(Storage.STORES.OPENINGS);
        await Storage.clearCache(Storage.STORES.DISTANCES);

        // Also tell service worker to clear
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CLEAR_DATA_CACHE'
            });
        }
    }

    /**
     * Check if data is available for a year (checks cache)
     */
    async function hasDataForYear(year) {
        const cached = await Storage.getOpenings(year);
        return cached !== null;
    }

    // Public API
    return {
        fetchAvailableYears,
        fetchOpenings,
        fetchDistances,
        loadYear,
        clearCache,
        hasDataForYear,
        KNOWN_YEARS
    };
})();
