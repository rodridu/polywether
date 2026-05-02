// Contract detail page — show all available evidence for one contract.
// Reads ?id=XXXXXXXX from URL.

(function() {
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function fmtTime(epoch) {
        if (!epoch) return '—';
        var d = new Date(epoch * 1000);
        return d.toISOString().slice(0, 10) + ' (' + d.toUTCString().slice(17, 22) + ' UTC)';
    }

    function fmtElapsed(from, to) {
        if (!from || !to) return null;
        var s = to - from;
        if (s < 60) return s + 's';
        if (s < 3600) return Math.round(s/60) + 'm';
        if (s < 86400) return Math.floor(s/3600) + 'h ' + Math.round((s%3600)/60) + 'm';
        var days = Math.floor(s/86400), hours = Math.floor((s%86400)/3600);
        return days + 'd' + (hours ? ' ' + hours + 'h' : '');
    }

    function chip(label, cls) { return '<span class="chip ' + (cls||'') + '">' + escapeHtml(label) + '</span>'; }

    function renderAuditSection(audit) {
        var groups = [
            { title: 'Text availability',
              items: [
                ['rule_text_present',    'Question / rule text recovered'],
                ['description_present',  'Resolution description recovered'],
                ['ancillary_present',    'UMA ancillary data recovered'],
              ],
            },
            { title: 'Contract clarity (heuristic regex)',
              items: [
                ['named_source_present', 'Named external source language present'],
                ['fallback_present',     'Fallback / contingency language present'],
                ['edge_cases_present',   'Edge-case language present'],
              ],
            },
            { title: 'Settlement-chain observability',
              items: [
                ['final_payoff_observed', 'Final payoff state observed'],
                ['multi_episode',         'Multi-episode chain (≥ 2 requests)'],
              ],
            },
            { title: 'Diagnostic disagreement',
              items: [
                ['candidate_mismatch', 'Candidate mismatch under coded benchmark'],
              ],
              invertColor: true,  // mismatch=true is a flag, not a "good" mark
            },
        ];
        return groups.map(function(g) {
            return '<div class="audit-group">' +
              '<h4 class="audit-group-title">' + escapeHtml(g.title) + '</h4>' +
              '<ul class="audit-checklist">' +
              g.items.map(function(item) {
                var v = audit[item[0]];
                var icon, cls;
                if (v === true)       { icon = '✓'; cls = g.invertColor ? 'audit-no' : 'audit-yes'; }
                else if (v === false) { icon = '✗'; cls = g.invertColor ? 'audit-yes' : 'audit-no'; }
                else                  { icon = '?'; cls = 'audit-unk'; }
                return '<li class="' + cls + '"><span class="audit-icon">' + icon + '</span> ' + escapeHtml(item[1]) + '</li>';
              }).join('') +
              '</ul></div>';
        }).join('');
    }

    function renderText(label, text) {
        if (!text) return '<div class="contract-text-block contract-text-missing"><h3>' + label + '</h3><p class="muted-italic">[not recoverable]</p></div>';
        return '<div class="contract-text-block"><h3>' + label + '</h3><pre class="contract-text-pre">' + escapeHtml(text) + '</pre></div>';
    }

    function computeBaseRates(rec, allRows) {
        // "Markets like this" — share of disputed contracts that revised, conditional on
        // (a) same chain_type, (b) same chain_type AND same category,
        // (c) same chain_type AND same named_source presence.
        function rate(filterFn) {
            var bucket = allRows.filter(filterFn);
            var nrev = bucket.filter(function(r) { return r.revised; }).length;
            var nmm = bucket.filter(function(r) { return r.candidate_mismatch; }).length;
            return { n: bucket.length, n_revised: nrev, revision_rate: bucket.length ? nrev/bucket.length : 0, n_mismatch: nmm, mismatch_rate: bucket.length ? nmm/bucket.length : 0 };
        }
        var ct = rec.chain_type;
        var cat = rec.category;
        var src = rec.audit && rec.audit.named_source_present;
        return {
            same_chain: rate(function(r) { return r.chain_type === ct; }),
            same_chain_category: cat ? rate(function(r) { return r.chain_type === ct && r.category === cat; }) : null,
            same_chain_source: rate(function(r) { return r.chain_type === ct && (r.audit && r.audit.named_source_present) === src; }),
            overall: rate(function(_) { return true; }),
        };
    }

    function renderBaseRates(rates) {
        function pctRow(label, r) {
            if (!r || r.n === 0) return '';
            return '<div class="base-rate-row">' +
                '<span class="base-rate-label">' + label + '</span>' +
                '<span class="base-rate-stat"><strong>' + (100*r.revision_rate).toFixed(1) + '%</strong> revised <span class="muted">(' + r.n_revised + ' / ' + r.n + ')</span></span>' +
                '<span class="base-rate-stat"><strong>' + (100*r.mismatch_rate).toFixed(1) + '%</strong> broad mismatch <span class="muted">(' + r.n_mismatch + ' / ' + r.n + ')</span></span>' +
                '</div>';
        }
        return '<div class="contract-section"><h2>Markets like this</h2>' +
            '<p class="muted" style="margin-bottom:12px;font-size:0.92em;">Conditional revision and broad-mismatch rates across the disputed sample, stratified by features of this contract. Sample shares, not estimates with uncertainty intervals.</p>' +
            '<div class="base-rate-grid">' +
                pctRow('Overall (disputed sample)', rates.overall) +
                pctRow('Same chain type', rates.same_chain) +
                (rates.same_chain_category ? pctRow('Same chain type + same category', rates.same_chain_category) : '') +
                pctRow('Same chain type + same named-source status', rates.same_chain_source) +
            '</div></div>';
    }

    function render(rec, episodes, allRows) {
        if (!rec) {
            document.getElementById('contract-title').textContent = 'Contract not found';
            document.getElementById('contract-meta').textContent = 'No contract matches the requested id.';
            document.getElementById('contract-body').innerHTML =
                '<p>Try the <a href="explorer.html">Contract Explorer</a> or use the search bar on the <a href="index.html">Funnel page</a>.</p>';
            return;
        }

        // hero
        document.getElementById('contract-title').textContent = rec.question_text || '[question text missing]';
        var meta = '<span class="mono">id ' + rec.id + '</span>' +
            ' &middot; ' + escapeHtml(rec.category || 'uncategorized') +
            ' &middot; ' + chip(rec.chain_type, rec.chain_type === 'Request-voiding chain' ? 'chip-warn' : 'chip-info');
        if (rec.revised) meta += ' ' + chip('revised', 'chip-warn');
        if (rec.candidate_mismatch) meta += ' ' + chip('candidate mismatch', 'chip-warn');
        document.getElementById('contract-meta').innerHTML = meta;

        // body
        var elapsed = fmtElapsed(rec.first_proposal_time, rec.final_settlement_time);
        var summary = '<div class="contract-summary">' +
            '<div class="contract-summary-row"><span class="muted">First proposal</span><strong>' + escapeHtml(rec.first_proposal || '—') + '</strong></div>' +
            '<div class="contract-summary-row"><span class="muted">Final payoff</span><strong>' + escapeHtml(rec.final_payoff || '—') + '</strong></div>' +
            '<div class="contract-summary-row"><span class="muted">Revised?</span>' + (rec.revised ? chip('yes', 'chip-warn') : chip('no', 'chip-ok')) + '</div>' +
            '<div class="contract-summary-row"><span class="muted">Chain type</span>' + chip(rec.chain_type, rec.chain_type === 'Request-voiding chain' ? 'chip-warn' : 'chip-info') + '</div>' +
            '<div class="contract-summary-row"><span class="muted">Multi-episode</span>' + (rec.multi_episode ? chip('yes', 'chip-info') : chip('no')) + '</div>' +
            '<div class="contract-summary-row"><span class="muted">First proposal</span><span>' + fmtTime(rec.first_proposal_time) + '</span></div>' +
            '<div class="contract-summary-row"><span class="muted">Final settlement</span><span>' + fmtTime(rec.final_settlement_time) + (elapsed ? ' (' + elapsed + ' after first proposal)' : '') + '</span></div>' +
            '</div>';

        // Episodes (if found in chain_examples or via on-fly query)
        var episodesHtml = '';
        if (episodes && episodes.length) {
            episodesHtml = '<div class="contract-section"><h2>Settlement chain</h2>' +
                '<div class="chain-timeline">' +
                episodes.map(function(ep, i) {
                    var voided = ep.was_disputed && (ep.final_outcome || '').toLowerCase() === 'other';
                    var nodeCls = 'chain-node' + (ep.was_disputed ? ' chain-node-disputed' : '') + (voided ? ' chain-node-voided' : '');
                    var arrow = (i < episodes.length - 1) ? '<div class="chain-arrow">→</div>' : '';
                    return '<div class="' + nodeCls + '">' +
                        '<div class="chain-node-idx">Request ' + (i+1) + '</div>' +
                        '<div class="chain-node-row"><span class="chain-node-key">Proposed:</span> <strong>' + escapeHtml(ep.proposed || '—') + '</strong></div>' +
                        '<div class="chain-node-row"><span class="chain-node-key">Disputed:</span> ' + (ep.was_disputed ? chip('yes','chip-warn') : chip('no','chip-ok')) + '</div>' +
                        '<div class="chain-node-row"><span class="chain-node-key">Final:</span> <strong>' + escapeHtml(ep.final_outcome || '—') + '</strong>' + (voided ? ' ' + chip('DVM voided','chip-warn') : '') + '</div>' +
                        '<div class="chain-node-time">' + fmtTime(ep.proposal_time).slice(0,10) + (ep.dispute_time ? ' &middot; disp ' + fmtTime(ep.dispute_time).slice(0,10) : '') + '</div>' +
                        '</div>' + arrow;
                }).join('') +
                '</div></div>';
        }

        var textsHtml = '<div class="contract-section"><h2>Evidence</h2>' +
            renderText('Question text (Polymarket)', rec.question_text) +
            renderText('Resolution description (Polymarket)', rec.description) +
            renderText('UMA ancillary data (decoded)', rec.ancillary_text) +
            '</div>';

        var auditHtml = '<div class="contract-section"><h2>Audit checklist</h2>' +
            renderAuditSection(rec.audit) +
            '</div>';

        var rates = computeBaseRates(rec, allRows);
        var ratesHtml = renderBaseRates(rates);

        var actionsHtml = '<div class="contract-actions">' +
            '<a class="btn btn-secondary" href="explorer.html?search=' + encodeURIComponent(rec.id) + '">↩ Back to Explorer</a> ' +
            '<a class="btn btn-secondary" href="query.html">Open in SQL Lab</a>' +
            '</div>';

        document.getElementById('contract-body').innerHTML =
            summary + ratesHtml + episodesHtml + textsHtml + auditHtml + actionsHtml;
    }

    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (!id) {
        document.getElementById('contract-title').textContent = 'No contract id';
        document.getElementById('contract-meta').textContent = 'Open a contract from the Explorer, Chain View, or Cases page.';
        return;
    }

    Promise.all([
        fetch('data/disputed_contracts.json').then(r => r.json()),
        fetch('data/chain_examples.json').then(r => r.json()).catch(() => ({examples:[]})),
    ]).then(function(arr) {
        var allRows = arr[0].rows;
        var rec = allRows.find(r => r.id === id);
        var ex = (arr[1].examples || []).find(e => e.id === id);
        var episodes = ex ? ex.request_sequence.map(function(e) {
            return {
                proposed: e.proposed,
                final_outcome: e.final_outcome,
                was_disputed: e.was_disputed,
                proposal_time: e.proposal_time,
                dispute_time: e.dispute_time,
            };
        }) : null;
        render(rec, episodes, allRows);
    }).catch(function(err) {
        console.error('contract load failed:', err);
        document.getElementById('contract-body').innerHTML = '<p style="color:#ef4444">Could not load contract data.</p>';
    });
})();
