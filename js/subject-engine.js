/* Quant Mock Tracker — isolated multi-subject IndexedDB engine */
(function (global) {
  'use strict';

  const SUBJECTS = Object.freeze(['Maths', 'English', 'GK-GS', 'Reasoning', 'Full Mock']);
  const DB_PREFIX = 'qmt_';
  const DB_SUFFIX = '_DB';
  const DB_VERSION = 2;
  const DB_NAMES = Object.freeze({
    Maths: 'qmt_Maths_DB',
    English: 'qmt_English_DB',
    'GK-GS': 'qmt_GK-GS_DB',
    Reasoning: 'qmt_Reasoning_DB',
    'Full Mock': 'qmt_FullMock_DB'
  });
  const STORES = ['questions', 'vocab', 'attempts', 'mocks', 'assets', 'meta'];
  const SUBJECT_KEY = 'qmt_current_subject_v1';
  const LEGACY_DB = 'quantTrackerDB';
  const LEGACY_STORE = 'kv';
  const LEGACY_KEY = 'quantTracker';

  let activeSubject = readSubject();
  let connection = null;
  let connectionSubject = '';
  let operation = Promise.resolve();
  let hooks = {};
  let selectorBound = false;
  let memory = Object.create(null);
  let persistent = Boolean(global.indexedDB);

  function storageGet(key) {
    try { return global.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storageSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (error) {}
  }

  function storageRemove(key) {
    try { global.localStorage.removeItem(key); } catch (error) {}
  }

  function readSubject() {
    const saved = storageGet(SUBJECT_KEY);
    return SUBJECTS.includes(saved) ? saved : SUBJECTS[0];
  }

  function subjectSlug(subject) {
    return String(subject || activeSubject).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
  }

  function databaseName(subject) {
    return DB_NAMES[subject] || (DB_PREFIX + subject + DB_SUFFIX);
  }

  function subjectIcon(subject) {
    return ({
      Maths: '🧮',
      English: '📖',
      'GK-GS': '🌐',
      Reasoning: '🧠',
      'Full Mock': '🎯'
    })[subject] || '📚';
  }

  function subjectDescriptor(subject) {
    return subject + ' practice';
  }

  function currentState() {
    if (hooks.getState) return hooks.getState();
    try { return global.QMT && global.QMT.getState ? global.QMT.getState() : null; } catch (error) { return null; }
  }

  function enqueue(task) {
    const result = operation.then(task, task);
    operation = result.catch(() => undefined);
    return result;
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }

  function makeStore(db, name, options) {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, options);
  }

  function openDatabase(subject) {
    const name = databaseName(subject);
    if (connection && connectionSubject === subject) return Promise.resolve(connection);
    closeDatabase();
    if (!persistent || !global.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable in this browser'));

    return new Promise((resolve, reject) => {
      let request;
      try { request = global.indexedDB.open(name, DB_VERSION); } catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        makeStore(db, 'questions', { keyPath: 'id' });
        makeStore(db, 'vocab', { keyPath: 'id' });
        makeStore(db, 'attempts', { keyPath: 'id' });
        makeStore(db, 'mocks', { keyPath: 'id' });
        makeStore(db, 'assets', { keyPath: 'id' });
        makeStore(db, 'meta', { keyPath: 'key' });
      };
      request.onsuccess = () => {
        connection = request.result;
        connectionSubject = subject;
        connection.onversionchange = () => closeDatabase();
        connection.onclose = () => {
          connection = null;
          connectionSubject = '';
        };
        resolve(connection);
      };
      request.onerror = () => { persistent = false; reject(request.error || new Error('Unable to open ' + name)); };
      request.onblocked = () => reject(new Error(name + ' is blocked by another tab'));
    });
  }

  function closeDatabase() {
    if (connection) {
      try { connection.close(); } catch (error) {}
    }
    connection = null;
    connectionSubject = '';
  }

  function readAll(store) {
    if (typeof store.getAll === 'function') return requestPromise(store.getAll());
    return new Promise((resolve, reject) => {
      const rows = [];
      const request = store.openCursor();
      request.onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) { rows.push(cursor.value); cursor.continue(); }
        else resolve(rows);
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB cursor failed'));
    });
  }

  function readSubjectRecords(subject) {
    if (!persistent || !global.indexedDB) {
      return Promise.resolve(memory[subject] ? memory[subject] : null);
    }
    return openDatabase(subject).then(db => new Promise((resolve, reject) => {
      let transaction;
      try { transaction = db.transaction(STORES, 'readonly'); } catch (error) { reject(error); return; }
      const metaRequest = transaction.objectStore('meta').get('state');
      Promise.all([
        requestPromise(metaRequest),
        readAll(transaction.objectStore('questions')),
        readAll(transaction.objectStore('vocab')),
        readAll(transaction.objectStore('attempts')),
        readAll(transaction.objectStore('mocks')),
        readAll(transaction.objectStore('assets'))
      ]).then(([meta, questions, vocab, attempts, mocks, assets]) => {
        const metadata = meta && meta.state && typeof meta.state === 'object' ? meta.state : null;
        const hasRows = Boolean(meta || questions.length || vocab.length || attempts.length || mocks.length || assets.length);
        if (!hasRows) { resolve(null); return; }
        resolve(Object.assign({}, metadata || {}, {
          questions,
          vocab,
          mockAttempts: attempts,
          mocks,
          assets
        }));
      }).catch(reject);
    }));
  }

  function legacyRead() {
    const fromLocalStorage = () => {
      const raw = storageGet(LEGACY_KEY);
      if (raw) {
        try { return JSON.parse(raw); } catch (error) {}
      }
      const mirror = storageGet('quantTracker_mirror');
      if (mirror) {
        try {
          const parsed = JSON.parse(mirror);
          return parsed && parsed.d ? parsed.d : null;
        } catch (error) {}
      }
      return null;
    };
    if (!global.indexedDB) return Promise.resolve(fromLocalStorage());
    return new Promise(resolve => {
      let request;
      try { request = global.indexedDB.open(LEGACY_DB, 1); } catch (error) { resolve(fromLocalStorage()); return; }
      request.onsuccess = () => {
        const db = request.result;
        try {
          const get = db.transaction(LEGACY_STORE, 'readonly').objectStore(LEGACY_STORE).get(LEGACY_KEY);
          get.onsuccess = () => {
            try { resolve(get.result ? JSON.parse(get.result) : fromLocalStorage()); }
            catch (error) { resolve(fromLocalStorage()); }
            finally { try { db.close(); } catch (closeError) {} }
          };
          get.onerror = () => { try { db.close(); } catch (closeError) {} ; resolve(fromLocalStorage()); };
        } catch (error) { resolve(fromLocalStorage()); }
        db.onversionchange = () => { try { db.close(); } catch (closeError) {} };
      };
      request.onerror = () => resolve(fromLocalStorage());
      request.onblocked = () => resolve(fromLocalStorage());
    });
  }

  function stateMetadata(state) {
    const metadata = {};
    Object.keys(state || {}).forEach(key => {
      if (key !== 'questions' && key !== 'vocab' && key !== 'mockAttempts' && key !== 'mocks' && key !== 'assets' && key !== 'images') {
        metadata[key] = state[key];
      }
    });
    return metadata;
  }

  function withKey(record, fallback) {
    if (record === undefined || record === null) return null;
    // Keep Blob/File/ArrayBuffer payloads as structured-clone values. A plain
    // Object.assign on a Blob would silently discard the binary bytes.
    if (typeof global.Blob !== 'undefined' && record instanceof global.Blob) {
      return { id: fallback, blob: record, size: record.size, type: record.type || '' };
    }
    if (typeof global.ArrayBuffer !== 'undefined' && record instanceof global.ArrayBuffer) {
      return { id: fallback, buffer: record, size: record.byteLength };
    }
    if (typeof record !== 'object') return { id: fallback, value: record };
    const copy = Array.isArray(record) ? record.slice() : Object.assign({}, record);
    if (copy.id === undefined || copy.id === null || copy.id === '') copy.id = fallback;
    return copy;
  }

  function writeSubjectRecords(subject, state) {
    const safeState = state && typeof state === 'object' ? state : {};
    if (!persistent || !global.indexedDB) {
      memory[subject] = safeState;
      return Promise.resolve(true);
    }
    return openDatabase(subject).then(db => new Promise(resolve => {
      let transaction;
      try { transaction = db.transaction(STORES, 'readwrite'); } catch (error) { resolve(false); return; }
      const questions = transaction.objectStore('questions');
      const vocab = transaction.objectStore('vocab');
      const attempts = transaction.objectStore('attempts');
      const mocks = transaction.objectStore('mocks');
      const assets = transaction.objectStore('assets');
      const meta = transaction.objectStore('meta');
      [questions, vocab, attempts, mocks, assets].forEach(store => store.clear());
      const putRows = (store, rows, prefix) => {
        const used = new Set();
        (Array.isArray(rows) ? rows : []).forEach((row, index) => {
          const item = withKey(row, prefix + '_' + index);
          if (!item) return;
          let key = String(item.id);
          if (used.has(key)) {
            item.id = prefix + '_' + index + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            key = String(item.id);
          }
          used.add(key);
          store.put(item);
        });
      };
      putRows(questions, safeState.questions, 'question');
      putRows(vocab, safeState.vocab, 'vocab');
      putRows(attempts, safeState.mockAttempts, 'attempt');
      putRows(mocks, safeState.mocks, 'mock');
      const assetRows = Array.isArray(safeState.assets) ? safeState.assets : (Array.isArray(safeState.images) ? safeState.images : []);
      putRows(assets, assetRows, 'asset');
      meta.put({ key: 'state', state: stateMetadata(safeState), savedAt: Date.now() });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    }));
  }

  function isEmptySubjectData(data) {
    return !data || (!Array.isArray(data.questions) && !Array.isArray(data.mocks) && !Array.isArray(data.mockAttempts));
  }

  function loadSubject(subject) {
    return readSubjectRecords(subject).then(data => {
      // Data created by the original single-database build is treated as Maths
      // exactly once, so an existing tracker is not lost during the upgrade.
      if (subject === SUBJECTS[0] && isEmptySubjectData(data)) {
        return legacyRead().then(legacy => {
          if (!legacy || typeof legacy !== 'object') return null;
          return writeSubjectRecords(subject, legacy).then(success => {
            if (success) {
              storageRemove(LEGACY_KEY);
              storageRemove('quantTracker_mirror');
            }
            return legacy;
          });
        });
      }
      return data;
    });
  }

  function setSubjectUi(subject, busy) {
    const selector = global.document && global.document.getElementById('subjectSelect');
    if (selector) {
      selector.value = subject;
      selector.disabled = Boolean(busy);
      selector.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (global.document && global.document.body) {
      global.document.body.classList.toggle('subject-switching', Boolean(busy));
      if (global.document.body.dataset) global.document.body.dataset.subject = subject;
    }
  }

  function announce(subject, previous) {
    if (global.document) {
      global.document.dispatchEvent(new CustomEvent('qmt-subject-change', {
        detail: { subject, previous, database: databaseName(subject) }
      }));
    }
  }

  function loadActive() {
    return enqueue(() => loadSubject(activeSubject).then(data => {
      setSubjectUi(activeSubject, false);
      return data;
    }).catch(error => {
      setSubjectUi(activeSubject, false);
      memory[activeSubject] = memory[activeSubject] || null;
      if (global.console) console.warn('Subject storage unavailable:', error);
      return memory[activeSubject];
    }));
  }

  function saveState(state) {
    return enqueue(() => writeSubjectRecords(activeSubject, state).then(success => {
      if (!success && global.console) global.console.warn('Subject IndexedDB write failed');
      return success;
    }).catch(error => {
      if (global.console) global.console.warn('Subject data save failed:', error);
      memory[activeSubject] = state;
      return false;
    }));
  }

  function clearActive() {
    return enqueue(() => {
      if (!persistent || !global.indexedDB) { delete memory[activeSubject]; return true; }
      return openDatabase(activeSubject).then(db => new Promise(resolve => {
        let transaction;
        try { transaction = db.transaction(STORES, 'readwrite'); } catch (error) { resolve(false); return; }
        STORES.forEach(name => transaction.objectStore(name).clear());
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = transaction.onabort = () => resolve(false);
      }));
    });
  }

  function switchTo(subject) {
    const next = SUBJECTS.includes(subject) ? subject : SUBJECTS[0];
    if (next === activeSubject) {
      setSubjectUi(activeSubject, false);
      return Promise.resolve(false);
    }
    const previous = activeSubject;
    if (typeof global.flushSaveNow === 'function') global.flushSaveNow();
    setSubjectUi(next, true);
    return enqueue(() => {
      const oldState = currentState();
      return writeSubjectRecords(previous, oldState).catch(() => false).then(() => {
        closeDatabase();
        activeSubject = next;
        storageSet(SUBJECT_KEY, activeSubject);
        return loadSubject(activeSubject);
      }).then(data => {
        setSubjectUi(activeSubject, false);
        if (hooks.setState) hooks.setState(data, true);
        if (hooks.refresh) hooks.refresh(activeSubject, previous);
        announce(activeSubject, previous);
        if (typeof global.showToast === 'function') global.showToast('✅ ' + activeSubject + ' workspace loaded');
        return true;
      }).catch(error => {
        activeSubject = previous;
        storageSet(SUBJECT_KEY, activeSubject);
        setSubjectUi(previous, false);
        if (global.console) global.console.error('Subject switch failed:', error);
        if (global.showToast) global.showToast('⚠️ ' + next + ' database load nahi hua');
        return false;
      });
    });
  }

  function configure(options) {
    hooks = Object.assign({}, hooks, options || {});
    setSubjectUi(activeSubject, false);
  }

  function applySubjectLabels(root) {
    if (!global.document) return;
    const scope = root && root.querySelectorAll ? root : global.document;
    scope.querySelectorAll('[data-subject-template]').forEach(element => {
      const template = element.getAttribute('data-subject-template') || '';
      element.innerHTML = template
        .replace(/\{\{subject\}\}/g, activeSubject)
        .replace(/\{\{subjectIcon\}\}/g, subjectIcon(activeSubject))
        .replace(/\{\{subjectDescriptor\}\}/g, subjectDescriptor(activeSubject));
    });
    scope.querySelectorAll('[data-subject-placeholder]').forEach(element => {
      const template = element.getAttribute('data-subject-placeholder') || '';
      element.setAttribute('placeholder', template
        .replace(/\{\{subject\}\}/g, activeSubject)
        .replace(/\{\{subjectDescriptor\}\}/g, subjectDescriptor(activeSubject)));
    });
    const title = global.document.querySelector('title[data-subject-template]');
    if (title) title.textContent = (title.getAttribute('data-subject-template') || '').replace(/\{\{subject\}\}/g, activeSubject);
    const description = global.document.querySelector('meta[name="description"][data-subject-template]');
    if (description) description.setAttribute('content', (description.getAttribute('data-subject-template') || '').replace(/\{\{subject\}\}/g, activeSubject));
  }

  function bindSelector() {
    if (selectorBound || !global.document) return;
    const selector = global.document.getElementById('subjectSelect');
    if (!selector) return;
    selectorBound = true;
    setSubjectUi(activeSubject, false);
    selector.addEventListener('change', event => {
      if (typeof global.flushSaveNow === 'function') global.flushSaveNow();
      switchTo(event.target.value);
    });
    applySubjectLabels();
  }

  global.qmtSubjectName = () => activeSubject;
  global.qmtSubjectIcon = () => subjectIcon(activeSubject);
  global.qmtSubjectSlug = () => subjectSlug(activeSubject);
  global.qmtSubjectDescriptor = () => subjectDescriptor(activeSubject);
  global.qmtApplySubjectLabels = applySubjectLabels;
  global.handleSubjectChange = value => switchTo(value);
  global.QMTSubjects = {
    subjects: SUBJECTS.slice(),
    getCurrent: () => activeSubject,
    getDatabaseName: () => databaseName(activeSubject),
    getDatabaseNameFor: databaseName,
    getSubjectSlug: subjectSlug,
    isPersistent: () => persistent,
    getStorageMode: () => persistent ? 'idb' : 'memory',
    configure,
    loadActive,
    saveState,
    clearActive,
    close: closeDatabase,
    switchTo,
    applyLabels: applySubjectLabels
  };

  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', bindSelector);
    else bindSelector();
  }
  global.addEventListener('storage', event => {
    if (event.key === SUBJECT_KEY && SUBJECTS.includes(event.newValue) && event.newValue !== activeSubject) switchTo(event.newValue);
  });
})(window);
