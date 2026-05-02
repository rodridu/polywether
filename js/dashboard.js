/* Oracle Governance Research Dashboard
   Plotly charts – synchronous data access from ORACLE_DATA (data.js) */

// ── Global Config ──────────────────────────────────────────────────

var COLORS = {
    primary: '#4f46e5',
    primaryLight: 'rgba(79, 70, 229, 0.15)',
    accent: '#f59e0b',
    accentLight: 'rgba(245, 158, 11, 0.15)',
    success: '#10b981',
    danger: '#ef4444',
    gray900: '#1a1a1a',
    gray700: '#404040',
    gray500: '#888888',
    gray400: '#aaaaaa',
    gray300: '#d1d1d1',
    gray200: '#e6e6e6',
    gray100: '#f4f4f4',
    white: '#ffffff',
    correct: '#10b981',
    corrected: '#4f46e5',
    uncorrected: '#ef4444',
    overcorrected: '#f59e0b'
};

var LAYOUT_DEFAULTS = {
    font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', size: 13, color: COLORS.gray700 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { gridcolor: COLORS.gray200, zerolinecolor: COLORS.gray300 },
    yaxis: { gridcolor: COLORS.gray200, zerolinecolor: COLORS.gray300 },
    hoverlabel: { bgcolor: COLORS.gray900, font: { color: COLORS.white, size: 12 } },
    bargap: 0.3
};

var CONFIG = { displayModeBar: false, responsive: true };

// ── Helpers ────────────────────────────────────────────────────────

function getData(path) {
    if (typeof ORACLE_DATA !== 'undefined' && ORACLE_DATA[path]) {
        return ORACLE_DATA[path];
    }
    return null;
}

function mergeLayout(overrides) {
    var base = JSON.parse(JSON.stringify(LAYOUT_DEFAULTS));
    for (var key in overrides) {
        if (typeof overrides[key] === 'object' && !Array.isArray(overrides[key]) && base[key]) {
            for (var subkey in overrides[key]) {
                base[key][subkey] = overrides[key][subkey];
            }
        } else {
            base[key] = overrides[key];
        }
    }
    return base;
}

function animateValue(el, start, end, duration, prefix, suffix) {
    prefix = prefix || '';
    suffix = suffix || '';
    var startTime = null;
    var isFloat = String(end).indexOf('.') !== -1;
    function step(ts) {
        if (!startTime) startTime = ts;
        var p = Math.min((ts - startTime) / duration, 1);
        p = 1 - Math.pow(1 - p, 3);
        var val = start + (end - start) * p;
        if (isFloat) {
            el.textContent = prefix + val.toFixed(1) + suffix;
        } else {
            el.textContent = prefix + Math.floor(val).toLocaleString() + suffix;
        }
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function showChartError(containerId, message) {
    var el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:0.875rem;text-align:center;padding:40px;">' +
            message + '</div>';
    }
}

// ── Tab Switching ──────────────────────────────────────────────────

var loadedTabs = {};

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(function(tc) {
        tc.classList.toggle('active', tc.id === 'tab-' + tabId);
    });
    if (!loadedTabs[tabId]) {
        switch (tabId) {
            case 'quality': loadQualityTab(); break;
            case 'enforcement': loadEnforcementTab(); break;
            case 'timeliness': loadTimelinessTab(); break;
            case 'economics': loadEconomicsTab(); break;
            case 'dvm': loadDVMTab(); break;
            case 'robustness': loadRobustnessTab(); break;
        }
    }
}

document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        switchTab(this.getAttribute('data-tab'));
    });
});

// ── Insight Cards ──────────────────────────────────────────────────

