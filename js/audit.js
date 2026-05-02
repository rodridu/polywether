// Settlement Auditability — eight-item checklist viewer

(function() {
    var ITEMS = [
        { key: 'rule_text_present',         label: 'Rule text available' },
        { key: 'named_source_present',      label: 'Named source specified' },
        { key: 'fallback_present',          label: 'Fallback specified' },
        { key: 'edge_cases_present',        label: 'Edge cases specified' },
        { key: 'settlement_chain_complete', label: 'Settlement chain complete' },
        { key: 'repeated_request_flag',     label: 'Repeated-request flag' },
        { key: 'final_payoff_observed',     label: 'Final payoff observed' },
        { key: 'benchmark_agreed',          label: 'Benchmark agreement' },
    ];

    var allRows = [];

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function renderAggregate() {
        var box = document.getElementById('audit-aggregate');
        var total = allRows.length;
        var html = '';
        ITEMS.forEach(function(item) {
            var n = 0, nullCount = 0;
            allRows.forEach(function(r) {
                var v = r.audit ? r.audit[item.key] : null;
                if (v === true) n++;
                else if (v === null) nullCount++;
            });
            var pct = (100 * n / total).toFixed(1);
            html += '<div class="audit-agg-row">' +
                '<div class="audit-agg-label">' + item.label + '</div>' +
                '<div class="audit-agg-bar"><div class="audit-agg-fill" style="width:' + pct + '%"></div></div>' +
                '<div class="audit-agg-pct">' + n.toLocaleString() + ' / ' + total.toLocaleString() + ' (' + pct + '%)</div>' +
                '</div>';
        });
        box.innerHTML = html;
    }

    function renderCard(r) {
        if (!r) {
            document.getElementById('audit-card').innerHTML = '<p class="muted">Pick a contract above to see its checklist.</p>';
            return;
        }
        var rows = ITEMS.map(function(item) {
            var v = r.audit ? r.audit[item.key] : null;
            var icon, cls;
            if (v === true)       { icon = '✓'; cls = 'audit-yes'; }
            else if (v === false) { icon = '✗'; cls = 'audit-no'; }
            else                  { icon = '?'; cls = 'audit-unk'; }
            return '<li class="' + cls + '"><span class="audit-icon">' + icon + '</span> ' + item.label + '</li>';
        }).join('');
        var trueCount = ITEMS.filter(function(i) { return r.audit && r.audit[i.key] === true; }).length;
        var html =
            '<div class="audit-card-header">' +
                '<div class="audit-card-id mono">id ' + r.id + '</div>' +
                '<h3 class="audit-card-question">' + (r.question_text ? escapeHtml(r.question_text) : '<span class="muted-italic">[question text missing]</span>') + '</h3>' +
                '<div class="audit-card-meta">' +
                    escapeHtml(r.category || 'uncategorized') + ' &middot; ' +
                    'first proposal <strong>' + escapeHtml(r.first_proposal || '—') + '</strong> &middot; ' +
                    'final payoff <strong>' + escapeHtml(r.final_payoff || '—') + '</strong> &middot; ' +
                    (r.revised ? '<span class="chip chip-warn">revised</span>' : '<span class="chip chip-ok">not revised</span>') +
                '</div>' +
                '<div class="audit-card-score">' + trueCount + ' / ' + ITEMS.length + ' items present</div>' +
            '</div>' +
            '<ul class="audit-checklist">' + rows + '</ul>';
        document.getElementById('audit-card').innerHTML = html;
    }

    function pickRandom() {
        var withQ = allRows.filter(function(r) { return r.question_text; });
        return withQ[Math.floor(Math.random() * withQ.length)];
    }

    function wireSearch() {
        var input = document.getElementById('audit-search');
        var box = document.getElementById('audit-suggestions');
        var debounce;
        input.addEventListener('input', function() {
            clearTimeout(debounce);
            debounce = setTimeout(function() {
                var q = input.value.toLowerCase().trim();
                if (q.length < 2) { box.innerHTML = ''; return; }
                var matches = allRows.filter(function(r) {
                    var hay = ((r.question_text || '') + ' ' + (r.category || '') + ' ' + r.id).toLowerCase();
                    return hay.indexOf(q) !== -1;
                }).slice(0, 8);
                box.innerHTML = matches.map(function(r) {
                    return '<button class="audit-suggest" data-id="' + r.id + '">' +
                        '<span class="mono">' + r.id + '</span> ' +
                        '<span>' + escapeHtml(r.question_text || '[question text missing]') + '</span>' +
                        '</button>';
                }).join('');
                box.querySelectorAll('.audit-suggest').forEach(function(b) {
                    b.addEventListener('click', function() {
                        var pick = allRows.find(function(r) { return r.id === b.dataset.id; });
                        renderCard(pick);
                        box.innerHTML = '';
                        input.value = '';
                    });
                });
            }, 150);
        });
        document.getElementById('audit-random').addEventListener('click', function() { renderCard(pickRandom()); });
    }

    fetch('data/disputed_contracts.json').then(r => r.json()).then(d => {
        allRows = d.rows;
        renderAggregate();
        renderCard(pickRandom());
        wireSearch();
    }).catch(function(err) {
        console.error('disputed_contracts.json load failed:', err);
        document.getElementById('audit-aggregate').innerHTML = '<p style="color:#ef4444;">Could not load disputed_contracts.json.</p>';
    });
})();
