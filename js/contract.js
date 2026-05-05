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
        var tierCls = rec.settlement_risk_tier === 'High' ? 'tier-high' : rec.settlement_risk_tier === 'Caution' ? 'tier-caution' : 'tier-low';
        var tierBadgeHtml = '<span class="tier-badge tier-badge-large ' + tierCls + '">Settlement risk: ' + escapeHtml(rec.settlement_risk_tier || '—') + '</span>';
        var reasonsHtml = (rec.risk_reasons && rec.risk_reasons.length)
            ? '<div class="contract-risk-reasons">' + rec.risk_reasons.map(function(rsn) { return '<span class="contract-risk-reason">' + escapeHtml(rsn) + '</span>'; }).join('') + '</div>'
            : '';
        var meta = tierBadgeHtml + reasonsHtml +
            '<div style="margin-top:10px;"><span class="mono">id ' + rec.id + '</span>' +
            ' &middot; ' + escapeHtml(rec.category || 'uncategorized') +
            ' &middot; ' + chip(rec.chain_type, rec.chain_type === 'Request-voiding chain' ? 'chip-warn' : 'chip-info');
        if (rec.revised) meta += ' ' + chip('revised', 'chip-warn');
        if (rec.candidate_mismatch) meta += ' ' + chip('candidate mismatch', 'chip-warn');
        meta += '</div>';
        document.getElementById('contract-meta').innerHTML = meta;

        // body
        var elapsed = fmtElapsed(rec.first_proposal_time, rec.final_settlement_time);
        var pmHref = rec.slug ? 'https://polymarket.com/event/' + rec.slug : null;
        var summary = '<div class="contract-summary">' +
            '<div class="contract-summary-row"><span class="muted">First proposal</span><strong>' + escapeHtml(rec.first_proposal || '—') + '</strong></div>' +
            '<div class="contract-summary-row"><span class="muted">Final payoff</span><strong>' + escapeHtml(rec.final_payoff || '—') + '</strong></div>' +
            '<div class="contract-summary-row"><span class="muted">Revised?</span>' + (rec.revised ? chip('yes', 'chip-warn') : chip('no', 'chip-ok')) + '</div>' +
            '<div class="contract-summary-row"><span class="muted">Chain type</span>' + chip(rec.chain_type, rec.chain_type === 'Request-voiding chain' ? 'chip-warn' : 'chip-info') + '</div>' +
            '<div class="contract-summary-row"><span class="muted">Multi-episode</span>' + (rec.multi_episode ? chip('yes', 'chip-info') : chip('no')) + '</div>' +
            '<div class="contract-summary-row"><span class="muted">First proposal</span><span>' + fmtTime(rec.first_proposal_time) + '</span></div>' +
            '<div class="contract-summary-row"><span class="muted">Final settlement</span><span>' + fmtTime(rec.final_settlement_time) + (elapsed ? ' (' + elapsed + ' after first proposal)' : '') + '</span></div>' +
            (pmHref ? '<div class="contract-summary-row"><span class="muted">Polymarket slug</span><a href="' + pmHref + '" target="_blank" rel="noopener" class="mono">' + escapeHtml(rec.slug) + ' ↗</a></div>' : '') +
            '<div class="contract-summary-row"><span class="muted">Condition ID</span><span class="mono" style="font-size:0.78em;word-break:break-all;">' + escapeHtml(rec.raw_condition_id || '—') + '</span></div>' +
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

        var pmUrl = rec.slug ? 'https://polymarket.com/event/' + rec.slug : null;
        var actionsHtml = '<div class="contract-actions">' +
            '<a class="btn btn-secondary" href="explorer.html?search=' + encodeURIComponent(rec.id) + '">↩ Back to Explorer</a> ' +
            '<a class="btn btn-secondary" href="query.html">Open in SQL Lab</a> ' +
            (pmUrl ? '<a class="btn btn-secondary" href="' + pmUrl + '" target="_blank" rel="noopener">View on Polymarket ↗</a> ' : '') +
            (rec.raw_condition_id ? '<button class="btn btn-secondary" data-copy="' + rec.raw_condition_id + '">Copy condition ID</button> ' : '') +
            (rec.slug ? '<button class="btn btn-secondary" data-copy="' + rec.slug + '">Copy slug</button> ' : '') +
            '</div>';

        // Build audience-tab views. Same data, different framing.
        var tierLabel = rec.settlement_risk_tier || '—';
        var voiding = rec.chain_type === 'Request-voiding chain';
        var traderView =
            '<div class="aud-view"><h3>Trader read</h3>' +
            '<p>This market sits at <strong>' + tierLabel + '</strong> settlement risk. ' +
            (rec.revised
                ? 'The final payoff <strong>differed</strong> from the first proposed outcome — settlement-mechanism intervention rewrote the answer at least once.'
                : 'First proposal and final payoff agreed — settlement was clean despite the dispute.') +
            ' Chain type: <strong>' + escapeHtml(rec.chain_type) + '</strong>' +
            (voiding ? ' (DVM voided a request on this contract).' : ' (multiple requests filed without DVM voiding).') +
            '</p>' +
            '<p>Among historical disputed contracts in the same chain type and category, ' +
            (rates.same_chain_category && rates.same_chain_category.n
                ? '<strong>' + (100*rates.same_chain_category.revision_rate).toFixed(0) + '%</strong> revised (' + rates.same_chain_category.n_revised + '/' + rates.same_chain_category.n + ').'
                : 'rates not computed (small bucket).') +
            '</p>' +
            '<p class="muted">Read: price may reflect settlement ambiguity, not only event probability. Not buy/sell guidance.</p></div>';

        var journoView =
            '<div class="aud-view"><h3>Journalist read</h3>' +
            '<p><strong>Cite-safe?</strong> ' +
            (tierLabel === 'Low' ? 'Likely yes — clean rule, source, fallback present.' :
             tierLabel === 'Caution' ? 'Cite with a settlement-risk caveat.' :
             tierLabel === 'High' ? 'Do not cite without explaining the rule and dispute history.' :
             'Test market — not a real settlement question.') +
            '</p>' +
            '<p><strong>Suggested caveat:</strong> ' +
            (rec.revised
                ? '<em>"As of {date}, this market\'s settled outcome differed from the initial proposal; readers should treat the price as conditional on the resolution mechanism."</em>'
                : '<em>"This market\'s contract has been disputed in the past; readers should be aware that the price reflects expected settlement, not unconditional event probability."</em>') +
            '</p></div>';

        var platformView =
            '<div class="aud-view"><h3>Platform / market-creator read</h3>' +
            '<p>Missing fields detected:</p>' +
            '<ul style="line-height:1.7;">' +
              (!rec.audit.named_source_present ? '<li><strong>No named external source</strong> — historically the strongest correlate of revision.</li>' : '') +
              (!rec.audit.fallback_present ? '<li>No fallback / contingency language.</li>' : '') +
              (!rec.audit.edge_cases_present ? '<li>No edge-case language (cancellation, postponement, ties).</li>' : '') +
              (!rec.audit.rule_text_present ? '<li>No recoverable rule text at all.</li>' : '') +
            '</ul>' +
            '<p>Compare against <a href="blueprints.html">Blueprints</a> (event / source / fallback / edge cases / time zone / settlement timing / invalid). Each missing field maps to a blueprint section.</p></div>';

        // Research view = the existing summary + episodes + texts + audit (already structured, deterministic)
        var researchView = '<div class="aud-view">' + summary + ratesHtml + episodesHtml + textsHtml + auditHtml + '</div>';

        var tabsHtml = '<div class="aud-tabs">' +
            '<button class="aud-tab-btn active" data-tab="trader">Trader</button>' +
            '<button class="aud-tab-btn" data-tab="journalist">Journalist</button>' +
            '<button class="aud-tab-btn" data-tab="platform">Platform</button>' +
            '<button class="aud-tab-btn" data-tab="research">Research</button>' +
            '</div>';

        document.getElementById('contract-body').innerHTML =
            tabsHtml +
            '<div id="aud-trader" class="aud-panel">' + traderView + '</div>' +
            '<div id="aud-journalist" class="aud-panel" style="display:none;">' + journoView + '</div>' +
            '<div id="aud-platform" class="aud-panel" style="display:none;">' + platformView + '</div>' +
            '<div id="aud-research" class="aud-panel" style="display:none;">' + researchView + '</div>' +
            actionsHtml;

        // Tab switcher
        document.querySelectorAll('.aud-tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.aud-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                ['trader','journalist','platform','research'].forEach(function(t) {
                    document.getElementById('aud-' + t).style.display = (t === btn.dataset.tab) ? '' : 'none';
                });
            });
        });

        // Wire copy buttons
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