function loadInsightCards() {
    var headline = getData('headline_statistics.json');
    if (headline && headline.sample) {
        animateValue(document.getElementById('insight-markets'), 0, headline.sample.n_markets, 1200, '', '');
        animateValue(document.getElementById('insight-disputes'), 0, headline.sample.n_disputes, 1200, '', '');
    } else {
        document.getElementById('insight-markets').textContent = '297,941';
        document.getElementById('insight-disputes').textContent = '2,089';
    }

    var paper = getData('paper_statistics.json');
    if (paper && paper.accuracy) {
        animateValue(document.getElementById('insight-accuracy'), 80, paper.accuracy.final_accuracy_pct, 1000, '', '%');
        animateValue(document.getElementById('insight-valueadd'), 0, paper.governance_value_add.net_value_add_pp, 1000, '+', 'pp');
    } else {
        document.getElementById('insight-accuracy').textContent = '96.9%';
        document.getElementById('insight-valueadd').textContent = '+5.6pp';
    }
}

// ── Tab: Quality ───────────────────────────────────────────────────

function renderQualityCharts(acc) {
    var categories = ['Correct \u2192 Correct', 'Wrong \u2192 Correct', 'Wrong \u2192 Wrong', 'Correct \u2192 Wrong'];
    var values = [acc.correct_to_correct, acc.wrong_to_correct, acc.wrong_to_wrong, acc.correct_to_wrong];
    var colors = [COLORS.correct, COLORS.corrected, COLORS.uncorrected, COLORS.overcorrected];

    Plotly.newPlot('chart-accuracy', [{
        type: 'bar',
        x: categories,
        y: values,
        marker: { color: colors, cornerradius: 4 },
        text: values.map(function(v) { return v; }),
        textposition: 'outside',
        hovertemplate: '%{x}: %{y} markets<extra></extra>'
    }], mergeLayout({
        yaxis: { title: 'Number of Markets', gridcolor: COLORS.gray200 },
        margin: { b: 80 }
    }), CONFIG);

    Plotly.newPlot('chart-waterfall', [{
        type: 'waterfall',
        orientation: 'v',
        x: ['Initial Accuracy', 'Governance Corrections', 'Final Accuracy'],
        y: [acc.initial_accuracy_pct, acc.value_add_pp, 0],
        measure: ['absolute', 'relative', 'total'],
        connector: { line: { color: COLORS.gray300 } },
        increasing: { marker: { color: COLORS.corrected } },
        totals: { marker: { color: COLORS.primary } },
        textposition: 'outside',
        text: [acc.initial_accuracy_pct + '%', '+' + acc.value_add_pp + 'pp', acc.final_accuracy_pct + '%'],
        hovertemplate: '%{x}: %{text}<extra></extra>'
    }], mergeLayout({
        yaxis: { title: 'Accuracy (%)', range: [0, 105], gridcolor: COLORS.gray200 },
        annotations: [{
            x: 2, y: acc.final_accuracy_pct + 3,
            text: acc.residual_error_pct + '% residual error remains',
            showarrow: false,
            font: { color: COLORS.gray500, size: 11 }
        }],
        margin: { b: 80 }
    }), CONFIG);
}

function loadQualityTab() {
    loadedTabs['quality'] = true;
    var data = getData('paper_statistics.json');
    if (data && data.accuracy) {
        try {
            renderQualityCharts(data.accuracy);
        } catch (e) {
            renderQualityCharts({
                correct_to_correct: 915, wrong_to_correct: 56, wrong_to_wrong: 31, correct_to_wrong: 0,
                initial_accuracy_pct: 91.3, final_accuracy_pct: 96.9, value_add_pp: 5.6, residual_error_pct: 3.1
            });
        }
    } else {
        renderQualityCharts({
            correct_to_correct: 915, wrong_to_correct: 56, wrong_to_wrong: 31, correct_to_wrong: 0,
            initial_accuracy_pct: 91.3, final_accuracy_pct: 96.9, value_add_pp: 5.6, residual_error_pct: 3.1
        });
    }
}

// ── Tab: Enforcement ───────────────────────────────────────────────

