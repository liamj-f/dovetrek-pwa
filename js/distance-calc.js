/**
 * DoveTrek Distance Calculator Module
 * Fallback distance calculation when pre-computed distances unavailable
 * Uses Haversine formula with hiking path multiplier
 */

const DistanceCalc = (function() {

    const EARTH_RADIUS_KM = 6371;
    const PATH_MULTIPLIER = 1.4; // Multiplier for hiking paths (not straight-line)

    /**
     * Convert degrees to radians
     */
    function toRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    /**
     * Calculate great-circle distance using Haversine formula
     * @param {number} lat1 - Latitude of point 1 (degrees)
     * @param {number} lng1 - Longitude of point 1 (degrees)
     * @param {number} lat2 - Latitude of point 2 (degrees)
     * @param {number} lng2 - Longitude of point 2 (degrees)
     * @returns {number} Distance in kilometers
     */
    function haversineDistance(lat1, lng1, lat2, lng2) {
        const dLat = toRadians(lat2 - lat1);
        const dLng = toRadians(lng2 - lng1);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS_KM * c;
    }

    /**
     * Estimate walking distance (straight-line with path multiplier)
     */
    function walkingDistance(lat1, lng1, lat2, lng2) {
        const straightLine = haversineDistance(lat1, lng1, lat2, lng2);
        return straightLine * PATH_MULTIPLIER;
    }

    /**
     * Estimate height gain between two points
     * This is a rough approximation based on typical terrain
     * For accurate values, use pre-computed distance data
     */
    function estimateHeightGain(fromCoords, toCoords, distanceKm) {
        // Very rough estimate: assume ~20m gain per km on average for hilly terrain
        // This is obviously not accurate but provides a fallback
        const baseGain = distanceKm * 20;

        // Add some variance based on coordinate differences
        // (higher latitude differences often mean more elevation change in UK)
        const latDiff = Math.abs(toCoords.lat - fromCoords.lat);
        const variance = latDiff * 500; // Rough multiplier

        return Math.round(baseGain + variance);
    }

    /**
     * Calculate distances between all checkpoint pairs
     * @param {Map} checkpoints - Map of checkpoint name to {coords: {lat, lng}}
     * @returns {Map} Map of "from|to" -> {distance, heightGain, source: 'Calculated'}
     */
    function calculateDistances(checkpoints) {
        const distances = new Map();
        const names = Array.from(checkpoints.keys());

        for (let i = 0; i < names.length; i++) {
            for (let j = 0; j < names.length; j++) {
                if (i === j) continue;

                const from = names[i];
                const to = names[j];
                const fromCp = checkpoints.get(from);
                const toCp = checkpoints.get(to);

                if (!fromCp.coords || !toCp.coords) continue;

                const distance = walkingDistance(
                    fromCp.coords.lat, fromCp.coords.lng,
                    toCp.coords.lat, toCp.coords.lng
                );

                const heightGain = estimateHeightGain(fromCp.coords, toCp.coords, distance);

                const key = `${from}|${to}`;
                distances.set(key, {
                    from,
                    to,
                    distance: Math.round(distance * 100) / 100,
                    heightGain,
                    source: 'Calculated'
                });
            }
        }

        return distances;
    }

    /**
     * Get distance between two checkpoints from distance map
     * Falls back to calculation if not found
     */
    function getDistance(from, to, distanceMap, checkpoints) {
        const key = `${from}|${to}`;

        if (distanceMap && distanceMap.has(key)) {
            return distanceMap.get(key);
        }

        // Fallback calculation
        if (checkpoints) {
            const fromCp = checkpoints.get(from);
            const toCp = checkpoints.get(to);

            if (fromCp && toCp && fromCp.coords && toCp.coords) {
                const distance = walkingDistance(
                    fromCp.coords.lat, fromCp.coords.lng,
                    toCp.coords.lat, toCp.coords.lng
                );

                return {
                    from,
                    to,
                    distance: Math.round(distance * 100) / 100,
                    heightGain: estimateHeightGain(fromCp.coords, toCp.coords, distance),
                    source: 'Calculated'
                };
            }
        }

        return null;
    }

    /**
     * Calculate travel time in minutes
     * @param {number} distanceKm - Distance in kilometers
     * @param {number} speedKmh - Walking speed in km/h
     * @returns {number} Travel time in minutes
     */
    function travelTime(distanceKm, speedKmh) {
        if (!speedKmh || speedKmh <= 0) return Infinity;
        return (distanceKm / speedKmh) * 60;
    }

    // Public API
    return {
        haversineDistance,
        walkingDistance,
        estimateHeightGain,
        calculateDistances,
        getDistance,
        travelTime,
        PATH_MULTIPLIER
    };
})();
