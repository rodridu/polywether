// Settlement Explorer — Contract Explorer table
// Loads disputed_contracts.json, renders filterable / searchable table.

(function() {
    var ROWS_PER_PAGE = 50;
    var allRows = [];
    var filtered = [];
    var page = 0;

    var filters = { revised: 'all', chain: 'all', mismatch: 'all', hasq: 'all', search: '' };

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

    function renderRow(r) {
        var qHtml = r.question_text
            ? escapeHtml(r.question_text)
            : '<span class="muted-italic">[question text missing]</span>';
        var revisedChip = r.revised ? chip('yes', 'chip chip-warn') : chip('no', 'chip chip-ok');
        var chainChip = r.chain_type === 'Request-voiding chain'
            ? chip('voiding', 'chip chip-warn')
            : (r.chain_type === 'Repeated adapter-routed request' ? chip('repeated', 'chip chip-info') : chip(r.chain_type, 'chip'));
        var mmChip = r.candidate_mismatch ? chip('candidate', 'chip chip-warn') : '<span class="muted">—</span>';
        return '<tr class="exp-row" data-id="' + r.id + '">' +
            '<td class="exp-col-id mono">' + r.id + '</td>' +
            '<td class="exp-col-q">' + qHtml + '</td>' +
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
            if (filters.revised === 'true' && !r.revised) return false;
            if (filters.revised === 'false' && r.revised) return false;
            if (filters.chain !== 'all' && r.chain_type !== filters.chain) return false;
            if (filters.mismatch === 'candidate' && !r.candidate_mismatch) return false;
            if (filters.hasq === 'true' && !r.question_text) return false;
            if (filters.hasq === 'false' && r.question_text) return false;
            if (s) {
                var hay = ((r.question_text || '') + ' ' + (r.category || '') + ' ' + r.id).toLowerCase();
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

        var meta = document.getElementById('explorer-meta');
        meta.textContent = filtered.length + ' contracts match (showing ' +
            Math.min(filtered.length, page * ROWS_PER_PAGE + 1) + '–' +
            Math.min(filtered.length, (page + 1) * ROWS_PER_PAGE) + ')';

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

    function wireFilters() {
        document.querySelectorAll('.explorer-chip').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var f = btn.dataset.filter;
                document.querySelectorAll('.explorer-chip[data-filter="' + f + '"]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                filters[f] = btn.dataset.value;
                applyFilters();
            });
        });
        // default: "All" buttons active
        document.querySelectorAll('.explorer-chip[data-value="all"]').forEach(function(b) { b.classList.add('active'); });

        var searchEl = document.getElementById('search');
        var debounce;
        searchEl.addEventListener('input', function() {
            clearTimeout(debounce);
            debounce = setTimeout(function() {
                filters.search = searchEl.value;
                applyFilters();
            }, 200);
        });
    }

    fetch('data/disputed_contracts.json').then(r => r.json()).then(d => {
        allRows = d.rows;
        wireFilters();
        applyFilters();
    }).catch(function(err) {
        console.error('disputed_contracts.json load failed:', err);
        document.getElementById('explorer-tbody').innerHTML =
            '<tr><td colspan="8" style="color: #ef4444; padding: 24px; text-align: center;">' +
            'Could not load disputed_contracts.json. Serve over http:// (not file://).</td></tr>';
    });
})();