function loadEnforcementTab() {
    var data = getData('managed_proposer_did_results.json');
    if (!data) {
        showChartError('chart-eventstudy', 'Event study data not available. Ensure data.js is loaded.');
        showChartError('chart-placebo', 'Placebo test data not available.');
        return;
    }
    try {
        loadedTabs['enforcement'] = true;

        // Event study
        var es = data.event_study;
        var rates = es.map(function(d) { return d.dispute_rate * 100; });

        var preMonths = [], preRates = [], postMonths = [], postRates = [];
        es.forEach(function(d) {
            if (d.month_from_treatment <= 0) {
                preMonths.push(d.month_from_treatment);
                preRates.push(d.dispute_rate * 100);
            }
            if (d.month_from_treatment >= 0) {
                postMonths.push(d.month_from_treatment);
                postRates.push(d.dispute_rate * 100);
            }
        });

        Plotly.newPlot('chart-eventstudy', [
            {
                type: 'scatter', mode: 'lines+markers',
                x: preMonths, y: preRates,
                name: 'Pre-treatment',
                line: { color: COLORS.gray500, width: 2 },
                marker: { color: COLORS.gray500, size: 7 },
                hovertemplate: 'Month %{x}: %{y:.3f}%<extra>Pre</extra>'
            },
            {
                type: 'scatter', mode: 'lines+markers',
                x: postMonths, y: postRates,
                name: 'Post-treatment',
                line: { color: COLORS.primary, width: 2.5 },
                marker: { color: COLORS.primary, size: 7 },
                hovertemplate: 'Month %{x}: %{y:.3f}%<extra>Post</extra>'
            }
        ], mergeLayout({
            xaxis: { title: 'Months from Treatment (Aug 2025)', dtick: 1, zeroline: false },
            yaxis: { title: 'Dispute Rate (%)', gridcolor: COLORS.gray200 },
            shapes: [{
                type: 'line', x0: 0, x1: 0,
                y0: 0, y1: 1, yref: 'paper',
                line: { color: COLORS.accent, width: 2, dash: 'dash' }
            }],
            annotations: [{
                x: 0.3, y: Math.max.apply(null, rates) * 0.95,
                text: 'Managed Proposer Policy',
                showarrow: false,
                font: { color: COLORS.accent, size: 11 }
            }],
            legend: { x: 0.65, y: 0.95, bgcolor: 'rgba(255,255,255,0.8)' }
        }), CONFIG);

        // Placebo chart
        var placebo = data.placebo;
        var dates = placebo.map(function(d) { return d.date; });
        var coefs = placebo.map(function(d) { return d.did_coef * 100; });
        var barColors = placebo.map(function(d) { return d.is_true ? COLORS.primary : COLORS.gray400; });

        var trueEntry = null;
        for (var i = 0; i < placebo.length; i++) {
            if (placebo[i].is_true) { trueEntry = placebo[i]; break; }
        }

        var placeboAnnotations = [];
        if (trueEntry) {
            placeboAnnotations.push({
                x: trueEntry.date, y: trueEntry.did_coef * 100 - 0.15,
                text: 'True treatment',
                showarrow: true,
                arrowhead: 2,
                font: { color: COLORS.primary, size: 11 }
            });
        }

        Plotly.newPlot('chart-placebo', [{
            type: 'bar',
            x: dates, y: coefs,
            marker: { color: barColors, cornerradius: 4 },
            text: coefs.map(function(v) { return v.toFixed(2) + 'pp'; }),
            textposition: 'outside',
            hovertemplate: '%{x}: %{y:.3f}pp<extra></extra>'
        }], mergeLayout({
            xaxis: { title: 'Placebo Treatment Date' },
            yaxis: { title: 'DID Coefficient (pp)', gridcolor: COLORS.gray200 },
            annotations: placeboAnnotations,
            margin: { b: 80 }
        }), CONFIG);
    } catch (e) {
        showChartError('chart-eventstudy', 'Error rendering event study: ' + e.message);
        showChartError('chart-placebo', 'Error rendering placebo tests: ' + e.message);
    }
}

// ── Tab: Timeliness ────────────────────────────────────────────────

