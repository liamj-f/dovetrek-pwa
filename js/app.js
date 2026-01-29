/**
 * DoveTrek PWA - Main Application Controller
 */

const App = (function() {

    // ===== State =====
    let currentYear = null;
    let yearData = null;
    let currentResult = null;
    let routeLegs = null;
    let trackerState = null;

    // ===== DOM Elements =====
    const elements = {};

    // ===== Initialization =====

    function init() {
        // Cache DOM elements
        cacheElements();

        // Set up event listeners
        setupEventListeners();

        // Register service worker
        registerServiceWorker();

        // Load preferences
        loadPreferences();

        // Load available years
        loadYears();

        // Check for PWA install prompt
        setupInstallPrompt();
    }

    function cacheElements() {
        // Screens
        elements.configScreen = document.getElementById('config-screen');
        elements.resultsScreen = document.getElementById('results-screen');
        elements.trackerScreen = document.getElementById('tracker-screen');

        // Config screen
        elements.yearSelect = document.getElementById('year-select');
        elements.dataStatus = document.getElementById('data-status');
        elements.speedSlider = document.getElementById('speed-slider');
        elements.speedValue = document.getElementById('speed-value');
        elements.dwellInput = document.getElementById('dwell-input');
        elements.checkpointGrid = document.getElementById('checkpoint-grid');
        elements.selectAllBtn = document.getElementById('select-all-btn');
        elements.selectNoneBtn = document.getElementById('select-none-btn');
        elements.solveBtn = document.getElementById('solve-btn');
        elements.minSpeedBtn = document.getElementById('min-speed-btn');
        elements.loadingOverlay = document.getElementById('loading-overlay');

        // Results screen
        elements.resultCheckpoints = document.getElementById('result-checkpoints');
        elements.resultSpeed = document.getElementById('result-speed');
        elements.resultDistance = document.getElementById('result-distance');
        elements.resultHeight = document.getElementById('result-height');
        elements.resultFinish = document.getElementById('result-finish');
        elements.routePath = document.getElementById('route-path');
        elements.routeTableBody = document.getElementById('route-table-body');
        elements.backBtn = document.getElementById('back-btn');
        elements.mapsBtn = document.getElementById('maps-btn');
        elements.exportBtn = document.getElementById('export-btn');
        elements.gpxBtn = document.getElementById('gpx-btn');
        elements.trackBtn = document.getElementById('track-btn');

        // Tracker screen
        elements.visitedCount = document.getElementById('visited-count');
        elements.timeStatus = document.getElementById('time-status');
        elements.timeDiff = document.getElementById('time-diff');
        elements.trackerList = document.getElementById('tracker-list');
        elements.trackerBackBtn = document.getElementById('tracker-back-btn');
        elements.resetTrackerBtn = document.getElementById('reset-tracker-btn');

        // Install prompt
        elements.installPrompt = document.getElementById('install-prompt');
        elements.installBtn = document.getElementById('install-btn');
        elements.dismissInstallBtn = document.getElementById('dismiss-install-btn');
    }

    function setupEventListeners() {
        // Year selection
        elements.yearSelect.addEventListener('change', handleYearChange);

        // Speed slider
        elements.speedSlider.addEventListener('input', handleSpeedChange);

        // Dwell input
        elements.dwellInput.addEventListener('change', savePreferences);

        // Checkpoint selection
        elements.selectAllBtn.addEventListener('click', () => selectAllCheckpoints(true));
        elements.selectNoneBtn.addEventListener('click', () => selectAllCheckpoints(false));

        // Solve buttons
        elements.solveBtn.addEventListener('click', handleSolve);
        elements.minSpeedBtn.addEventListener('click', handleMinSpeed);

        // Results actions
        elements.backBtn.addEventListener('click', () => showScreen('config'));
        elements.mapsBtn.addEventListener('click', handleOpenMaps);
        elements.exportBtn.addEventListener('click', handleExport);
        elements.gpxBtn.addEventListener('click', handleGpxExport);
        elements.trackBtn.addEventListener('click', () => showScreen('tracker'));

        // Tracker actions
        elements.trackerBackBtn.addEventListener('click', () => showScreen('results'));
        elements.resetTrackerBtn.addEventListener('click', handleResetTracker);

        // Install prompt
        elements.dismissInstallBtn.addEventListener('click', dismissInstallPrompt);
    }

    // ===== Service Worker =====

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => {
                    console.log('[App] Service worker registered');

                    // Check for updates
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New version available
                                console.log('[App] New version available');
                            }
                        });
                    });
                })
                .catch(err => console.error('[App] SW registration failed:', err));
        }
    }

    // ===== PWA Install =====

    let deferredInstallPrompt = null;

    function setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;

            // Show install prompt if not dismissed before
            const dismissed = Storage.getPreference('installDismissed', false);
            if (!dismissed) {
                elements.installPrompt.classList.remove('hidden');
            }
        });

        elements.installBtn.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const result = await deferredInstallPrompt.userChoice;
                console.log('[App] Install prompt result:', result.outcome);
                deferredInstallPrompt = null;
            }
            elements.installPrompt.classList.add('hidden');
        });
    }

    function dismissInstallPrompt() {
        elements.installPrompt.classList.add('hidden');
        Storage.savePreference('installDismissed', true);
    }

    // ===== Year Loading =====

    async function loadYears() {
        try {
            const years = await GitHubLoader.fetchAvailableYears();

            elements.yearSelect.innerHTML = '<option value="">Select year...</option>';

            for (const year of years) {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                elements.yearSelect.appendChild(option);
            }

            // Restore last selected year
            const lastYear = Storage.getPreference('lastYear');
            if (lastYear && years.includes(lastYear)) {
                elements.yearSelect.value = lastYear;
                await loadYearData(lastYear);
            }
        } catch (err) {
            console.error('[App] Failed to load years:', err);
            updateDataStatus('error', 'Failed to load years');
        }
    }

    async function handleYearChange() {
        const year = parseInt(elements.yearSelect.value, 10);
        if (!year) {
            yearData = null;
            updateDataStatus('pending', 'Select a year to load data');
            renderCheckpoints();
            updateSolveButtons();
            return;
        }

        await loadYearData(year);
        Storage.savePreference('lastYear', year);
    }

    async function loadYearData(year) {
        currentYear = year;
        updateDataStatus('loading', 'Loading data...');

        try {
            yearData = await GitHubLoader.loadYear(year);

            const cpCount = yearData.checkpoints.size - 2; // Exclude start/finish
            updateDataStatus('success', `Data loaded: ${cpCount} checkpoints`);

            renderCheckpoints();
            updateSolveButtons();

            // Restore excluded checkpoints
            restoreExcludedCheckpoints();

        } catch (err) {
            console.error('[App] Failed to load year data:', err);
            yearData = null;
            updateDataStatus('error', `Failed to load data: ${err.message}`);
            renderCheckpoints();
            updateSolveButtons();
        }
    }

    function updateDataStatus(type, text) {
        const statusIcon = elements.dataStatus.querySelector('.status-icon');
        const statusText = elements.dataStatus.querySelector('.status-text');

        elements.dataStatus.className = 'status-badge';

        switch (type) {
            case 'success':
                elements.dataStatus.classList.add('success');
                statusIcon.textContent = '✓';
                break;
            case 'error':
                elements.dataStatus.classList.add('error');
                statusIcon.textContent = '✗';
                break;
            case 'loading':
                statusIcon.textContent = '⏳';
                break;
            default:
                statusIcon.textContent = '⏳';
        }

        statusText.textContent = text;
    }

    // ===== Checkpoints =====

    function renderCheckpoints() {
        if (!yearData) {
            elements.checkpointGrid.innerHTML = '<p class="muted">Load data to see checkpoints</p>';
            return;
        }

        const checkpoints = [];
        for (const [name, cp] of yearData.checkpoints) {
            if (cp.isStart || cp.isFinish) continue;
            checkpoints.push(name);
        }

        // Sort checkpoints
        checkpoints.sort((a, b) => {
            // Extract type and number for sorting
            const getSort = (n) => {
                const match = n.match(/^([A-Z]+)(\d+)/i);
                if (!match) return [n, 0];
                return [match[1], parseInt(match[2], 10)];
            };
            const [aType, aNum] = getSort(a);
            const [bType, bNum] = getSort(b);

            if (aType !== bType) return aType.localeCompare(bType);
            return aNum - bNum;
        });

        elements.checkpointGrid.innerHTML = checkpoints.map(name => `
            <div class="checkpoint-item">
                <input type="checkbox" id="cp-${name}" data-cp="${name}" checked>
                <label for="cp-${name}">${name}</label>
            </div>
        `).join('');

        // Add change listeners
        elements.checkpointGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', savePreferences);
        });
    }

    function selectAllCheckpoints(selected) {
        elements.checkpointGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = selected;
        });
        savePreferences();
    }

    function getExcludedCheckpoints() {
        const excluded = new Set();
        elements.checkpointGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (!cb.checked) {
                excluded.add(cb.dataset.cp);
            }
        });
        return excluded;
    }

    function restoreExcludedCheckpoints() {
        const excluded = Storage.getPreference(`excluded_${currentYear}`, []);
        elements.checkpointGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = !excluded.includes(cb.dataset.cp);
        });
    }

    // ===== Speed & Preferences =====

    function handleSpeedChange() {
        const speed = parseFloat(elements.speedSlider.value);
        elements.speedValue.textContent = speed.toFixed(1);
        savePreferences();
    }

    function loadPreferences() {
        const speed = Storage.getPreference('speed', 5.0);
        const dwell = Storage.getPreference('dwellTime', 7);

        elements.speedSlider.value = speed;
        elements.speedValue.textContent = speed.toFixed(1);
        elements.dwellInput.value = dwell;
    }

    function savePreferences() {
        Storage.savePreference('speed', parseFloat(elements.speedSlider.value));
        Storage.savePreference('dwellTime', parseInt(elements.dwellInput.value, 10));

        if (currentYear) {
            const excluded = Array.from(getExcludedCheckpoints());
            Storage.savePreference(`excluded_${currentYear}`, excluded);
        }
    }

    function updateSolveButtons() {
        const enabled = yearData !== null;
        elements.solveBtn.disabled = !enabled;
        elements.minSpeedBtn.disabled = !enabled;
    }

    // ===== Solver =====

    async function handleSolve() {
        if (!yearData) return;

        showLoading(true);

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            try {
                const config = {
                    speed: parseFloat(elements.speedSlider.value),
                    dwellTime: parseInt(elements.dwellInput.value, 10),
                    excludedCps: getExcludedCheckpoints()
                };

                currentResult = Solver.solve(yearData, config);
                currentResult.speed = config.speed;
                currentResult.dwellTime = config.dwellTime;

                // Build route card
                routeLegs = RouteCard.build(currentResult.route, yearData, {
                    speed: config.speed,
                    dwellTime: config.dwellTime,
                    startTime: yearData.startTime
                });

                // Initialize tracker state
                initTrackerState();

                // Display results
                displayResults();
                showScreen('results');

            } catch (err) {
                console.error('[App] Solve error:', err);
                alert('Error finding route: ' + err.message);
            } finally {
                showLoading(false);
            }
        }, 50);
    }

    async function handleMinSpeed() {
        if (!yearData) return;

        showLoading(true, 'Finding minimum speed...');

        setTimeout(() => {
            try {
                const config = {
                    dwellTime: parseInt(elements.dwellInput.value, 10),
                    excludedCps: getExcludedCheckpoints()
                };

                const result = Solver.findMinSpeed(yearData, config);

                if (result.speed === null) {
                    alert('Cannot visit all checkpoints even at maximum speed (10 km/h)');
                    showLoading(false);
                    return;
                }

                // Update speed slider
                elements.speedSlider.value = result.speed;
                elements.speedValue.textContent = result.speed.toFixed(1);
                savePreferences();

                currentResult = result;
                currentResult.dwellTime = config.dwellTime;

                // Build route card
                routeLegs = RouteCard.build(result.route, yearData, {
                    speed: result.speed,
                    dwellTime: config.dwellTime,
                    startTime: yearData.startTime
                });

                // Initialize tracker state
                initTrackerState();

                // Display results
                displayResults();
                showScreen('results');

            } catch (err) {
                console.error('[App] Min speed error:', err);
                alert('Error finding minimum speed: ' + err.message);
            } finally {
                showLoading(false);
            }
        }, 50);
    }

    // ===== Results Display =====

    function displayResults() {
        if (!currentResult) return;

        const summary = RouteCard.summarize(routeLegs);

        // Count visitable checkpoints (excluding start/finish)
        const totalCps = currentResult.route.length - 2;

        elements.resultCheckpoints.textContent = `${totalCps}`;
        elements.resultSpeed.textContent = `${currentResult.speed.toFixed(1)} km/h`;
        elements.resultDistance.textContent = `${summary.totalDistance} km`;
        elements.resultHeight.textContent = `${summary.totalHeight} m`;
        elements.resultFinish.textContent = CSVParser.formatTime(summary.finishTime);

        // Route path
        elements.routePath.textContent = currentResult.route.join(' → ');

        // Route table
        elements.routeTableBody.innerHTML = RouteCard.renderTableRows(routeLegs);
    }

    // ===== Progress Tracker =====

    function initTrackerState() {
        if (!currentResult || !routeLegs) return;

        trackerState = {
            visited: new Array(currentResult.route.length).fill(false),
            actualTimes: new Array(currentResult.route.length).fill(null)
        };

        // Mark start as visited by default
        trackerState.visited[0] = true;
        trackerState.actualTimes[0] = yearData.startTime;

        renderTracker();
    }

    function renderTracker() {
        if (!trackerState || !currentResult || !routeLegs) return;

        const totalCps = currentResult.route.length;
        const visitedCount = trackerState.visited.filter(v => v).length;

        elements.visitedCount.textContent = `${visitedCount} / ${totalCps}`;

        // Calculate time difference
        const lastVisited = findLastVisitedIndex();
        updateTimeDifference(lastVisited);

        // Render checkpoint list
        let html = '';

        for (let i = 0; i < currentResult.route.length; i++) {
            const name = currentResult.route[i];
            const isVisited = trackerState.visited[i];
            const actualTime = trackerState.actualTimes[i];
            const isCurrent = i === lastVisited + 1 && !trackerState.visited[i];

            // Get scheduled time from route legs
            let scheduledTime = null;
            if (i === 0) {
                scheduledTime = yearData.startTime;
            } else if (i <= routeLegs.length) {
                scheduledTime = routeLegs[i - 1].arriveTime;
            }

            const statusClass = isVisited ? 'visited' : (isCurrent ? 'current' : '');

            html += `
                <div class="tracker-item ${statusClass}" data-index="${i}">
                    <input type="checkbox" class="tracker-checkbox"
                           ${isVisited ? 'checked' : ''}
                           ${i === 0 ? 'disabled' : ''}>
                    <span class="tracker-name">${name}</span>
                    <span class="tracker-scheduled">${scheduledTime !== null ? CSVParser.formatTime(scheduledTime) : '-'}</span>
                    <span class="tracker-actual ${getActualTimeClass(actualTime, scheduledTime)}">
                        ${isVisited ? (actualTime !== null ? CSVParser.formatTime(actualTime) : '✓') : (isCurrent ? '→' : '')}
                    </span>
                </div>
            `;
        }

        elements.trackerList.innerHTML = html;

        // Add event listeners
        elements.trackerList.querySelectorAll('.tracker-checkbox').forEach(cb => {
            cb.addEventListener('change', handleTrackerCheck);
        });
    }

    function handleTrackerCheck(e) {
        const index = parseInt(e.target.closest('.tracker-item').dataset.index, 10);
        const checked = e.target.checked;

        trackerState.visited[index] = checked;

        if (checked) {
            // Record current time
            const now = new Date();
            trackerState.actualTimes[index] = now.getHours() * 60 + now.getMinutes();
        } else {
            trackerState.actualTimes[index] = null;
        }

        // Save state
        Storage.savePreference('trackerState', trackerState);

        renderTracker();
    }

    function handleResetTracker() {
        if (confirm('Reset all progress? This cannot be undone.')) {
            initTrackerState();
            Storage.removePreference('trackerState');
        }
    }

    function findLastVisitedIndex() {
        let last = -1;
        for (let i = 0; i < trackerState.visited.length; i++) {
            if (trackerState.visited[i]) last = i;
        }
        return last;
    }

    function updateTimeDifference(lastVisitedIndex) {
        if (lastVisitedIndex < 0) {
            elements.timeStatus.className = 'time-status on-time';
            elements.timeDiff.textContent = 'Not started';
            return;
        }

        const actualTime = trackerState.actualTimes[lastVisitedIndex];
        if (actualTime === null) {
            elements.timeStatus.className = 'time-status on-time';
            elements.timeDiff.textContent = 'On schedule';
            return;
        }

        // Get scheduled time
        let scheduledTime;
        if (lastVisitedIndex === 0) {
            scheduledTime = yearData.startTime;
        } else {
            scheduledTime = routeLegs[lastVisitedIndex - 1].arriveTime;
        }

        const diff = scheduledTime - actualTime;

        if (Math.abs(diff) < 2) {
            elements.timeStatus.className = 'time-status on-time';
            elements.timeDiff.textContent = 'On schedule';
        } else if (diff > 0) {
            elements.timeStatus.className = 'time-status ahead';
            elements.timeDiff.textContent = `AHEAD by ${Math.round(diff)} min`;
        } else {
            elements.timeStatus.className = 'time-status behind';
            elements.timeDiff.textContent = `BEHIND by ${Math.round(-diff)} min`;
        }
    }

    function getActualTimeClass(actualTime, scheduledTime) {
        if (actualTime === null || scheduledTime === null) return '';

        const diff = scheduledTime - actualTime;
        if (diff > 2) return 'early';
        if (diff < -2) return 'late';
        return '';
    }

    // ===== Export Functions =====

    function handleOpenMaps() {
        if (!routeLegs) return;

        const url = GPXExport.getGoogleMapsUrl(currentResult.route, routeLegs);
        if (url) {
            window.open(url, '_blank');
        } else {
            alert('No coordinate data available for Google Maps');
        }
    }

    function handleExport() {
        if (!currentResult || !routeLegs) return;

        const summary = RouteCard.summarize(routeLegs);
        RouteCard.downloadHTML(currentResult.route, routeLegs, summary, {
            speed: currentResult.speed,
            dwellTime: currentResult.dwellTime
        });
    }

    function handleGpxExport() {
        if (!currentResult || !routeLegs) return;

        GPXExport.exportRoute(currentResult.route, routeLegs, {
            name: `DoveTrek Route ${currentYear}`,
            description: `${currentResult.route.length - 2} checkpoints at ${currentResult.speed} km/h`
        });
    }

    // ===== UI Helpers =====

    function showScreen(screenName) {
        elements.configScreen.classList.remove('active');
        elements.resultsScreen.classList.remove('active');
        elements.trackerScreen.classList.remove('active');

        switch (screenName) {
            case 'config':
                elements.configScreen.classList.add('active');
                break;
            case 'results':
                elements.resultsScreen.classList.add('active');
                break;
            case 'tracker':
                elements.trackerScreen.classList.add('active');
                break;
        }
    }

    function showLoading(show, text = 'Calculating optimal route...') {
        const loadingText = elements.loadingOverlay.querySelector('.loading-text');
        loadingText.textContent = text;

        if (show) {
            elements.loadingOverlay.classList.remove('hidden');
        } else {
            elements.loadingOverlay.classList.add('hidden');
        }
    }

    // ===== Public API =====
    return {
        init
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
