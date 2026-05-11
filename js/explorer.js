// Settlement Explorer — Contract Explorer table
// Loads disputed_contracts.json, renders filterable / searchable table.
// Row click → contract.html?id=...

(function() {
    var ROWS_PER_PAGE = 50;
    var allRows = [];
    var filtered = [];
    var page = 0;

    var filters = { revised: 'all', chain: 'all', mismatch: 'all', hasq: 'all', src: 'all', tier: 'all', search: '' };

    // Read ?search= from URL on first load
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('search')) filters.search = urlParams.get('search');
    if (urlParams.get('chain')) filters.chain = urlParams.get('chain');
    if (urlParams.get('revised')) filters.revised = urlParams.get('revised');
    if (urlParams.get('mismatch')) filters.mismatch = urlParams.get('mismatch');
    if (urlParams.get('tier')) filters.tier = urlParams.get('tier');

    function chip(label, cls) {
        cls = cls || 'chip';
        return '<span class="' + cls + '">' + label + '</span>';
    }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Some rows have only an ancillary-blob in question_text:
    // "q: title: <real title>, description: ..., res_data: p1:0, p2:1, p3:0.5, ..."
    // Extract the inner title field if the row begins with the blob marker.
    function cleanQuestionText(q) {
        if (!q) return q;
        var m = q.match(/^q:\s*title:\s*(.+?),\s*description:/i);
        if (m) return m[1].trim();
        return q;
    }

    function tierBadge(tier) {
        var cls = tier === 'High' ? 'tier-high' :
                  tier === 'Caution' ? 'tier-caution' :
                  tier === 'Test' ? 'tier-test' : 'tier-low';
        var dotCls = tier === 'High' ? 'tier-dot-high' :
                     tier === 'Caution' ? 'tier-dot-caution' :
                     tier === 'Test' ? 'tier-dot-test' : 'tier-dot-low';
        return '<span class="tier-dot ' + dotCls + '"></span><span class="tier-badge ' + cls + '">' + tier + '</span>';
    }

    function riskFlagChips(r) {
        // Compact reasons: surface at most 2 chips per row to keep the column readable.
        // Priority: mismatch > no rule text > no source > no fallback > no edge cases.
        // Drop "repeated" (chain type already shown in its own column) and "clean".
        var a = r.audit || {};
        var chips = [];
        if (r.candidate_mismatch) chips.push('<span class="riskflag riskflag-warn">mismatch</span>');
        if (!a.rule_text_present) chips.push('<span class="riskflag riskflag-warn">no rule text</span>');
        else {
            if (!a.named_source_present) chips.push('<span class="riskflag riskflag-warn">no source</span>');
            if (!a.fallback_present) chips.push('<span class="riskflag riskflag-mild">no fallback</span>');
            if (!a.edge_cases_present) chips.push('<span class="riskflag riskflag-mild">no edge cases</span>');
        }
        if (chips.length === 0) return '<span class="muted">&mdash;</span>';
        return chips.slice(0, 2).join(' ');
    }

    function renderRow(r) {
        var qHtml = r.question_text
            ? escapeHtml(cleanQuestionText(r.question_text))
            : '<span class="muted-italic">[question text missing]</span>';
        var revisedChip = r.revised ? chip('yes', 'chip chip-warn') : chip('no', 'chip chip-ok');
        var chainChip = r.chain_type === 'Request-voiding chain'
            ? chip('voiding', 'chip chip-warn')
            : (r.chain_type === 'Repeated adapter-routed request' ? chip('repeated', 'chip chip-info') : chip(r.chain_type, 'chip'));
        var mmChip = r.candidate_mismatch ? chip('candidate', 'chip chip-warn') : '<span class="muted">—</span>';
        return '<tr class="exp-row" data-id="' + r.id + '">' +
            '<td class="exp-col-tier">' + tierBadge(r.settlement_risk_tier || '—') + '</td>' +
            '<td class="exp-col-id mono">' + r.id + '</td>' +
            '<td class="exp-col-q">' + qHtml + '</td>' +
            '<td class="exp-col-flags">' + riskFlagChips(r) + '</td>' +
            '<td class="exp-col-cat">' + escapeHtml(r.category || '—') + '</td>' +
            '<td class="exp-col-prop"><strong>' + escapeHtml(r.first_proposal || '—') + '</strong></td>' +
            '<td class="exp-col-final"><strong>' + escapeHtml(r.final_payoff || '—') + '</strong></td>' +
            '<td class="exp-col-rev">' + revisedChip + '</td>' +
            '<td class="exp-col-chain">' + chainChip + '</td>' +
            '<td class="exp-col-mm">' + mmChip + '</td>' +
            '</tr>';
    }

    function applyFilters() {
        var s = filters.search.toLowerCase().trim();
        filtered = allRows.filter(function(r) {
            // Hide Test markets unless tier filter explicitly requests them
            if (filters.tier !== 'Test' && r.settlement_risk_tier === 'Test') return false;
            if (filters.tier !== 'all' && r.settlement_risk_tier !== filters.tier) return false;
            if (filters.revised === 'true' && !r.revised) return false;
            if (filters.revised === 'false' && r.revised) return false;
            if (filters.chain !== 'all' && r.chain_type !== filters.chain) return false;
            if (filters.mismatch === 'candidate' && !r.candidate_mismatch) return false;
            if (filters.hasq === 'true' && !r.question_text) return false;
            if (filters.hasq === 'false' && r.question_text) return false;
            if (filters.src === 'present' && !(r.audit && r.audit.named_source_present)) return false;
            if (filters.src === 'missing' && r.audit && r.audit.named_source_present) return false;
            if (s) {
                var hay = (cleanQuestionText(r.question_text || '') + ' ' + (r.question_text || '') + ' ' + (r.category || '') + ' ' + r.id).toLowerCase();
                if (hay.indexOf(s) === -1) return false;
            }
            return true;
        });
        page = 0;
        render();
    }

    function render() {
        var tbody = document.getElementById('explorer-tbody');
        var slice = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
        tbody.innerHTML = slice.map(renderRow).join('');

        // Wire row clicks → contract.html?id=...
        tbody.querySelectorAll('.exp-row').forEach(function(tr) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', function() {
                window.location.href = 'contract.html?id=' + encodeURIComponent(tr.dataset.id);
            });
        });

        var meta = document.getElementById('explorer-meta');
        if (filtered.length === 0 && filters.search) {
            // 3-state: search returned no disputed-panel matches
            var qEsc = encodeURIComponent(filters.search);
            meta.innerHTML =
                '<div class="not-found-card">' +
                  '<h3>Not found in disputed-contract panel</h3>' +
                  '<p>No contract matching <strong>' + escapeHtml(filters.search) + '</strong> in the 2,221-contract disputed sample. This usually means one of three things:</p>' +
                  '<ol style="margin-top:8px;line-height:1.7;">' +
                    '<li>It was never disputed (most markets resolve cleanly).</li>' +
                    '<li>It has not resolved yet.</li>' +
                    '<li>It is outside the current snapshot.</li>' +
                  '</ol>' +
                  '<p style="margin-top:12px;"><strong>Still useful:</strong> paste the rule text into the analyzer for a rule-clarity screen.</p>' +
                  '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">' +
                    '<a class="btn btn-primary" href="analyze.html?q=' + qEsc + '">Analyze rule text →</a>' +
                    '<a class="btn btn-secondary" href="blueprints.html">See blueprints</a>' +
                  '</div>' +
                '</div>';
        } else {
            meta.textContent = filtered.length + ' contracts match (showing ' +
                Math.min(filtered.length, page * ROWS_PER_PAGE + 1) + '–' +
                Math.min(filtered.length, (page + 1) * ROWS_PER_PAGE) + ')';
        }

        renderPagination();
    }

    function renderPagination() {
        var pages = Math.ceil(filtered.length / ROWS_PER_PAGE);
        var pag = document.getElementById('explorer-pagination');
        if (pages <= 1) { pag.innerHTML = ''; return; }
        var html = '<button class="exp-pg" data-pg="prev"' + (page === 0 ? ' disabled' : '') + '>‹ Prev</button>' +
                   '<span class="exp-pg-info">Page ' + (page + 1) + ' of ' + pages + '</span>' +
                   '<button class="exp-pg" data-pg="next"' + (page === pages - 1 ? ' disabled' : '') + '>Next ›</button>';
        pag.innerHTML = html;
        pag.querySelectorAll('.exp-pg').forEach(function(b) {
            b.addEventListener('click', function() {
                if (b.dataset.pg === 'prev' && page > 0) page--;
                if (b.dataset.pg === 'next' && page < pages - 1) page++;
                render();
                document.querySelector('.explorer-table').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function setActiveChips() {
        Object.keys(filters).forEach(function(f) {
            if (f === 'search') return;
            document.querySelectorAll('.explorer-chip[data-filter="' + f + '"]').forEach(function(b) {
                b.classList.toggle('active', b.dataset.value === filters[f]);
            });
        });
    }

    function wireFilters() {
        document.querySelectorAll('.explorer-chip').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var f = btn.dataset.filter;
                filters[f] = btn.dataset.value;
                setActiveChips();
                applyFilters();
            });
        });

        var searchEl = document.getElementById('search');
        searchEl.value = filters.search;
        var debounce;
        searchEl.addEventListener('input', function() {
            clearTimeout(debounce);
            debounce = setTimeout(function() {
                filters.search = searchEl.value;
                applyFilters();
            }, 200);
        });
    }

    // Default sort: rows with question text first, then by tier severity (Mismatch > High > Caution > Low),
    // then revised first within tier. Pushes the 465 [question text missing] rows to the bottom of the
    // default view rather than scattering them through the table.
    function defaultSortKey(r) {
        var hasQ = r.question_text ? 0 : 1;             // 0 first, 1 last
        var tierRank = r.candidate_mismatch ? 0
                     : r.settlement_risk_tier === 'High'    ? 1
                     : r.settlement_risk_tier === 'Caution' ? 2
                     : r.settlement_risk_tier === 'Low'     ? 3
                     : r.settlement_risk_tier === 'Test'    ? 5 : 4;
        var revisedRank = r.revised ? 0 : 1;
        return [hasQ, tierRank, revisedRank];
    }
    function compareRows(a, b) {
        var ka = defaultSortKey(a), kb = defaultSortKey(b);
        for (var i = 0; i < ka.length; i++) {
            if (ka[i] !== kb[i]) return ka[i] - kb[i];
        }
        return 0;
    }

    fetch('data/disputed_contracts.json').then(r => r.json()).then(d => {
        allRows = d.rows.slice().sort(compareRows);
        wireFilters();
        setActiveChips();
        applyFilters();
    }).catch(function(err) {
        console.error('disputed_contracts.json load failed:', err);
        document.getElementById('explorer-tbody').innerHTML =
            '<tr><td colspan="8" style="color: #ef4444; padding: 24px; text-align: center;">' +
            'Could not load disputed_contracts.json. Serve over http:// (not file://).</td></tr>';
    });
})();