function loadTimelinessTab() {
    var data = getData('microstructure_did.json');
    if (!data) {
        showChartError('chart-microstructure', 'Microstructure data not available. Ensure data.js is loaded.');
        return;
    }
    try {
        loadedTabs['timeliness'] = true;

        var terciles = data.by_tercile;
        var labels = terciles.map(function(d) { return d.tercile + ' Volume'; });
        var volRatios = terciles.map(function(d) { return d.vol_ratio_median; });
        var volumes = terciles.map(function(d) {
            if (d.median_volume >= 1e6) return '$' + (d.median_volume / 1e6).toFixed(1) + 'M';
            if (d.median_volume >= 1e3) return '$' + (d.median_volume / 1e3).toFixed(0) + 'K';
            return '$' + d.median_volume;
        });

        Plotly.newPlot('chart-microstructure', [
            {
                type: 'bar',
                x: labels, y: volRatios,
                marker: {
                    color: [COLORS.accent, COLORS.primary, COLORS.gray500],
                    cornerradius: 4
                },
                text: volRatios.map(function(v) { return v.toFixed(3) + 'x'; }),
                textposition: 'outside',
                customdata: volumes,
                hovertemplate: '%{x}<br>Volatility ratio: %{y:.3f}x<br>Median volume: %{customdata}<extra></extra>'
            },
            {
                type: 'scatter', mode: 'lines',
                x: [-0.5, labels.length - 0.5],
                y: [1, 1],
                line: { color: COLORS.gray400, dash: 'dash', width: 1 },
                showlegend: false,
                hoverinfo: 'skip'
            }
        ], mergeLayout({
            yaxis: { title: 'Post/Pre Volatility Ratio', range: [0, Math.max.apply(null, volRatios) * 1.2], gridcolor: COLORS.gray200 },
            annotations: [{
                x: labels.length - 1, y: 1.05,
                text: 'No change baseline',
                showarrow: false,
                font: { color: COLORS.gray500, size: 10 }
            }],
            showlegend: false,
            margin: { b: 80 }
        }), CONFIG);
    } catch (e) {
        showChartError('chart-microstructure', 'Error rendering microstructure chart: ' + e.message);
    }
}

// ── Tab: Economics ──────────────────────────────────────────────────

