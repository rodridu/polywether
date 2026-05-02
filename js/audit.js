// Settlement Auditability — nine flags grouped into four categories.

(function() {
    var GROUPS = [
        { title: 'A. Text availability', invertColor: false, items: [
            { key: 'rule_text_present',    label: 'Rule text recovered' },
            { key: 'description_present',  label: 'Description recovered' },
            { key: 'ancillary_present',    label: 'UMA ancillary data recovered' },
        ]},
        { title: 'B. Contract clarity', invertColor: false, items: [
            { key: 'named_source_present', label: 'Named external source language' },
            { key: 'fallback_present',     label: 'Fallback / contingency language' },
            { key: 'edge_cases_present',   label: 'Edge-case language' },
        ]},
        { title: 'C. Settlement-chain observability', invertColor: false, items: [
            { key: 'final_payoff_observed', label: 'Final payoff observed' },
            { key: 'multi_episode',         label: 'Multi-episode chain (≥ 2 requests)' },
        ]},
        // Diagnostic disagreement: candidate_mismatch=true is a flag (not a "good" mark)
        { title: 'D. Diagnostic disagreement', invertColor: true, items: [
            { key: 'candidate_mismatch', label: 'Candidate mismatch under coded benchmark' },
        ]},
    ];

    var allRows = [];

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function renderAggregate() {
        var box = document.getElementById('audit-aggregate');
        var total = allRows.length;
        var html = '';
        GROUPS.forEach(function(g) {
            html += '<div class="audit-agg-group-title">' + escapeHtml(g.title) + '</div>';
            g.items.forEach(function(item) {
                var n = allRows.filter(function(r) { return r.audit && r.audit[item.key] === true; }).length;
                var pct = (100 * n / total).toFixed(1);
                html += '<div class="audit-agg-row">' +
                    '<div class="audit-agg-label">' + escapeHtml(item.label) + '</div>' +
                    '<div class="audit-agg-bar"><div class="audit-agg-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="audit-agg-pct">' + n.toLocaleString() + ' / ' + total.toLocaleString() + ' (' + pct + '%)</div>' +
                    '</div>';
            });
        });
        box.innerHTML = html;
    }

    function renderCard(r) {
        if (!r) {
            document.getElementById('audit-card').innerHTML = '<p class="muted">Pick a contract above to see its checklist.</p>';
            return;
        }
        var groupHtml = GROUPS.map(function(g) {
            var rows = g.items.map(function(item) {
                var v = r.audit ? r.audit[item.key] : null;
                var icon, cls;
                if (v === true)       { icon = '✓'; cls = g.invertColor ? 'audit-no' : 'audit-yes'; }
                else if (v === false) { icon = '✗'; cls = g.invertColor ? 'audit-yes' : 'audit-no'; }
                else                  { icon = '?'; cls = 'audit-unk'; }
                return '<li class="' + cls + '"><span class="audit-icon">' + icon + '</span> ' + escapeHtml(item.label) + '</li>';
            }).join('');
            return '<div class="audit-group"><h4 class="audit-group-title">' + escapeHtml(g.title) + '</h4><ul class="audit-checklist">' + rows + '</ul></div>';
        }).join('');

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
                '<div class="audit-card-actions" style="margin-top:8px;">' +
                    '<a class="btn btn-secondary" href="contract.html?id=' + encodeURIComponent(r.id) + '">Open contract detail →</a>' +
                '</div>' +
            '</div>' + groupHtml;
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
