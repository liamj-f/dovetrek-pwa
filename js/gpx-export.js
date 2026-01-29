/**
 * DoveTrek GPX Export Module
 * Generates GPX files for GPS apps
 */

const GPXExport = (function() {

    /**
     * Generate GPX XML content from route
     * @param {Array} route - Array of checkpoint names
     * @param {Array} legs - Route card legs with coordinates
     * @param {Object} options - {name, description}
     * @returns {string} GPX XML content
     */
    function generate(route, legs, options = {}) {
        const name = options.name || 'DoveTrek Route';
        const description = options.description || `DoveTrek route with ${route.length - 2} checkpoints`;
        const timestamp = new Date().toISOString();

        // Collect waypoints with coordinates
        const waypoints = [];
        const trackpoints = [];

        // Add start point
        if (legs.length > 0 && legs[0].fromCoords) {
            waypoints.push({
                name: route[0],
                coords: legs[0].fromCoords,
                type: 'start'
            });
            trackpoints.push(legs[0].fromCoords);
        }

        // Add intermediate waypoints
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (leg.toCoords) {
                waypoints.push({
                    name: leg.to,
                    coords: leg.toCoords,
                    type: leg.isFinish ? 'finish' : 'checkpoint',
                    arriveTime: leg.arriveTime
                });
                trackpoints.push(leg.toCoords);
            }
        }

        // Build GPX XML
        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DoveTrek Route Planner"
    xmlns="http://www.topografix.com/GPX/1/1"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
    <metadata>
        <name>${escapeXml(name)}</name>
        <desc>${escapeXml(description)}</desc>
        <time>${timestamp}</time>
        <author>
            <name>DoveTrek Route Planner</name>
        </author>
    </metadata>

${waypoints.map((wp, idx) => `    <wpt lat="${wp.coords.lat}" lon="${wp.coords.lng}">
        <name>${escapeXml(wp.name)}</name>
        <desc>${getWaypointDesc(wp, idx + 1)}</desc>
        <sym>${getWaypointSymbol(wp.type)}</sym>
        <type>${wp.type}</type>
    </wpt>`).join('\n')}

    <trk>
        <name>${escapeXml(name)}</name>
        <desc>${escapeXml(description)}</desc>
        <trkseg>
${trackpoints.map(pt => `            <trkpt lat="${pt.lat}" lon="${pt.lng}"></trkpt>`).join('\n')}
        </trkseg>
    </trk>
</gpx>`;

        return gpx;
    }

    /**
     * Generate route-only GPX (just track, no waypoints)
     */
    function generateRoute(route, legs, options = {}) {
        const name = options.name || 'DoveTrek Route';
        const timestamp = new Date().toISOString();

        const routePoints = [];

        // Add start point
        if (legs.length > 0 && legs[0].fromCoords) {
            routePoints.push({
                name: route[0],
                coords: legs[0].fromCoords
            });
        }

        // Add all destination points
        for (const leg of legs) {
            if (leg.toCoords) {
                routePoints.push({
                    name: leg.to,
                    coords: leg.toCoords
                });
            }
        }

        const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="DoveTrek Route Planner"
    xmlns="http://www.topografix.com/GPX/1/1">
    <metadata>
        <name>${escapeXml(name)}</name>
        <time>${timestamp}</time>
    </metadata>
    <rte>
        <name>${escapeXml(name)}</name>
${routePoints.map(pt => `        <rtept lat="${pt.coords.lat}" lon="${pt.coords.lng}">
            <name>${escapeXml(pt.name)}</name>
        </rtept>`).join('\n')}
    </rte>
</gpx>`;

        return gpx;
    }

    /**
     * Get description for waypoint
     */
    function getWaypointDesc(waypoint, number) {
        if (waypoint.type === 'start') {
            return 'Start point';
        }
        if (waypoint.type === 'finish') {
            return `Finish - ETA ${CSVParser.formatTime(waypoint.arriveTime)}`;
        }
        return `Checkpoint ${number} - ETA ${CSVParser.formatTime(waypoint.arriveTime)}`;
    }

    /**
     * Get GPX symbol for waypoint type
     */
    function getWaypointSymbol(type) {
        switch (type) {
            case 'start': return 'Flag, Green';
            case 'finish': return 'Flag, Red';
            default: return 'Waypoint';
        }
    }

    /**
     * Escape special XML characters
     */
    function escapeXml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Download GPX file
     */
    function download(gpxContent, filename) {
        const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `dovetrek-route-${new Date().toISOString().split('T')[0]}.gpx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Generate and download GPX
     */
    function exportRoute(route, legs, options = {}) {
        const gpxContent = generate(route, legs, options);
        const filename = options.filename || `dovetrek-route-${new Date().toISOString().split('T')[0]}.gpx`;
        download(gpxContent, filename);
    }

    /**
     * Generate Google Maps URL for route
     */
    function getGoogleMapsUrl(route, legs) {
        const points = [];

        // Add start
        if (legs.length > 0 && legs[0].fromCoords) {
            points.push(legs[0].fromCoords);
        }

        // Add destinations
        for (const leg of legs) {
            if (leg.toCoords) {
                points.push(leg.toCoords);
            }
        }

        if (points.length < 2) return null;

        // Google Maps URL format for directions
        const origin = `${points[0].lat},${points[0].lng}`;
        const destination = `${points[points.length - 1].lat},${points[points.length - 1].lng}`;

        // Waypoints (intermediate points)
        const waypoints = points.slice(1, -1)
            .map(p => `${p.lat},${p.lng}`)
            .join('|');

        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking`;

        if (waypoints) {
            url += `&waypoints=${encodeURIComponent(waypoints)}`;
        }

        return url;
    }

    // Public API
    return {
        generate,
        generateRoute,
        download,
        exportRoute,
        getGoogleMapsUrl
    };
})();
