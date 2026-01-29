/**
 * DoveTrek Route Card Builder Module
 * Generates detailed route card with timing information
 */

const RouteCard = (function() {

    /**
     * Build route card with detailed leg information
     * @param {Array} route - Array of checkpoint names
     * @param {Object} data - Year data with checkpoints and distances
     * @param {Object} config - {speed, dwellTime, startTime}
     * @returns {Array} Array of leg objects
     */
    function build(route, data, config) {
        const { checkpoints, distances, startTime } = data;
        const { speed, dwellTime } = config;

        const legs = [];
        let currentTime = startTime;

        for (let i = 0; i < route.length - 1; i++) {
            const from = route[i];
            const to = route[i + 1];

            const fromCp = checkpoints.get(from);
            const toCp = checkpoints.get(to);

            const key = `${from}|${to}`;
            const distData = distances.get(key);

            const distance = distData ? distData.distance : 0;
            const heightGain = distData ? distData.heightGain : 0;
            const travelMinutes = speed > 0 ? (distance / speed) * 60 : 0;

            const departTime = currentTime;
            const arriveTime = departTime + travelMinutes;

            // Calculate wait time if arriving before checkpoint opens
            let waitTime = 0;
            if (toCp && toCp.openSlots && toCp.openSlots.length > 0) {
                waitTime = Solver.getWaitTime(arriveTime, toCp.openSlots);
                if (waitTime === 1e9) waitTime = 0; // Handle INF
            }

            // Dwell time (except at finish)
            const actualDwell = toCp?.isFinish ? 0 : dwellTime;

            const readyTime = arriveTime + waitTime + actualDwell;

            legs.push({
                leg: i + 1,
                from: from,
                to: to,
                fromCoords: fromCp?.coords || null,
                toCoords: toCp?.coords || null,
                distance: Math.round(distance * 100) / 100,
                heightGain: Math.round(heightGain),
                travelMinutes: Math.round(travelMinutes * 10) / 10,
                departTime: departTime,
                arriveTime: arriveTime,
                waitTime: waitTime,
                dwellTime: actualDwell,
                readyTime: readyTime,
                isFinish: toCp?.isFinish || false
            });

            currentTime = readyTime;
        }

        return legs;
    }

    /**
     * Calculate summary statistics from route card
     */
    function summarize(legs) {
        let totalDistance = 0;
        let totalHeight = 0;
        let totalTravel = 0;

        for (const leg of legs) {
            totalDistance += leg.distance;
            totalHeight += leg.heightGain;
            totalTravel += leg.travelMinutes;
        }

        const firstDeparture = legs.length > 0 ? legs[0].departTime : 0;
        const lastArrival = legs.length > 0 ? legs[legs.length - 1].arriveTime : 0;

        return {
            totalDistance: Math.round(totalDistance * 10) / 10,
            totalHeight: Math.round(totalHeight),
            totalTravelMinutes: Math.round(totalTravel),
            startTime: firstDeparture,
            finishTime: lastArrival,
            checkpointCount: legs.length // Number of destinations (including finish)
        };
    }

    /**
     * Render route card as HTML table rows
     */
    function renderTableRows(legs) {
        return legs.map(leg => `
            <tr>
                <td>${leg.leg}</td>
                <td class="from-col">${leg.from}</td>
                <td class="to-col">${leg.to}</td>
                <td>${leg.distance.toFixed(1)}</td>
                <td>${leg.heightGain}</td>
                <td>${Math.round(leg.travelMinutes)}</td>
                <td>${CSVParser.formatTime(leg.arriveTime)}</td>
                <td>${leg.isFinish ? '-' : CSVParser.formatTime(leg.readyTime)}</td>
            </tr>
        `).join('');
    }

    /**
     * Export route card as HTML document
     */
    function exportHTML(route, legs, summary, config) {
        const routePath = route.join(' → ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DoveTrek Route Card</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f0e6;
        }
        h1 { color: #2d5016; }
        .summary {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
        }
        .summary-item {
            text-align: center;
        }
        .summary-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            color: #666;
        }
        .summary-value {
            font-size: 1.25rem;
            font-weight: 600;
            color: #2d5016;
        }
        .route-path {
            background: #e8e3d8;
            padding: 10px;
            border-radius: 8px;
            font-family: monospace;
            word-break: break-word;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
        }
        th, td {
            padding: 8px 12px;
            text-align: center;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #2d5016;
            color: white;
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        td { font-family: monospace; }
        .from-col, .to-col {
            font-weight: 600;
            color: #8b4513;
        }
        @media print {
            body { background: white; }
        }
    </style>
</head>
<body>
    <h1>🧭 DoveTrek Route Card</h1>

    <div class="summary">
        <div class="summary-item">
            <div class="summary-label">Checkpoints</div>
            <div class="summary-value">${route.length - 2}</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Speed</div>
            <div class="summary-value">${config.speed} km/h</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Distance</div>
            <div class="summary-value">${summary.totalDistance} km</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Height</div>
            <div class="summary-value">${summary.totalHeight} m</div>
        </div>
        <div class="summary-item">
            <div class="summary-label">Finish</div>
            <div class="summary-value">${CSVParser.formatTime(summary.finishTime)}</div>
        </div>
    </div>

    <div class="route-path">${routePath}</div>

    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>From</th>
                <th>To</th>
                <th>Dist (km)</th>
                <th>Height (m)</th>
                <th>Travel (min)</th>
                <th>Arrive</th>
                <th>Depart</th>
            </tr>
        </thead>
        <tbody>
            ${legs.map(leg => `
            <tr>
                <td>${leg.leg}</td>
                <td class="from-col">${leg.from}</td>
                <td class="to-col">${leg.to}</td>
                <td>${leg.distance.toFixed(1)}</td>
                <td>${leg.heightGain}</td>
                <td>${Math.round(leg.travelMinutes)}</td>
                <td>${CSVParser.formatTime(leg.arriveTime)}</td>
                <td>${leg.isFinish ? '-' : CSVParser.formatTime(leg.readyTime)}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>

    <p style="margin-top: 20px; color: #666; font-size: 0.875rem;">
        Generated by DoveTrek Route Planner • Dwell time: ${config.dwellTime} min
    </p>
</body>
</html>`;
    }

    /**
     * Download HTML export
     */
    function downloadHTML(route, legs, summary, config) {
        const html = exportHTML(route, legs, summary, config);
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `dovetrek-route-${new Date().toISOString().split('T')[0]}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Public API
    return {
        build,
        summarize,
        renderTableRows,
        exportHTML,
        downloadHTML
    };
})();
