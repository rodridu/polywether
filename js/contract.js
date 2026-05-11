// Contract detail — evidence-first layout (Phase 3.15).
// Top diagnostic card → settlement chain → evidence → audit → base rates → small interpretation notes.

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

    // Strip ancillary-blob marker from question_text if present.
    function cleanQuestionText(q) {
        if (!q) return q;
        var m = q.match(/^q:\s*title:\s*(.+?),\s*description:/i);
        if (m) return m[1].trim();
        return q;
    }

    // Classify the contract for the top diagnostic card.
    function classify(rec) {
        if (rec.is_test) return { key: 'test', label: 'Polymarket dev/test market', cls: 'cls-test', desc: 'Detected via JSON-blob ancillary; excluded from headline analysis.' };
        if (!rec.audit.rule_text_present && !rec.audit.description_present && !rec.audit.ancillary_present) {
            return { key: 'no_text', label: 'Settlement-only (no rule text)', cls: 'cls-warn', desc: 'Settlement chain observed via UMA but Polymarket-side metadata (question, description, ancillary) does not join. One of the 465 / 2,221 contracts with no recoverable rule text.' };
        }
        if (rec.candidate_mismatch && rec.mismatch_agreed) {
            return { key: 'mismatch_agreed', label: 'Candidate mismatch (row-level agreed)', cls: 'cls-warn', desc: 'Two-pass LLM benchmark independently coded this row; final payoff S diverges from rule-implied G under the operative source.' };
        }
        if (rec.candidate_mismatch) {
            return { key: 'mismatch_frozen', label: 'Candidate mismatch (frozen pass)', cls: 'cls-warn', desc: 'Single-pass LLM benchmark flagged this row; not independently re-coded.' };
        }
        if (rec.revised) {
            return { key: 'revised', label: 'Revised', cls: 'cls-info', desc: 'Final payoff differs from the first proposed outcome — the resolution mechanism rewrote the answer.' };
        }
        return { key: 'clean', label: 'Clean settlement', cls: 'cls-ok', desc: 'First proposal and final payoff agreed. Settlement was clean despite the dispute.' };
    }

    function renderTopCard(rec) {
        var cls = classify(rec);
        var tierCls = rec.settlement_risk_tier === 'High' ? 'tier-high'
                    : rec.settlement_risk_tier === 'Caution' ? 'tier-caution'
                    : rec.settlement_risk_tier === 'Test' ? 'tier-test' : 'tier-low';
        var tierDotCls = rec.settlement_risk_tier === 'High' ? 'tier-dot-high'
                       : rec.settlement_risk_tier === 'Caution' ? 'tier-dot-caution'
                       : rec.settlement_risk_tier === 'Test' ? 'tier-dot-test' : 'tier-dot-low';
        var tierBadge = '<span class="tier-dot ' + tierDotCls + '"></span><span class="tier-badge tier-badge-large ' + tierCls + '">Settlement risk: ' + escapeHtml(rec.settlement_risk_tier || '—') + '</span>';
        var reasons = (rec.risk_reasons && rec.risk_reasons.length)
            ? '<div class="contract-risk-reasons">' + rec.risk_reasons.map(function(rsn) { return '<span class="contract-risk-reason">' + escapeHtml(rsn) + '</span>'; }).join('') + '</div>'
            : '';
        var elapsed = fmtElapsed(rec.first_proposal_time, rec.final_settlement_time);
        var pmHref = rec.slug ? 'https://polymarket.com/event/' + rec.slug : null;

        return '<section class="contract-card-top">' +
            '<div class="contract-card-row">' +
                '<div class="contract-card-cell">' +
                    '<div class="card-cell-label">Classification</div>' +
                    '<div class="card-cell-value ' + cls.cls + '">' + escapeHtml(cls.label) + '</div>' +
                    '<div class="card-cell-desc">' + escapeHtml(cls.desc) + '</div>' +
                '</div>' +
                '<div class="contract-card-cell">' +
                    '<div class="card-cell-label">Risk tier</div>' +
                    '<div class="card-cell-value">' + tierBadge + '</div>' +
                    reasons +
                '</div>' +
                '<div class="contract-card-cell">' +
                    '<div class="card-cell-label">Chain type</div>' +
                    '<div class="card-cell-value">' + chip(rec.chain_type, rec.chain_type === 'Request-voiding chain' ? 'chip-warn' : 'chip-info') + '</div>' +
                    '<div class="card-cell-desc">' + (rec.multi_episode ? 'Multi-episode chain.' : 'Single-episode chain.') + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="contract-wgs">' +
                '<div class="wgs-cell"><div class="wgs-key">P&#8321;</div><div class="wgs-val">' + escapeHtml(rec.first_proposal || '—') + '</div><div class="wgs-desc">First proposed outcome</div></div>' +
                '<div class="wgs-arrow">&rarr;</div>' +
                '<div class="wgs-cell"><div class="wgs-key">S</div><div class="wgs-val">' + escapeHtml(rec.final_payoff || '—') + '</div><div class="wgs-desc">Final settlement state</div></div>' +
                '<div class="wgs-cell wgs-cell-g"><div class="wgs-key">G</div><div class="wgs-val">' + (rec.candidate_mismatch ? '&ne; S' : '<span class="muted">— not coded —</span>') + '</div><div class="wgs-desc">Rule-implied label (LLM benchmark)</div></div>' +
            '</div>' +
            '<div class="contract-card-meta">' +
                '<span class="mono">id ' + escapeHtml(rec.id) + '</span>' +
                ' &middot; ' + escapeHtml(rec.category || 'uncategorized') +
                ' &middot; First proposal ' + fmtTime(rec.first_proposal_time) +
                ' &middot; Final settlement ' + fmtTime(rec.final_settlement_time) + (elapsed ? ' (' + elapsed + ' after)' : '') +
                (pmHref ? ' &middot; <a href="' + pmHref + '" target="_blank" rel="noopener">Polymarket &uarr;</a>' : '') +
            '</div>' +
            '<div class="contract-card-condid"><span class="muted">Condition ID:</span> <span class="mono">' + escapeHtml(rec.raw_condition_id || '—') + '</span></div>' +
            '</section>';
    }

    function renderAuditSection(audit) {
        var groups = [
            { title: 'Text availability', items: [
                ['rule_text_present',    'Question / rule text recovered'],
                ['description_present',  'Resolution description recovered'],
                ['ancillary_present',    'UMA ancillary data recovered'],
            ]},
            { title: 'Contract clarity (heuristic regex)', items: [
                ['named_source_present', 'Named external source language present'],
                ['fallback_present',     'Fallback / contingency language present'],
                ['edge_cases_present',   'Edge-case language present'],
            ]},
            { title: 'Settlement-chain observability', items: [
                ['final_payoff_observed', 'Final payoff state observed'],
                ['multi_episode',         'Multi-episode chain (≥ 2 requests)'],
            ]},
            { title: 'Diagnostic disagreement', items: [
                ['candidate_mismatch', 'Candidate mismatch under coded benchmark'],
            ], invertColor: true },
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
                else                  { icon = '?';      cls = 'audit-unk'; }
                return '<li class="' + cls + '"><span class="audit-icon">' + icon + '</span> ' + escapeHtml(item[1]) + '</li>';
              }).join('') +
              '</ul></div>';
        }).join('');
    }

    function renderText(label, text, missingNote) {
        if (!text) {
            return '<div class="contract-text-block contract-text-missing">' +
                '<h3>' + label + '</h3>' +
                '<p class="muted-italic">[not recoverable]</p>' +
                (missingNote ? '<p class="contract-text-missing-note">' + missingNote + '</p>' : '') +
                '</div>';
        }
        return '<div class="contract-text-block"><h3>' + label + '</h3><pre class="contract-text-pre">' + escapeHtml(text) + '</pre></div>';
    }

    function computeBaseRates(rec, allRows) {
        function rate(filterFn) {
            var bucket = allRows.filter(filterFn);
            var nrev = bucket.filter(function(r) { return r.revised; }).length;
            var nmm  = bucket.filter(function(r) { return r.candidate_mismatch; }).length;
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
                '<span class="base-rate-stat"><strong>' + (100*r.revision_rate).toFixed(1) + '%</strong> revised</span>' +
                '<span class="base-rate-stat"><strong>' + (100*r.mismatch_rate).toFixed(1) + '%</strong> broad mismatch</span>' +
                '</div>';
        }
        return '<section class="contract-section"><h2>Markets like this</h2>' +
            '<p class="muted contract-section-intro">Conditional revision and broad-mismatch rates across the 2,221-disputed sample, stratified by features of this contract. Sample shares, not estimates with uncertainty intervals.</p>' +
            '<div class="base-rate-grid">' +
                pctRow('Overall (disputed sample)', rates.overall) +
                pctRow('Same chain type', rates.same_chain) +
                (rates.same_chain_category ? pctRow('Same chain type + same category', rates.same_chain_category) : '') +
                pctRow('Same chain type + same named-source status', rates.same_chain_source) +
            '</div></section>';
    }

    function renderEpisodes(episodes) {
        if (!episodes || !episodes.length) return '';
        return '<section class="contract-section"><h2>Settlement chain</h2>' +
            '<p class="muted contract-section-intro">Request-by-request episode reconstruction from UMA <code>RequestPrice</code> / <code>DisputePrice</code> / <code>SettlePrice</code> events.</p>' +
            '<div class="chain-timeline">' +
            episodes.map(function(ep, i) {
                var voided = ep.was_disputed && (ep.final_outcome || '').toLowerCase() === 'other';
                var nodeCls = 'chain-node' + (ep.was_disputed ? ' chain-node-disputed' : '') + (voided ? ' chain-node-voided' : '');
                var arrow = (i < episodes.length - 1) ? '<div class="chain-arrow">&rarr;</div>' : '';
                return '<div class="' + nodeCls + '">' +
                    '<div class="chain-node-idx">Request ' + (i+1) + '</div>' +
                    '<div class="chain-node-row"><span class="chain-node-key">Proposed:</span> <strong>' + escapeHtml(ep.proposed || '—') + '</strong></div>' +
                    '<div class="chain-node-row"><span class="chain-node-key">Disputed:</span> ' + (ep.was_disputed ? chip('yes','chip-warn') : chip('no','chip-ok')) + '</div>' +
                    '<div class="chain-node-row"><span class="chain-node-key">Final:</span> <strong>' + escapeHtml(ep.final_outcome || '—') + '</strong>' + (voided ? ' ' + chip('DVM voided','chip-warn') : '') + '</div>' +
                    '<div class="chain-node-time">' + fmtTime(ep.proposal_time).slice(0,10) + (ep.dispute_time ? ' &middot; disp ' + fmtTime(ep.dispute_time).slice(0,10) : '') + '</div>' +
                    '</div>' + arrow;
            }).join('') +
            '</div></section>';
    }

    function renderInterpretationNotes(rec, rates) {
        var tier = rec.settlement_risk_tier || '—';
        var voiding = rec.chain_type === 'Request-voiding chain';

        var traderNote =
            (rec.revised
                ? 'Final payoff <strong>differed</strong> from first proposal. The mechanism rewrote the answer at least once.'
                : 'First proposal and final payoff agreed. Settlement was clean despite the dispute.') +
            (rates.same_chain_category && rates.same_chain_category.n
                ? ' Among contracts in the same chain type and category, <strong>' + (100*rates.same_chain_category.revision_rate).toFixed(0) + '%</strong> revised.'
                : ' Bucket too small for stable base rates.') +
            ' Read the price as conditional on the resolution mechanism, not as unconditional event probability. Not buy/sell guidance.';

        var citationNote =
            (tier === 'Low' ? '<strong>Likely cite-safe.</strong> Source, fallback, edge-case language all detected.' :
             tier === 'Caution' ? '<strong>Cite with caveat.</strong> Some required clarity fields are missing.' :
             tier === 'High' ? '<strong>Do not cite without explanation.</strong> Either rule text is missing or the contract has no named source / fallback.' :
             tier === 'Test' ? '<strong>Test market.</strong> Not a real settlement question.' : '') +
            ' See <a href="cite.html">Cite</a> for the full 6-question check.';

        var missing = [];
        if (rec.audit && !rec.audit.named_source_present) missing.push('named external source');
        if (rec.audit && !rec.audit.fallback_present) missing.push('fallback');
        if (rec.audit && !rec.audit.edge_cases_present) missing.push('edge-case language');
        if (rec.audit && !rec.audit.rule_text_present) missing.push('any recoverable rule text');
        var designNote = missing.length
            ? 'Missing fields: <strong>' + missing.map(escapeHtml).join(', ') + '</strong>. Each maps to a <a href="analyze.html">Rule Check</a> field; <a href="blueprints.html">contract templates</a> show longer-form examples by market type.'
            : 'All standard clarity fields detected. The contract still ended up disputed, which is itself a signal worth studying.';

        return '<section class="contract-section"><h2>Interpretation notes</h2>' +
            '<p class="muted contract-section-intro">Three short reads. Same evidence, three audience framings. Optional &mdash; the diagnostic card above is the canonical record.</p>' +
            '<div class="interp-grid">' +
                '<div class="interp-card"><h3>Trader</h3><p>' + traderNote + '</p></div>' +
                '<div class="interp-card"><h3>Journalist</h3><p>' + citationNote + '</p></div>' +
                '<div class="interp-card"><h3>Market designer</h3><p>' + designNote + '</p></div>' +
            '</div></section>';
    }

    function render(rec, episodes, allRows) {
        if (!rec) {
            document.getElementById('contract-title').textContent = 'Contract not found';
            document.getElementById('contract-meta').textContent = 'No disputed contract matches the requested id.';
            document.getElementById('contract-body').innerHTML =
                '<p>Try <a href="explorer.html">Analyze</a> for the full panel, or paste rule text directly into the <a href="analyze.html">Rule Check</a> if the market is live or outside the disputed-contract sample.</p>';
            return;
        }

        // Hero — question + tier badge in meta line.
        document.getElementById('contract-title').textContent = cleanQuestionText(rec.question_text) || '[question text missing]';
        var heroMeta = '<span class="mono">id ' + rec.id + '</span> &middot; ' + escapeHtml(rec.category || 'uncategorized') + ' &middot; ' + escapeHtml(rec.chain_type);
        document.getElementById('contract-meta').innerHTML = heroMeta;

        var rates = computeBaseRates(rec, allRows);

        var qMissingNote = !rec.question_text ? 'See <a href="research.html#limitations">Research &rarr; Limitations</a> &mdash; one of 465 / 2,221 contracts where Polymarket-side metadata does not join the rev3 settlement panel.' : null;

        var pmUrl = rec.slug ? 'https://polymarket.com/event/' + rec.slug : null;
        var actionsHtml = '<div class="contract-actions">' +
            '<a class="btn btn-secondary" href="explorer.html?search=' + encodeURIComponent(rec.id) + '">&larr; Back to Analyze</a> ' +
            '<a class="btn btn-secondary" href="query.html">Open in SQL Lab</a> ' +
            (pmUrl ? '<a class="btn btn-secondary" href="' + pmUrl + '" target="_blank" rel="noopener">View on Polymarket &uarr;</a> ' : '') +
            (rec.raw_condition_id ? '<button class="btn btn-secondary" data-copy="' + rec.raw_condition_id + '">Copy condition ID</button> ' : '') +
            (rec.slug ? '<button class="btn btn-secondary" data-copy="' + rec.slug + '">Copy slug</button> ' : '') +
            '</div>';

        document.getElementById('contract-body').innerHTML =
            renderTopCard(rec) +
            renderEpisodes(episodes) +
            '<section class="contract-section"><h2>Evidence</h2>' +
                renderText('Question text (Polymarket)', rec.question_text, qMissingNote) +
                renderText('Resolution description (Polymarket)', rec.description) +
                renderText('UMA ancillary data (decoded)', rec.ancillary_text) +
            '</section>' +
            '<section class="contract-section"><h2>Audit checklist</h2>' +
                renderAuditSection(rec.audit) +
            '</section>' +
            renderBaseRates(rates) +
            renderInterpretationNotes(rec, rates) +
            actionsHtml;

        document.querySelectorAll('.contract-actions button[data-copy]').forEach(function(b) {
            b.addEventListener('click', function() {
                navigator.clipboard.writeText(b.dataset.copy).then(function() {
                    var orig = b.textContent;
                    b.textContent = 'Copied ✓';
                    setTimeout(function() { b.textContent = orig; }, 1500);
                });
            });
        });
    }

    var params = new URLSearchParams(window.location.search);
    var id = params.get('id');
    if (!id) {
        document.getElementById('contract-title').textContent = 'No contract id';
        document.getElementById('contract-meta').textContent = 'Open a contract from Analyze, Chain View, or Cases.';
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