function loadEconomicsTab() {
    loadedTabs['economics'] = true;

    // Profitability chart
    var profData = getData('dispute_profitability_model.json');
    if (profData) {
        try {
            var panel = profData.panel_a;
            var winRates = panel.map(function(d) { return (d.win_rate * 100).toFixed(1) + '%'; });
            var returns = panel.map(function(d) { return d.expected_bond_return; });
            var barColors = returns.map(function(v) { return v >= 0 ? COLORS.success : COLORS.danger; });

            var observedEntry = null;
            for (var i = 0; i < panel.length; i++) {
                if (Math.abs(panel[i].win_rate - profData.parameters.observed_win_rate) < 0.01) {
                    observedEntry = panel[i]; break;
                }
            }

            var profAnnotations = [];
            if (observedEntry) {
                profAnnotations.push({
                    x: (observedEntry.win_rate * 100).toFixed(1) + '%',
                    y: observedEntry.expected_bond_return - 50,
                    text: 'Observed win rate',
                    showarrow: true, arrowhead: 2,
                    font: { color: COLORS.primary, size: 11 }
                });
            }

            Plotly.newPlot('chart-profitability', [{
                type: 'bar',
                x: winRates, y: returns,
                marker: { color: barColors, cornerradius: 4 },
                text: returns.map(function(v) { return '$' + v.toFixed(0); }),
                textposition: 'outside',
                hovertemplate: 'Win rate: %{x}<br>Expected return: $%{y:.2f}<extra></extra>'
            }, {
                type: 'scatter', mode: 'lines',
                x: [-0.5, winRates.length - 0.5], y: [0, 0],
                line: { color: COLORS.gray400, dash: 'dash', width: 1 },
                showlegend: false, hoverinfo: 'skip'
            }], mergeLayout({
                xaxis: { title: 'Disputer Win Rate' },
                yaxis: { title: 'Expected Return per Dispute ($)', gridcolor: COLORS.gray200 },
                showlegend: false,
                annotations: profAnnotations,
                margin: { b: 80 }
            }), CONFIG);
        } catch (e) {
            showChartError('chart-profitability', 'Error rendering profitability chart: ' + e.message);
        }
    } else {
        showChartError('chart-profitability', 'Profitability data not available.');
    }

    // Bond distribution chart
    var bondData = getData('bond_distribution.json');
    if (bondData) {
        try {
            var dist = bondData.bond_distribution;
            var labels = dist.map(function(d) { return typeof d.bond_amount === 'number' ? '$' + d.bond_amount : 'Other'; });
            var shares = dist.map(function(d) { return d.share_pct; });
            var bondColors = dist.map(function(d, i) {
                if (i === 0) return COLORS.primary;
                if (typeof d.bond_amount !== 'number') return COLORS.gray400;
                return i === dist.length - 2 ? COLORS.accent : COLORS.gray500;
            });

            Plotly.newPlot('chart-bonddist', [{
                type: 'bar',
                x: labels, y: shares,
                marker: { color: bondColors, cornerradius: 4 },
                text: shares.map(function(v) { return v + '%'; }),
                textposition: 'outside',
                hovertemplate: '%{x}: %{y}% of markets<extra></extra>'
            }], mergeLayout({
                yaxis: { title: 'Share of Markets (%)', gridcolor: COLORS.gray200, range: [0, 100] },
                margin: { b: 60 }
            }), CONFIG);
        } catch (e) {
            showChartError('chart-bonddist', 'Error rendering bond distribution: ' + e.message);
        }
    } else {
        showChartError('chart-bonddist', 'Bond distribution data not available.');
    }

    // Bond calibration chart
    var calData = getData('bond_calibration.json');
    if (calData) {
        try {
            var coverageLevels = ['50%', '75%', '90%', '95%', '99%'];
            var requiredBonds = [
                calData.bond_for_50pct.required_bond,
                calData.bond_for_75pct.required_bond,
                calData.bond_for_90pct.required_bond,
                calData.bond_for_95pct.required_bond,
                calData.bond_for_99pct.required_bond
            ];

            Plotly.newPlot('chart-bondcal', [
                {
                    type: 'bar',
                    x: coverageLevels, y: requiredBonds,
                    marker: { color: COLORS.primary, cornerradius: 4 },
                    text: requiredBonds.map(function(v) { return '$' + v.toFixed(0); }),
                    textposition: 'outside',
                    name: 'Required bond',
                    hovertemplate: '%{x} coverage: $%{y:.0f} bond needed<extra></extra>'
                },
                {
                    type: 'scatter', mode: 'lines',
                    x: [-0.5, coverageLevels.length - 0.5], y: [750, 750],
                    line: { color: COLORS.accent, dash: 'dash', width: 2 },
                    name: 'Total dispute cost ($750)',
                    hoverinfo: 'skip'
                }
            ], mergeLayout({
                xaxis: { title: 'Coverage Level' },
                yaxis: { title: 'Required Bond ($)', gridcolor: COLORS.gray200 },
                legend: { x: 0.02, y: 0.95 },
                margin: { b: 60 }
            }), CONFIG);
        } catch (e) {
            showChartError('chart-bondcal', 'Error rendering bond calibration: ' + e.message);
        }
    } else {
        showChartError('chart-bondcal', 'Bond calibration data not available.');
    }
}

// ── Tab: DVM Governance ────────────────────────────────────────────

