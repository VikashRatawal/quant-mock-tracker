/* Quant Mock Tracker — Today Focus, command palette, shortcuts, PWA, offline */
(function () {
  'use strict';

  const GOAL_KEY = 'qmt_daily_goal_v1';
  const FOCUS_DONE_KEY = 'qmt_focus_done_v1';

  function subjectSlug() {
    return (window.QMTSubjects && typeof window.QMTSubjects.getSubjectSlug === 'function')
      ? window.QMTSubjects.getSubjectSlug() : 'maths';
  }
  function subjectKey(base) { return base + '_' + subjectSlug(); }
  function loadSubjectJSON(base, fallback) {
    const scoped = subjectKey(base);
    const value = loadJSON(scoped, null);
    if (value !== null) return value;
    if (subjectName() === 'Maths') {
      const legacy = loadJSON(base, null);
      if (legacy !== null) { saveJSON(scoped, legacy); return legacy; }
    }
    return fallback;
  }
  function subjectName() {
    return typeof window.qmtSubjectName === 'function' ? window.qmtSubjectName() : 'Maths';
  }
  const TABS = [
    { id: 'home', icon: '🏠', label: 'Home' },
    { id: 'entry', icon: '📝', label: 'Entry / Import' },
    { id: 'analytics', icon: '📈', label: 'Analytics' },
    { id: 'revision', icon: '📚', label: 'Revision' },
    { id: 'chat', icon: '💬', label: 'AI Chat' },
    { id: 'mocks', icon: '🎯', label: 'Play Mocks' },
    { id: 'pattern', icon: '📊', label: 'Season Pattern' },
    { id: 'data', icon: '💾', label: 'Data / Backup' },
    { id: 'settings', icon: '⚙️', label: 'Settings' }
  ];

  function state() {
    return (window.QMT && window.QMT.getState && window.QMT.getState()) || window.S || { mocks: [], questions: [], setup: {} };
  }

  function toast(msg) {
    if (typeof window.showToast === 'function') window.showToast(msg);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function loadJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {}
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Raat ho gayi';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  function num(value) {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
  }

  function mockScore(mock) {
    const score = num(mock.score);
    const totalQ = num(mock.totalQ) || (mock.questions || []).length || 25;
    const marks = num(mock.setup && mock.setup.marksCorrect) || 2;
    const max = totalQ * marks;
    return { score, max, pct: max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0 };
  }

  function sortedMocks() {
    return [...(state().mocks || [])].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  function weakChapters(limit) {
    const buckets = {};
    (state().mocks || []).forEach(mock => {
      (mock.questions || []).forEach(q => {
        const key = q.chapter || q.topic || q.category || 'Other';
        const item = buckets[key] || (buckets[key] = { name: key, total: 0, correct: 0, wrong: 0 });
        item.total += 1;
        if (q.status === 'Correct') item.correct += 1;
        if (q.status === 'Incorrect') item.wrong += 1;
      });
    });
    return Object.values(buckets)
      .filter(item => item.total >= 3 && item.correct + item.wrong > 0)
      .map(item => Object.assign(item, {
        accuracy: Math.round((item.correct / (item.correct + item.wrong)) * 100)
      }))
      .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
      .slice(0, limit || 5);
  }

  function dueQuestions(limit) {
    const done = loadSubjectJSON(FOCUS_DONE_KEY, { date: todayKey(), ids: [] });
    if (done.date !== todayKey()) { done.date = todayKey(); done.ids = []; }
    const items = [];
    const seen = new Set();
    sortedMocks().forEach(mock => {
      (mock.questions || []).forEach(q => {
        const overtime = num(q.timeTaken) > num(q.avgTime) && num(q.avgTime) > 0;
        if (q.status !== 'Incorrect' && !overtime) return;
        const id = String(mock.id) + ':' + String(q.qNo || q.no || '');
        if (seen.has(id)) return;
        seen.add(id);
        items.push({
          id,
          mockId: mock.id,
          mockName: mock.name || 'Mock',
          date: mock.date,
          qNo: q.qNo || q.no,
          topic: q.topic || q.chapter || q.category || subjectName(),
          status: q.status,
          overtime,
          done: done.ids.indexOf(id) >= 0
        });
      });
    });
    items.sort((a, b) => Number(a.done) - Number(b.done) || new Date(b.date || 0) - new Date(a.date || 0));
    return { items: items.slice(0, limit || 8), done, total: items.length };
  }

  function goalState() {
    const goal = loadSubjectJSON(GOAL_KEY, { date: todayKey(), target: 8, done: 0 });
    if (goal.date !== todayKey()) {
      goal.date = todayKey();
      goal.done = 0;
      saveJSON(subjectKey(GOAL_KEY), goal);
    }
    return goal;
  }

  function sparkline(values) {
    if (!values.length) return '';
    const w = 220, h = 46, pad = 3;
    const min = Math.min.apply(null, values.concat([0]));
    const max = Math.max.apply(null, values.concat([1]));
    const span = max - min || 1;
    const pts = values.map((v, i) => {
      const x = pad + (i / Math.max(1, values.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / span) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    const last = values[values.length - 1];
    const first = values[0];
    const up = last >= first;
    const color = up ? '#10b981' : '#ef4444';
    return '<svg class="hf-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(' ') + '"></polyline>' +
      '</svg>';
  }

  function renderHomeFocus() {
    const root = document.getElementById('homeFocus');
    if (!root) return;
    const mocks = sortedMocks();
    const goal = goalState();
    const due = dueQuestions(8);
    const weak = weakChapters(5);
    const last = mocks[0];
    const prev = mocks[1];
    const trend = mocks.slice(0, 8).reverse().map(m => mockScore(m).score);
    const lastScore = last ? mockScore(last) : null;
    const prevScore = prev ? mockScore(prev) : null;
    const delta = lastScore && prevScore ? lastScore.score - prevScore.score : null;
    const remaining = Math.max(0, goal.target - goal.done);
    const pct = Math.min(100, Math.round((goal.done / Math.max(1, goal.target)) * 100));

    if (!mocks.length) {
      root.innerHTML =
        '<div class="hf-empty card">' +
          '<div class="card-body">' +
            '<div class="hf-hello">' + greeting() + ' 👋</div>' +
            '<h2>Aaj pehla mock import karke shuru karo</h2>' +
            '<p>PDF/text paste karo, analysis aur revision automatically ban jayega.</p>' +
            '<div class="hf-actions">' +
              '<button type="button" class="hf-btn primary" data-hf="import">📝 Import mock</button>' +
              '<button type="button" class="hf-btn" data-hf="play">🎯 Mock zone</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      bindHomeFocus(root);
      return;
    }

    root.innerHTML =
      '<div class="hf-hero card">' +
        '<div class="card-body">' +
          '<div class="hf-hello">' + greeting() + ' 👋</div>' +
          '<div class="hf-title-row">' +
            '<h2>Aaj ka focus</h2>' +
            '<span class="hf-pill">' + remaining + ' left</span>' +
          '</div>' +
          '<p class="hf-sub">' + goal.target + ' galat / overtime sawal revise karo — consistency se cutoff cross hota hai.</p>' +
          '<div class="hf-goal">' +
            '<div class="hf-goal-top"><span>Daily revision</span><b>' + goal.done + ' / ' + goal.target + '</b></div>' +
            '<div class="hf-goal-track"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
          '<div class="hf-actions">' +
            '<button type="button" class="hf-btn primary" data-hf="wrongs">❌ Revise wrongs</button>' +
            '<button type="button" class="hf-btn" data-hf="play-last">▶ Last mock</button>' +
            '<button type="button" class="hf-btn" data-hf="import">📝 Import</button>' +
            '<button type="button" class="hf-btn" data-hf="analytics">📈 Stats</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="hf-grid">' +
        '<div class="card hf-panel">' +
          '<div class="card-body">' +
            '<div class="sect-title">📉 Score trend</div>' +
            (trend.length > 1 ? sparkline(trend) : '<div class="hf-muted">Ek aur mock ke baad trend dikhega</div>') +
            '<div class="hf-compare">' +
              (lastScore ? '<div><small>Latest</small><b>' + lastScore.score.toFixed(1) + '</b></div>' : '') +
              (prevScore ? '<div><small>Previous</small><b>' + prevScore.score.toFixed(1) + '</b></div>' : '') +
              (delta != null ? '<div><small>Change</small><b class="' + (delta >= 0 ? 'up' : 'down') + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '</b></div>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card hf-panel">' +
          '<div class="card-body">' +
            '<div class="sect-title">🎯 Weak chapters</div>' +
            (weak.length ? '<div class="hf-list">' + weak.map(item =>
              '<button type="button" class="hf-row" data-hf-chapter="' + esc(item.name) + '">' +
                '<span>' + esc(item.name) + '<small>' + item.wrong + ' wrong · ' + item.total + ' Qs</small></span>' +
                '<b class="' + (item.accuracy < 50 ? 'down' : '') + '">' + item.accuracy + '%</b>' +
              '</button>'
            ).join('') + '</div>' : '<div class="hf-muted">Topic accuracy ke liye 3+ questions chahiye</div>') +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="card hf-panel">' +
        '<div class="card-body">' +
          '<div class="sect-title">📌 Due today <span class="hf-count">' + due.total + '</span></div>' +
          (due.items.length ? '<div class="hf-list">' + due.items.map(item =>
            '<button type="button" class="hf-row' + (item.done ? ' done' : '') + '" data-hf-due="' + esc(item.id) + '" data-mock="' + esc(item.mockId) + '">' +
              '<span>Q' + esc(item.qNo) + ' · ' + esc(item.topic) +
                '<small>' + esc(item.mockName) + ' · ' + (item.status === 'Incorrect' ? 'Incorrect' : 'Overtime') + '</small></span>' +
              '<b>' + (item.done ? '✓' : '→') + '</b>' +
            '</button>'
          ).join('') + '</div>' : '<div class="hf-muted">Koi pending wrong/overtime sawal nahi 🎉</div>') +
        '</div>' +
      '</div>';

    bindHomeFocus(root);
  }

  function openMock(id, tab) {
    const mock = (state().mocks || []).find(m => String(m.id) === String(id));
    if (!mock) return toast('⚠️ Mock nahi mila');
    if (typeof loadMock === 'function') {
      const setup = mock.setup || {};
      state().setup = Object.assign({}, setup, { subject: subjectName() });
      state().questions = [...(mock.questions || [])];
      if (typeof saveToStorage === 'function') saveToStorage();
      if (typeof renderProgress === 'function') renderProgress();
      if (typeof renderTable === 'function') renderTable();
    }
    if (typeof switchTab === 'function') switchTab(tab || 'revision');
  }

  function bindHomeFocus(root) {
    root.onclick = function (event) {
      const btn = event.target.closest('[data-hf],[data-hf-due],[data-hf-chapter]');
      if (!btn) return;
      if (btn.dataset.hf === 'import') {
        if (typeof switchTab === 'function') switchTab('entry');
        return;
      }
      if (btn.dataset.hf === 'play' || btn.dataset.hf === 'play-last') {
        if (typeof switchTab === 'function') switchTab('mocks');
        return;
      }
      if (btn.dataset.hf === 'analytics') {
        if (typeof switchTab === 'function') switchTab('analytics');
        return;
      }
      if (btn.dataset.hf === 'wrongs') {
        if (typeof switchTab === 'function') switchTab('revision');
        setTimeout(function () {
          if (typeof rvSetStatus === 'function') rvSetStatus('incorrect');
        }, 60);
        return;
      }
      if (btn.dataset.hfDue) {
        const done = loadSubjectJSON(FOCUS_DONE_KEY, { date: todayKey(), ids: [] });
        if (done.date !== todayKey()) { done.date = todayKey(); done.ids = []; }
        if (done.ids.indexOf(btn.dataset.hfDue) < 0) {
          done.ids.push(btn.dataset.hfDue);
          saveJSON(subjectKey(FOCUS_DONE_KEY), done);
          const goal = goalState();
          goal.done = Math.min(goal.target, goal.done + 1);
          saveJSON(subjectKey(GOAL_KEY), goal);
        }
        openMock(btn.dataset.mock, 'revision');
        renderHomeFocus();
        return;
      }
      if (btn.dataset.hfChapter) {
        if (typeof switchTab === 'function') switchTab('revision');
        setTimeout(function () {
          const sel = document.getElementById('rv2chapterFilter');
          const search = document.getElementById('rv2searchInput');
          if (search) {
            search.value = btn.dataset.hfChapter;
            if (typeof rvFilterQuestions === 'function') rvFilterQuestions();
          } else if (sel) {
            sel.value = btn.dataset.hfChapter;
            if (typeof rvFilterQuestions === 'function') rvFilterQuestions();
          }
        }, 80);
      }
    };
  }

  function commandItems() {
    const items = TABS.map(tab => ({
      id: 'tab-' + tab.id,
      icon: tab.icon,
      title: tab.label,
      hint: 'Tab',
      run: function () { if (typeof switchTab === 'function') switchTab(tab.id); }
    }));
    items.push(
      { id: 'act-dark', icon: '🌓', title: 'Toggle dark mode', hint: 'Action', run: function () { if (typeof toggleDark === 'function') toggleDark(); } },
      { id: 'act-import', icon: '📝', title: 'Import a mock', hint: 'Action', run: function () { if (typeof switchTab === 'function') switchTab('entry'); } },
      { id: 'act-export', icon: '📤', title: 'Export JSON backup', hint: 'Action', run: function () { if (typeof exportJSON === 'function') exportJSON(); } },
      { id: 'act-play', icon: '🎯', title: 'Open mock zone', hint: 'Action', run: function () { if (typeof switchTab === 'function') switchTab('mocks'); } }
    );
    sortedMocks().slice(0, 20).forEach(mock => {
      items.push({
        id: 'mock-' + mock.id,
        icon: '📚',
        title: mock.name || 'Untitled mock',
        hint: (mock.examName || 'Mock') + ' · ' + (mock.date || ''),
        run: function () { openMock(mock.id, 'revision'); }
      });
    });
    return items;
  }

  function renderCommandList(query) {
    const box = document.getElementById('cmdkList');
    if (!box) return;
    const q = String(query || '').trim().toLowerCase();
    const words = q ? q.split(/\s+/).filter(Boolean) : [];
    const items = commandItems().filter(item => {
      if (!words.length) return true;
      const blob = (item.title + ' ' + item.hint).toLowerCase();
      return words.every(word => blob.indexOf(word) >= 0);
    }).slice(0, 12);
    box.innerHTML = items.length ? items.map((item, index) =>
      '<button type="button" class="cmdk-item' + (index === 0 ? ' on' : '') + '" data-cmd="' + esc(item.id) + '">' +
        '<span class="cmdk-ic">' + item.icon + '</span>' +
        '<span class="cmdk-txt"><b>' + esc(item.title) + '</b><small>' + esc(item.hint) + '</small></span>' +
      '</button>'
    ).join('') : '<div class="cmdk-empty">Kuch nahi mila</div>';
    box._items = items;
  }

  function openCommand() {
    const modal = document.getElementById('cmdk');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const input = document.getElementById('cmdkInput');
    renderCommandList('');
    if (input) {
      input.value = '';
      setTimeout(function () { input.focus(); }, 20);
    }
  }

  function closeCommand() {
    const modal = document.getElementById('cmdk');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function runSelectedCommand() {
    const box = document.getElementById('cmdkList');
    const on = box && box.querySelector('.cmdk-item.on');
    const items = (box && box._items) || [];
    const item = items.find(x => on && x.id === on.dataset.cmd) || items[0];
    if (!item) return;
    closeCommand();
    item.run();
  }

  function moveCommand(delta) {
    const items = Array.from(document.querySelectorAll('#cmdkList .cmdk-item'));
    if (!items.length) return;
    let index = items.findIndex(el => el.classList.contains('on'));
    items.forEach(el => el.classList.remove('on'));
    index = (index + delta + items.length) % items.length;
    items[index].classList.add('on');
    items[index].scrollIntoView({ block: 'nearest' });
  }

  function bindCommandPalette() {
    const modal = document.getElementById('cmdk');
    const input = document.getElementById('cmdkInput');
    const list = document.getElementById('cmdkList');
    if (!modal) return;
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeCommand();
    });
    if (input) input.addEventListener('input', function () { renderCommandList(input.value); });
    if (list) list.addEventListener('click', function (event) {
      const btn = event.target.closest('.cmdk-item');
      if (!btn) return;
      list.querySelectorAll('.cmdk-item').forEach(el => el.classList.toggle('on', el === btn));
      runSelectedCommand();
    });
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
  }

  function bindShortcuts() {
    document.addEventListener('keydown', function (event) {
      const typing = isTypingTarget(event.target);
      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        const modal = document.getElementById('cmdk');
        if (modal && modal.classList.contains('open')) closeCommand();
        else openCommand();
        return;
      }
      if (event.key === 'Escape') {
        closeCommand();
        const help = document.getElementById('helpSheet');
        if (help) help.classList.remove('open');
        if (typeof dockSheet === 'function') dockSheet(false);
        return;
      }
      const modal = document.getElementById('cmdk');
      if (modal && modal.classList.contains('open')) {
        if (event.key === 'ArrowDown') { event.preventDefault(); moveCommand(1); }
        if (event.key === 'ArrowUp') { event.preventDefault(); moveCommand(-1); }
        if (event.key === 'Enter') { event.preventDefault(); runSelectedCommand(); }
        return;
      }
      if (typing) return;
      if (event.key === '/') {
        event.preventDefault();
        const search = document.getElementById('searchMocks');
        if (typeof switchTab === 'function') switchTab('home');
        if (search) search.focus();
        return;
      }
      if (event.key === '?' || (event.shiftKey && event.key === '/')) {
        event.preventDefault();
        const help = document.getElementById('helpSheet');
        if (help) help.classList.toggle('open');
        return;
      }
      if (/^[1-9]$/.test(event.key) && !event.altKey) {
        const tab = TABS[Number(event.key) - 1];
        if (tab && typeof switchTab === 'function') switchTab(tab.id);
      }
    });
  }

  function bindBanners() {
    let deferred = null;
    const install = document.getElementById('installBanner');
    const offline = document.getElementById('offlineBanner');
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferred = event;
      if (install && !localStorage.getItem('qmt_install_dismissed')) install.classList.add('show');
    });
    document.getElementById('installYes')?.addEventListener('click', async function () {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      install?.classList.remove('show');
    });
    document.getElementById('installNo')?.addEventListener('click', function () {
      localStorage.setItem('qmt_install_dismissed', '1');
      install?.classList.remove('show');
    });
    function syncOffline() {
      if (!offline) return;
      offline.classList.toggle('show', !navigator.onLine);
    }
    window.addEventListener('online', function () { syncOffline(); toast('🟢 Back online'); });
    window.addEventListener('offline', function () { syncOffline(); toast('📴 Offline — local data chalega'); });
    syncOffline();
  }

  function boot() {
    bindCommandPalette();
    bindShortcuts();
    bindBanners();
    renderHomeFocus();
    const orig = window.updateHomeStats;
    if (typeof orig === 'function' && !orig._qmtWrapped) {
      window.updateHomeStats = function () {
        orig.apply(this, arguments);
        renderHomeFocus();
      };
      window.updateHomeStats._qmtWrapped = true;
    }
    window.renderHomeFocus = renderHomeFocus;
    window.openCommandPalette = openCommand;
    window.addEventListener('qmt-subject-change', function () {
      renderHomeFocus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
