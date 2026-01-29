/**
 * DoveTrek Storage Module
 * Handles localStorage for preferences and IndexedDB for cached data
 */

const Storage = (function() {
    const DB_NAME = 'DoveTrekDB';
    const DB_VERSION = 1;
    const STORES = {
        OPENINGS: 'openings',
        DISTANCES: 'distances',
        ROUTES: 'routes'
    };

    let db = null;

    // ===== IndexedDB Setup =====

    async function initDB() {
        if (db) return db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Create object stores
                if (!database.objectStoreNames.contains(STORES.OPENINGS)) {
                    database.createObjectStore(STORES.OPENINGS, { keyPath: 'year' });
                }
                if (!database.objectStoreNames.contains(STORES.DISTANCES)) {
                    database.createObjectStore(STORES.DISTANCES, { keyPath: 'key' });
                }
                if (!database.objectStoreNames.contains(STORES.ROUTES)) {
                    database.createObjectStore(STORES.ROUTES, { keyPath: 'id' });
                }
            };
        });
    }

    // ===== IndexedDB Operations =====

    async function saveToCache(storeName, data) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async function getFromCache(storeName, key) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async function getAllFromCache(storeName) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async function clearCache(storeName) {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== localStorage Preferences =====

    function savePreference(key, value) {
        try {
            localStorage.setItem(`dovetrek_${key}`, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('localStorage save error:', e);
            return false;
        }
    }

    function getPreference(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(`dovetrek_${key}`);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.error('localStorage get error:', e);
            return defaultValue;
        }
    }

    function removePreference(key) {
        try {
            localStorage.removeItem(`dovetrek_${key}`);
            return true;
        } catch (e) {
            console.error('localStorage remove error:', e);
            return false;
        }
    }

    // ===== Specific Data Methods =====

    async function saveOpenings(year, data) {
        return saveToCache(STORES.OPENINGS, { year, data, timestamp: Date.now() });
    }

    async function getOpenings(year) {
        const result = await getFromCache(STORES.OPENINGS, year);
        return result ? result.data : null;
    }

    async function saveDistances(year, source, data) {
        const key = `${year}_${source}`;
        return saveToCache(STORES.DISTANCES, { key, year, source, data, timestamp: Date.now() });
    }

    async function getDistances(year, source = null) {
        if (source) {
            const key = `${year}_${source}`;
            const result = await getFromCache(STORES.DISTANCES, key);
            return result ? result.data : null;
        }

        // Get all distances for year
        const all = await getAllFromCache(STORES.DISTANCES);
        const yearDistances = all.filter(d => d.year === year);
        return yearDistances.length > 0 ? yearDistances[0].data : null;
    }

    async function saveRoute(route) {
        const id = `route_${Date.now()}`;
        return saveToCache(STORES.ROUTES, { id, ...route, timestamp: Date.now() });
    }

    async function getSavedRoutes() {
        return getAllFromCache(STORES.ROUTES);
    }

    // Public API
    return {
        init: initDB,
        STORES,

        // Generic cache operations
        saveToCache,
        getFromCache,
        getAllFromCache,
        clearCache,

        // Preferences
        savePreference,
        getPreference,
        removePreference,

        // Specific data
        saveOpenings,
        getOpenings,
        saveDistances,
        getDistances,
        saveRoute,
        getSavedRoutes
    };
})();

// Initialize on load
Storage.init().catch(console.error);