function loadDVMTab() {
    var data = getData('dvm_vote_analysis.json');
    if (!data) {
        showChartError('chart-votemargins', 'DVM vote data not available. Ensure data.js is loaded.');
        showChartError('chart-voterparticipation', 'Voter participation data not available.');
        return;
    }
    try {
        loadedTabs['dvm'] = true;

        // Vote margins by outcome
        var outcomes = data.correction_analysis.by_outcome;
        var labels = outcomes.map(function(d) { return d.outcome; });
        var voterShares = outcomes.map(function(d) { return d.voter_share_mean * 100; });
        var nCounts = outcomes.map(function(d) { return d.n; });

        Plotly.newPlot('chart-votemargins', [
            {
                type: 'bar',
                x: labels, y: voterShares,
                name: 'Winning Vote Share (%)',
                marker: { color: COLORS.primary, cornerradius: 4 },
                text: voterShares.map(function(v) { return v.toFixed(1) + '%'; }),
                textposition: 'outside',
                yaxis: 'y',
                hovertemplate: '%{x}<br>Vote share: %{y:.1f}%<extra>Vote Share</extra>'
            },
            {
                type: 'bar',
                x: labels, y: nCounts,
                name: 'Number of Cases',
                marker: { color: COLORS.accent, cornerradius: 4 },
                opacity: 0.7,
                text: nCounts,
                textposition: 'outside',
                yaxis: 'y2',
                hovertemplate: '%{x}<br>Cases: %{y}<extra>Count</extra>'
            }
        ], mergeLayout({
            yaxis: { title: 'Winning Vote Share (%)', range: [0, 110], gridcolor: COLORS.gray200, side: 'left' },
            yaxis2: { title: 'Number of Cases', overlaying: 'y', side: 'right', range: [0, 1200], showgrid: false },
            barmode: 'group',
            legend: { x: 0.5, y: 1.1, orientation: 'h', xanchor: 'center' },
            margin: { b: 80, t: 50 }
        }), CONFIG);

        // Voter participation by volume tercile
        var terciles = data.volume_participation.tercile_stats;
        var tercileLabels = terciles.map(function(d) { return d.tercile + ' Volume'; });
        var medianVoters = terciles.map(function(d) { return d.median_voters; });
        var medianVolumes = terciles.map(function(d) {
            var v = d.median_volume;
            if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
            if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
            return '$' + v;
        });
        var maxVoters = Math.max.apply(null, medianVoters);

        Plotly.newPlot('chart-voterparticipation', [{
            type: 'bar',
            x: tercileLabels, y: medianVoters,
            marker: {
                color: [COLORS.gray500, COLORS.primary, COLORS.accent],
                cornerradius: 4
            },
            text: medianVoters.map(function(v) { return v + ' voters'; }),
            textposition: 'outside',
            customdata: medianVolumes,
            hovertemplate: '%{x}<br>Median voters: %{y}<br>Median volume: %{customdata}<extra></extra>'
        }], mergeLayout({
            yaxis: { title: 'Median DVM Voters', gridcolor: COLORS.gray200, range: [0, maxVoters * 1.3] },
            annotations: [{
                x: 0.5, y: -0.18,
                xref: 'paper', yref: 'paper',
                text: 'Spearman \u03C1 = 0.28 (p < 0.001)',
                showarrow: false,
                font: { color: COLORS.gray500, size: 11 }
            }],
            margin: { b: 80 }
        }), CONFIG);
    } catch (e) {
        showChartError('chart-votemargins', 'Error rendering DVM charts: ' + e.message);
        showChartError('chart-voterparticipation', 'Error rendering voter participation: ' + e.message);
    }
}

// ── Tab: Robustness ────────────────────────────────────────────────

