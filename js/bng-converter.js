/**
 * DoveTrek BNG Converter Module
 * Converts British National Grid references to WGS84 (GPS) coordinates
 * Uses Helmert transformation from OSGB36 to WGS84
 */

const BNGConverter = (function() {

    // Airy 1830 ellipsoid (used by OSGB36)
    const AIRY_A = 6377563.396;  // Semi-major axis
    const AIRY_B = 6356256.909;  // Semi-minor axis

    // WGS84 ellipsoid
    const WGS84_A = 6378137.0;
    const WGS84_B = 6356752.3141;

    // National Grid constants
    const N0 = -100000;      // True origin northing
    const E0 = 400000;       // True origin easting
    const F0 = 0.9996012717; // Scale factor
    const PHI0 = 49 * Math.PI / 180;  // True origin latitude (radians)
    const LAMBDA0 = -2 * Math.PI / 180; // True origin longitude (radians)

    // Helmert transformation parameters (OSGB36 to WGS84)
    const HELMERT = {
        tx: 446.448,    // X translation (meters)
        ty: -125.157,   // Y translation
        tz: 542.060,    // Z translation
        rx: 0.1502,     // X rotation (arcseconds)
        ry: 0.2470,     // Y rotation
        rz: 0.8421,     // Z rotation
        s: -20.4894     // Scale (ppm)
    };

    // Grid letter lookup
    const GRID_LETTERS = {
        'A': [0, 4], 'B': [1, 4], 'C': [2, 4], 'D': [3, 4], 'E': [4, 4],
        'F': [0, 3], 'G': [1, 3], 'H': [2, 3], 'J': [3, 3], 'K': [4, 3],
        'L': [0, 2], 'M': [1, 2], 'N': [2, 2], 'O': [3, 2], 'P': [4, 2],
        'Q': [0, 1], 'R': [1, 1], 'S': [2, 1], 'T': [3, 1], 'U': [4, 1],
        'V': [0, 0], 'W': [1, 0], 'X': [2, 0], 'Y': [3, 0], 'Z': [4, 0]
    };

    /**
     * Parse BNG grid reference string to easting/northing
     * Supports formats:
     * - Standard: "TQ 123 456", "TQ123456", "TQ 12345 67890"
     * - Dovetrek format: "258 778" (3-digit easting and northing, assumes SD grid area)
     */
    function parseGridRef(gridRef) {
        if (!gridRef) return null;

        const ref = gridRef.toString().trim();

        // Try Dovetrek short format first: "258 778" or "258778"
        // This is specific to the Dovetrek event area (Peak District, SD grid square area)
        const shortMatch = ref.match(/^(\d{3})\s*(\d{3})$/);
        if (shortMatch) {
            // Dovetrek uses hardcoded prefixes: 4 for easting, 3 for northing
            // "258 778" becomes 425800, 377800
            const easting = parseInt('4' + shortMatch[1] + '00', 10);
            const northing = parseInt('3' + shortMatch[2] + '00', 10);
            return { easting, northing };
        }

        // Standard BNG format with letters
        const cleanRef = ref.toUpperCase().replace(/\s+/g, '');
        const match = cleanRef.match(/^([A-Z]{2})(\d+)$/);
        if (!match) return null;

        const letters = match[1];
        const numbers = match[2];

        // Must have even number of digits
        if (numbers.length % 2 !== 0) return null;

        const half = numbers.length / 2;
        const eastDigits = numbers.substring(0, half);
        const northDigits = numbers.substring(half);

        // Get grid square offsets
        const first = GRID_LETTERS[letters[0]];
        const second = GRID_LETTERS[letters[1]];

        if (!first || !second) return null;

        // Calculate base easting/northing for grid square
        // First letter: 500km squares (offset by 2 for British grid)
        const e100km = ((first[0] - 2) * 5 + second[0]) * 100000;
        const n100km = ((first[1] - 1) * 5 + second[1]) * 100000;

        // Parse coordinate digits and scale to meters
        const scale = Math.pow(10, 5 - half);
        const easting = e100km + parseInt(eastDigits, 10) * scale;
        const northing = n100km + parseInt(northDigits, 10) * scale;

        return { easting, northing };
    }

    /**
     * Convert OSGB36 easting/northing to latitude/longitude
     * Uses iterative approach for reverse transverse Mercator projection
     */
    function osgb36ToLatLon(easting, northing) {
        const e2 = (AIRY_A * AIRY_A - AIRY_B * AIRY_B) / (AIRY_A * AIRY_A);
        const n = (AIRY_A - AIRY_B) / (AIRY_A + AIRY_B);

        // Iterative calculation of latitude
        let phi = PHI0;
        let M = 0;

        do {
            phi = (northing - N0 - M) / (AIRY_A * F0) + phi;

            const n2 = n * n;
            const n3 = n2 * n;

            M = AIRY_B * F0 * (
                (1 + n + 5/4 * n2 + 5/4 * n3) * (phi - PHI0) -
                (3 * n + 3 * n2 + 21/8 * n3) * Math.sin(phi - PHI0) * Math.cos(phi + PHI0) +
                (15/8 * n2 + 15/8 * n3) * Math.sin(2 * (phi - PHI0)) * Math.cos(2 * (phi + PHI0)) -
                (35/24 * n3) * Math.sin(3 * (phi - PHI0)) * Math.cos(3 * (phi + PHI0))
            );
        } while (Math.abs(northing - N0 - M) >= 0.00001);

        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const tanPhi = Math.tan(phi);

        const nu = AIRY_A * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
        const rho = AIRY_A * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
        const eta2 = nu / rho - 1;

        const secPhi = 1 / cosPhi;
        const tan2Phi = tanPhi * tanPhi;
        const tan4Phi = tan2Phi * tan2Phi;
        const tan6Phi = tan4Phi * tan2Phi;
        const nu3 = nu * nu * nu;
        const nu5 = nu3 * nu * nu;
        const nu7 = nu5 * nu * nu;

        const VII = tanPhi / (2 * rho * nu);
        const VIII = tanPhi / (24 * rho * nu3) * (5 + 3 * tan2Phi + eta2 - 9 * tan2Phi * eta2);
        const IX = tanPhi / (720 * rho * nu5) * (61 + 90 * tan2Phi + 45 * tan4Phi);
        const X = secPhi / nu;
        const XI = secPhi / (6 * nu3) * (nu / rho + 2 * tan2Phi);
        const XII = secPhi / (120 * nu5) * (5 + 28 * tan2Phi + 24 * tan4Phi);
        const XIIA = secPhi / (5040 * nu7) * (61 + 662 * tan2Phi + 1320 * tan4Phi + 720 * tan6Phi);

        const dE = easting - E0;
        const dE2 = dE * dE;
        const dE3 = dE2 * dE;
        const dE4 = dE3 * dE;
        const dE5 = dE4 * dE;
        const dE6 = dE5 * dE;
        const dE7 = dE6 * dE;

        const lat = phi - VII * dE2 + VIII * dE4 - IX * dE6;
        const lon = LAMBDA0 + X * dE - XI * dE3 + XII * dE5 - XIIA * dE7;

        return {
            lat: lat * 180 / Math.PI,
            lon: lon * 180 / Math.PI
        };
    }

    /**
     * Convert latitude/longitude to ECEF (Earth-Centered, Earth-Fixed) coordinates
     */
    function latLonToEcef(lat, lon, h, a, b) {
        const phi = lat * Math.PI / 180;
        const lambda = lon * Math.PI / 180;
        const e2 = (a * a - b * b) / (a * a);

        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const sinLambda = Math.sin(lambda);
        const cosLambda = Math.cos(lambda);

        const nu = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);

        return {
            x: (nu + h) * cosPhi * cosLambda,
            y: (nu + h) * cosPhi * sinLambda,
            z: ((1 - e2) * nu + h) * sinPhi
        };
    }

    /**
     * Convert ECEF coordinates to latitude/longitude
     */
    function ecefToLatLon(x, y, z, a, b) {
        const e2 = (a * a - b * b) / (a * a);
        const p = Math.sqrt(x * x + y * y);
        const lambda = Math.atan2(y, x);

        // Iterative calculation
        let phi = Math.atan2(z, p * (1 - e2));
        let nu, sinPhi;

        for (let i = 0; i < 10; i++) {
            sinPhi = Math.sin(phi);
            nu = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
            phi = Math.atan2(z + e2 * nu * sinPhi, p);
        }

        sinPhi = Math.sin(phi);
        nu = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
        const h = p / Math.cos(phi) - nu;

        return {
            lat: phi * 180 / Math.PI,
            lon: lambda * 180 / Math.PI,
            h: h
        };
    }

    /**
     * Apply Helmert transformation from OSGB36 to WGS84
     */
    function helmertTransform(x, y, z) {
        // Convert rotation from arcseconds to radians
        const rx = HELMERT.rx * Math.PI / (180 * 3600);
        const ry = HELMERT.ry * Math.PI / (180 * 3600);
        const rz = HELMERT.rz * Math.PI / (180 * 3600);

        // Scale factor (convert from ppm)
        const s = HELMERT.s / 1e6;

        // Apply transformation
        const xOut = HELMERT.tx + (1 + s) * x - rz * y + ry * z;
        const yOut = HELMERT.ty + rz * x + (1 + s) * y - rx * z;
        const zOut = HELMERT.tz - ry * x + rx * y + (1 + s) * z;

        return { x: xOut, y: yOut, z: zOut };
    }

    /**
     * Convert British National Grid reference to WGS84 coordinates
     * @param {string} gridRef - BNG reference (e.g., "TQ 123 456")
     * @returns {Object|null} {lat, lng} or null if invalid
     */
    function convert(gridRef) {
        // Parse grid reference
        const en = parseGridRef(gridRef);
        if (!en) return null;

        // Convert to OSGB36 lat/lon
        const osgb = osgb36ToLatLon(en.easting, en.northing);

        // Convert to ECEF (assuming height = 0)
        const ecef = latLonToEcef(osgb.lat, osgb.lon, 0, AIRY_A, AIRY_B);

        // Apply Helmert transformation
        const wgs84Ecef = helmertTransform(ecef.x, ecef.y, ecef.z);

        // Convert back to lat/lon
        const wgs84 = ecefToLatLon(wgs84Ecef.x, wgs84Ecef.y, wgs84Ecef.z, WGS84_A, WGS84_B);

        return {
            lat: Math.round(wgs84.lat * 1e6) / 1e6,
            lng: Math.round(wgs84.lon * 1e6) / 1e6
        };
    }

    /**
     * Validate a grid reference string
     */
    function isValid(gridRef) {
        return parseGridRef(gridRef) !== null;
    }

    // Public API
    return {
        convert,
        isValid,
        parseGridRef
    };
})();
