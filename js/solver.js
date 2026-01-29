/**
 * DoveTrek Solver Module
 * Bitmask Dynamic Programming solver for optimal route finding
 * Ported from C++ implementation
 */

const Solver = (function() {

    const INF = 1e9;

    /**
     * Solve for optimal route
     * @param {Object} data - Loaded year data from GitHubLoader
     * @param {Object} config - {speed: km/h, dwellTime: minutes, excludedCps: Set}
     * @returns {Object} {count, route, finishTime, totalDistance, totalHeight}
     */
    function solve(data, config) {
        const { checkpoints, startTime, finishWindow, distances } = data;
        const { speed, dwellTime, excludedCps } = config;

        // Build list of visitable checkpoints (excluding start/finish and excluded ones)
        const visitableCps = [];
        const cpIndices = new Map();
        let startCp = null;
        let finishCp = null;

        for (const [name, cp] of checkpoints) {
            if (cp.isStart) {
                startCp = { name, ...cp };
                continue;
            }
            if (cp.isFinish) {
                finishCp = { name, ...cp };
                continue;
            }
            if (excludedCps && excludedCps.has(name)) {
                continue;
            }

            cpIndices.set(name, visitableCps.length);
            visitableCps.push({ name, ...cp });
        }

        const n = visitableCps.length;

        if (n === 0) {
            return {
                count: 0,
                route: [startCp?.name || 'Start', finishCp?.name || 'Finish'],
                finishTime: startTime,
                totalDistance: getDistanceValue(distances, startCp?.name, finishCp?.name),
                totalHeight: getHeightValue(distances, startCp?.name, finishCp?.name)
            };
        }

        // DP state: dp[mask][last] = earliest arrival time at 'last' having visited 'mask'
        const numMasks = 1 << n;
        const dp = new Float64Array(numMasks * n).fill(INF);
        const parent = new Int32Array(numMasks * n).fill(-1);

        // Initialize: travel from start to each checkpoint
        for (let i = 0; i < n; i++) {
            const cp = visitableCps[i];
            const travelTime = getTravelTime(distances, startCp?.name, cp.name, speed);

            if (travelTime === INF) continue;

            const arriveTime = startTime + travelTime;
            const waitTime = getWaitTime(arriveTime, cp.openSlots);

            if (waitTime === INF) continue;

            const departTime = arriveTime + waitTime + dwellTime;
            const mask = 1 << i;
            const idx = mask * n + i;

            dp[idx] = departTime;
            parent[idx] = -2; // Indicates came from start
        }

        // DP transitions
        for (let mask = 1; mask < numMasks; mask++) {
            for (let last = 0; last < n; last++) {
                if (!(mask & (1 << last))) continue;

                const idx = mask * n + last;
                const currentTime = dp[idx];

                if (currentTime >= INF) continue;

                // Try extending to each unvisited checkpoint
                for (let next = 0; next < n; next++) {
                    if (mask & (1 << next)) continue;

                    const fromCp = visitableCps[last];
                    const toCp = visitableCps[next];
                    const travelTime = getTravelTime(distances, fromCp.name, toCp.name, speed);

                    if (travelTime === INF) continue;

                    const arriveTime = currentTime + travelTime;
                    const waitTime = getWaitTime(arriveTime, toCp.openSlots);

                    if (waitTime === INF) continue;

                    const departTime = arriveTime + waitTime + dwellTime;
                    const newMask = mask | (1 << next);
                    const newIdx = newMask * n + next;

                    if (departTime < dp[newIdx]) {
                        dp[newIdx] = departTime;
                        parent[newIdx] = idx;
                    }
                }
            }
        }

        // Find best final state that can reach finish in time
        let bestMask = 0;
        let bestLast = -1;
        let bestFinishTime = INF;
        let bestCount = 0;

        for (let mask = 0; mask < numMasks; mask++) {
            const count = popCount(mask);

            for (let last = 0; last < n; last++) {
                if (!(mask & (1 << last))) continue;

                const idx = mask * n + last;
                const currentTime = dp[idx];

                if (currentTime >= INF) continue;

                const fromCp = visitableCps[last];
                const travelTime = getTravelTime(distances, fromCp.name, finishCp?.name, speed);

                if (travelTime === INF) continue;

                const finishTime = currentTime + travelTime;

                // Check if we can finish within the window
                if (finishTime <= finishWindow.close) {
                    // Prefer more checkpoints, then earlier finish
                    if (count > bestCount || (count === bestCount && finishTime < bestFinishTime)) {
                        bestCount = count;
                        bestMask = mask;
                        bestLast = last;
                        bestFinishTime = finishTime;
                    }
                }
            }
        }

        // Handle case where no checkpoints can be visited
        if (bestLast === -1) {
            const directTime = getTravelTime(distances, startCp?.name, finishCp?.name, speed);
            return {
                count: 0,
                route: [startCp?.name || 'Start', finishCp?.name || 'Finish'],
                finishTime: startTime + directTime,
                totalDistance: getDistanceValue(distances, startCp?.name, finishCp?.name),
                totalHeight: getHeightValue(distances, startCp?.name, finishCp?.name)
            };
        }

        // Reconstruct route
        const route = reconstructRoute(parent, visitableCps, bestMask, bestLast, n, startCp, finishCp);

        // Calculate totals
        const { totalDistance, totalHeight } = calculateRouteTotals(route, distances);

        return {
            count: bestCount,
            route,
            finishTime: bestFinishTime,
            totalDistance,
            totalHeight
        };
    }

    /**
     * Find minimum speed to visit all included checkpoints
     * @param {Object} data - Loaded year data
     * @param {Object} config - {dwellTime, excludedCps}
     * @returns {Object} {speed, route, finishTime} or {speed: null} if impossible
     */
    function findMinSpeed(data, config) {
        const { checkpoints, excludedCps } = config;

        // Count expected checkpoints
        let expectedCount = 0;
        for (const [name, cp] of data.checkpoints) {
            if (cp.isStart || cp.isFinish) continue;
            if (excludedCps && excludedCps.has(name)) continue;
            expectedCount++;
        }

        if (expectedCount === 0) {
            return { speed: 3.0, route: [], finishTime: 0 };
        }

        // Binary search for minimum speed
        let low = 3.0;
        let high = 10.0;
        let bestResult = null;

        while (high - low > 0.05) {
            const mid = (low + high) / 2;
            const result = solve(data, { ...config, speed: mid });

            if (result.count >= expectedCount) {
                bestResult = { ...result, speed: mid };
                high = mid;
            } else {
                low = mid;
            }
        }

        // Final check with high value
        const finalResult = solve(data, { ...config, speed: high });
        if (finalResult.count >= expectedCount) {
            return { ...finalResult, speed: Math.round(high * 10) / 10 };
        }

        return bestResult || { speed: null, message: 'Cannot visit all checkpoints even at max speed' };
    }

    /**
     * Get travel time between two checkpoints
     */
    function getTravelTime(distances, from, to, speed) {
        if (!from || !to || !speed) return INF;

        const key = `${from}|${to}`;
        const dist = distances?.get(key);

        if (!dist) return INF;

        return (dist.distance / speed) * 60; // Convert to minutes
    }

    /**
     * Get distance value between two checkpoints
     */
    function getDistanceValue(distances, from, to) {
        if (!from || !to) return 0;

        const key = `${from}|${to}`;
        const dist = distances?.get(key);

        return dist ? dist.distance : 0;
    }

    /**
     * Get height gain between two checkpoints
     */
    function getHeightValue(distances, from, to) {
        if (!from || !to) return 0;

        const key = `${from}|${to}`;
        const dist = distances?.get(key);

        return dist ? dist.heightGain : 0;
    }

    /**
     * Get wait time until checkpoint opens
     * Returns INF if checkpoint is closed and won't open
     */
    function getWaitTime(arriveTime, openSlots) {
        if (!openSlots || openSlots.length === 0) {
            return 0; // No restrictions
        }

        for (const slot of openSlots) {
            // If we arrive during an open slot
            if (arriveTime >= slot.open && arriveTime <= slot.close) {
                return 0;
            }

            // If we arrive before the slot opens
            if (arriveTime < slot.open) {
                return slot.open - arriveTime;
            }
        }

        // All slots have closed
        return INF;
    }

    /**
     * Reconstruct route from DP parent pointers
     */
    function reconstructRoute(parent, visitableCps, mask, last, n, startCp, finishCp) {
        const route = [];

        let currentMask = mask;
        let currentLast = last;

        while (currentLast >= 0) {
            route.unshift(visitableCps[currentLast].name);

            const idx = currentMask * n + currentLast;
            const prevIdx = parent[idx];

            if (prevIdx === -2) {
                // Came from start
                break;
            }

            if (prevIdx < 0) break;

            // Decode previous state
            const prevMask = Math.floor(prevIdx / n);
            const prevLast = prevIdx % n;

            currentMask = prevMask;
            currentLast = prevLast;
        }

        // Add start and finish
        route.unshift(startCp?.name || 'Start');
        route.push(finishCp?.name || 'Finish');

        return route;
    }

    /**
     * Calculate total distance and height for a route
     */
    function calculateRouteTotals(route, distances) {
        let totalDistance = 0;
        let totalHeight = 0;

        for (let i = 0; i < route.length - 1; i++) {
            const from = route[i];
            const to = route[i + 1];
            const key = `${from}|${to}`;
            const dist = distances?.get(key);

            if (dist) {
                totalDistance += dist.distance;
                totalHeight += dist.heightGain || 0;
            }
        }

        return {
            totalDistance: Math.round(totalDistance * 10) / 10,
            totalHeight: Math.round(totalHeight)
        };
    }

    /**
     * Count set bits in a number (population count)
     */
    function popCount(n) {
        let count = 0;
        while (n) {
            count += n & 1;
            n >>= 1;
        }
        return count;
    }

    // Public API
    return {
        solve,
        findMinSpeed,
        getTravelTime,
        getWaitTime
    };
})();