function loadRobustnessTab() {
    loadedTabs['robustness'] = true;

    // Coefficient plot from regressions
    var regData = getData('regressions.json');
    if (regData) {
        try {
            var coefficients = [];
            var specs = [
                { key: 'spec1a_detection', label: 'Detection', vars: ['log_volume', 'objective', 'incompleteness', 'cat_politics', 'cat_crypto'] },
                { key: 'spec3_did', label: 'DID', vars: ['managed_x_post', 'managed', 'post', 'log_volume'] },
                { key: 'spec1b_revision', label: 'Correction', vars: ['log_volume', 'incompleteness'] }
            ];

            specs.forEach(function(spec) {
                var specData = regData[spec.key];
                if (!specData || !specData.coefficients) return;
                spec.vars.forEach(function(v) {
                    var c = specData.coefficients[v];
                    if (!c) return;
                    coefficients.push({
                        name: v + ' (' + spec.label + ')',
                        coef: c.coef,
                        ci_lower: c.ci_lower,
                        ci_upper: c.ci_upper,
                        pvalue: c.pvalue,
                        spec: spec.label
                    });
                });
            });

            if (coefficients.length === 0) {
                showChartError('chart-coefficients', 'No matching regression coefficients found in data.');
            } else {
                var names = coefficients.map(function(d) { return d.name; });
                var coefs = coefficients.map(function(d) { return d.coef; });
                var markerColors = coefficients.map(function(d) {
                    return d.pvalue < 0.05 ? COLORS.primary : COLORS.gray400;
                });
                var errorLower = coefficients.map(function(d) { return d.coef - d.ci_lower; });
                var errorUpper = coefficients.map(function(d) { return d.ci_upper - d.coef; });

                Plotly.newPlot('chart-coefficients', [
                    {
                        type: 'scatter', mode: 'markers',
                        y: names, x: coefs,
                        error_x: {
                            type: 'data',
                            symmetric: false,
                            array: errorUpper,
                            arrayminus: errorLower,
                            color: COLORS.gray400,
                            thickness: 1.5,
                            width: 5
                        },
                        marker: { color: markerColors, size: 10 },
                        hovertemplate: '%{y}<br>Coefficient: %{x:.4f}<extra></extra>'
                    },
                    {
                        type: 'scatter', mode: 'lines',
                        x: [0, 0], y: [-0.5, names.length - 0.5],
                        line: { color: COLORS.gray300, dash: 'dash', width: 1 },
                        showlegend: false, hoverinfo: 'skip'
                    }
                ], mergeLayout({
                    xaxis: { title: 'Coefficient', zeroline: true, zerolinecolor: COLORS.gray300, gridcolor: COLORS.gray200 },
                    yaxis: { autorange: 'reversed' },
                    showlegend: false,
                    margin: { l: 220, b: 50, t: 20 },
                    height: 500
                }), CONFIG);
            }
        } catch (e) {
            showChartError('chart-coefficients', 'Error rendering regression coefficients: ' + e.message);
        }
    } else {
        showChartError('chart-coefficients', 'Regression data not available.');
    }

    // Coverage analysis
    var covData = getData('coverage_analysis.json');
    if (covData) {
        try {
            Plotly.newPlot('chart-coverage', [
                {
                    type: 'bar',
                    x: ['Verifiable', 'Excluded'],
                    y: [covData.n_verifiable, covData.n_excluded],
                    marker: { color: [COLORS.primary, COLORS.gray500], cornerradius: 4 },
                    text: [covData.n_verifiable, covData.n_excluded],
                    textposition: 'outside',
                    name: 'Count',
                    hovertemplate: '%{x}: %{y} markets<extra></extra>'
                }
            ], mergeLayout({
                yaxis: { title: 'Number of Disputed Markets', gridcolor: COLORS.gray200 },
                annotations: [
                    {
                        x: 0, y: covData.n_verifiable + 60,
                        text: 'Median vol: $' + (covData.verifiable_volume_median / 1000).toFixed(0) + 'K',
                        showarrow: false,
                        font: { color: COLORS.gray500, size: 10 }
                    },
                    {
                        x: 1, y: covData.n_excluded + 60,
                        text: 'Median vol: $' + covData.excluded_volume_median.toFixed(0),
                        showarrow: false,
                        font: { color: COLORS.gray500, size: 10 }
                    },
                    {
                        x: 0.5, y: -0.18,
                        xref: 'paper', yref: 'paper',
                        text: 'Volume difference p = ' + covData.volume_pval.toFixed(3) + ' | Category composition p < 0.001',
                        showarrow: false,
                        font: { color: COLORS.gray500, size: 11 }
                    }
                ],
                showlegend: false,
                margin: { b: 80, t: 30 }
            }), CONFIG);
        } catch (e) {
            showChartError('chart-coverage', 'Error rendering coverage chart: ' + e.message);
        }
    } else {
        showChartError('chart-coverage', 'Coverage data not available.');
    }
}

// ── Init ───────────────────────────────────────────────────────────

loadInsightCards();
loadQualityTab();
