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
    const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

    /**
     * List CSV files available in a GitHub directory via the Contents API
     * @param {string} path - Directory path in the repo
     * @param {string} branch - Branch name
     * @returns {Promise<Array<{name, download_url}>>} File entries
     */
    async function listFiles(path, branch) {
        const url = `${API_BASE}/contents/${path}?ref=${branch}`;
        console.log(`[GitHubLoader] Listing files: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        let response;
        try {
            response = await fetch(url, {
                headers: { Accept: 'application/vnd.github.v3+json' },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            throw new Error(`GitHub API error ${response.status} listing ${path} on ${branch}`);
        }

        const entries = await response.json();
        return entries
            .filter(e => e.type === 'file' && e.name.endsWith('.csv'))
            .map(e => ({ name: e.name, download_url: e.download_url }));
    }

    /**
     * List available openings CSV files from the FileStore branch (Openings/ folder)
     * Falls back to the main branch CheckpointData/ folder.
     * @returns {Promise<Array<{name, download_url}>>}
     */
    async function listOpeningsFiles() {
        try {
            const files = await listFiles('Openings', FILESTORE_BRANCH);
            if (files.length > 0) return files;
        } catch (e) {
            console.log('[GitHubLoader] Openings/ not found on FileStore, trying main branch:', e.message);
        }
        return listFiles('CheckpointData', MAIN_BRANCH);
    }

    /**
     * List available distances CSV files from the FileStore branch (DataFrames/ folder).
     * @returns {Promise<Array<{name, download_url}>>}
     */
    async function listDistancesFiles() {
        return listFiles('DataFrames', FILESTORE_BRANCH);
    }

    /**
     * Fetch raw CSV content from a URL (with IndexedDB cache keyed by URL).
     * @param {string} url - download URL
     * @param {string} cacheKey - key used in IndexedDB
     * @returns {Promise<string>}
     */
    async function fetchCSV(url, cacheKey) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        return response.text();
    }

    /**
     * Load data from explicitly chosen file URLs (openings + distances).
     * @param {string} openingsUrl - raw download URL for the openings CSV
     * @param {string|null} distancesUrl - raw download URL for the distances CSV (or null)
     * @returns {Promise<Object>}
     */
    async function loadFromUrls(openingsUrl, distancesUrl) {
        console.log(`[GitHubLoader] Loading openings from: ${openingsUrl}`);
        const openingsCSV = await fetchCSV(openingsUrl, openingsUrl);
        const openingsData = CSVParser.parseOpenings(openingsCSV);

        // Convert BNG to coordinates
        for (const [name, cp] of openingsData.checkpoints) {
            if (cp.bng) {
                cp.coords = BNGConverter.convert(cp.bng);
            }
        }

        let distanceMap = null;
        let distanceSource = 'Calculated';

        if (distancesUrl) {
            console.log(`[GitHubLoader] Loading distances from: ${distancesUrl}`);
            try {
                const distancesCSV = await fetchCSV(distancesUrl, distancesUrl);
                distanceMap = CSVParser.parseDistances(distancesCSV);
                distanceSource = 'GitHub';
            } catch (e) {
                console.warn('[GitHubLoader] Failed to load distances, falling back to calculated:', e.message);
            }
        }

        if (!distanceMap) {
            console.log('[GitHubLoader] Calculating distances from coordinates');
            distanceMap = DistanceCalc.calculateDistances(openingsData.checkpoints);
        }

        // Derive year from the openings filename if possible (e.g. Openings_2025.csv)
        const yearMatch = openingsUrl.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

        return {
            year,
            checkpoints: openingsData.checkpoints,
            startTime: openingsData.startTime,
            finishWindow: openingsData.finishWindow,
            distances: distanceMap,
            distanceSource
        };
    }

    /**
     * Load all data for a year (openings + distances) — kept for backwards compatibility.
     * @param {number} year - Competition year
     * @returns {Promise<Object>}
     */
    async function loadYear(year) {
        const openingsUrl = `${RAW_BASE}/${MAIN_BRANCH}/CheckpointData/Openings_${year}.csv`;
        return loadFromUrls(openingsUrl, null);
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
        listOpeningsFiles,
        listDistancesFiles,
        loadFromUrls,
        loadYear,
        clearCache,
        hasDataForYear
    };
})();
