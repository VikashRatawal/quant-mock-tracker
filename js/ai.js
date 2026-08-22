const AI_STORAGE_KEY = 'qmt_ai_settings_v1';
const AI_LANGUAGE_KEY = 'qmt_ai_language_v1';
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_DEPRECATED = {
  'gemini-2.0-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash-001': 'gemini-3.6-flash',
  'gemini-2.0-flash-lite': 'gemini-3.6-flash',
  'gemini-2.0-flash-lite-001': 'gemini-3.6-flash'
};
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const EXTRA_PRESETS = [
  { id: 'openrouter', label: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  { id: 'groq', label: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'openai', label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'custom', label: 'Custom URL', base: '', model: '' }
];
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

function aiSubjectName() {
  return typeof window.qmtSubjectName === 'function' ? window.qmtSubjectName() : 'Maths';
}

const AI = {
  settings: loadSettings(),
  preview: [],
  busy: new Set(),
  syncedUid: '',
  syncPromise: null
};

function loadSettings() {
  const fallback = {
    provider: 'gemini',
    geminiKey: '',
    geminiModel: DEFAULT_GEMINI_MODEL,
    extraKey: '',
    extraModel: 'gpt-4o-mini',
    extraBaseUrl: 'https://api.openai.com/v1',
    language: localStorage.getItem(AI_LANGUAGE_KEY) || 'Hinglish'
  };
  let raw = {};
  try {
    raw = JSON.parse(localStorage.getItem(AI_STORAGE_KEY) || '{}');
  } catch (error) {}
  return normalizedSettings(Object.assign(fallback, raw));
}

function legacySettings() {
  try {
    return JSON.parse(localStorage.getItem(AI_STORAGE_KEY) || 'null') || {};
  } catch (error) {
    return {};
  }
}

function normalizeModel(model) {
  const m = String(model || '').trim();
  return GEMINI_DEPRECATED[m] || m;
}

function normalizedSettings(settings = {}) {
  return {
    provider: settings.provider === 'extra' ? 'extra' : 'gemini',
    geminiKey: String(settings.geminiKey || ''),
    geminiModel: normalizeModel(settings.geminiModel || DEFAULT_GEMINI_MODEL) || DEFAULT_GEMINI_MODEL,
    extraKey: String(settings.extraKey || ''),
    extraModel: String(settings.extraModel || 'gpt-4o-mini'),
    extraBaseUrl: String(settings.extraBaseUrl || 'https://api.openai.com/v1'),
    language: ['Hindi', 'English', 'Hinglish'].includes(settings.language) ? settings.language : 'Hinglish'
  };
}

function syncProviderFields() {
  const provider = document.getElementById('aiProvider');
  const geminiFields = document.getElementById('aiGeminiFields');
  const extraFields = document.getElementById('aiExtraFields');
  const isExtra = provider && provider.value === 'extra';
  if (geminiFields) geminiFields.classList.toggle('hidden', isExtra);
  if (extraFields) extraFields.classList.toggle('hidden', !isExtra);
}

function syncExtraPreset(baseUrl) {
  const preset = document.getElementById('aiExtraBasePreset');
  if (!preset) return;
  const clean = String(baseUrl || '').replace(/\/+$/, '');
  const match = EXTRA_PRESETS.find(item => item.base && clean === item.base.replace(/\/+$/, ''));
  preset.value = match ? match.id : 'custom';
}

function populateSettings() {
  const provider = document.getElementById('aiProvider');
  const geminiKey = document.getElementById('aiGeminiKey');
  const geminiModel = document.getElementById('aiGeminiModel');
  const extraKey = document.getElementById('aiExtraKey');
  const extraModel = document.getElementById('aiExtraModel');
  const extraBaseUrl = document.getElementById('aiExtraBaseUrl');
  const language = document.getElementById('aiLanguage');
  if (provider) provider.value = AI.settings.provider === 'extra' ? 'extra' : 'gemini';
  if (geminiKey) geminiKey.value = AI.settings.geminiKey || '';
  if (geminiModel) geminiModel.value = AI.settings.geminiModel || DEFAULT_GEMINI_MODEL;
  if (extraKey) extraKey.value = AI.settings.extraKey || '';
  if (extraModel) extraModel.value = AI.settings.extraModel || '';
  if (extraBaseUrl) extraBaseUrl.value = AI.settings.extraBaseUrl || '';
  syncExtraPreset(AI.settings.extraBaseUrl);
  if (language) language.value = AI.settings.language || 'Hinglish';
  syncProviderFields();
}

function firestoreToast(error) {
  console.warn('Firestore AI settings:', error);
  toast('⚠️ Firestore enable/rules check karein');
}

async function syncSettingsForUser(user) {
  const legacy = legacySettings();
  const hasLegacy = Object.keys(legacy).length > 0;
  const localCandidate = normalizedSettings(Object.assign({}, AI.settings, legacy));
  const store = window.firebaseAiSettingsStore;
  try {
    const remote = await store.load(user.uid);
    if (remote) {
      AI.settings = normalizedSettings(remote);
    } else {
      AI.settings = localCandidate;
      await store.save(user.uid, AI.settings);
    }
    localStorage.removeItem(AI_STORAGE_KEY);
    localStorage.setItem(AI_LANGUAGE_KEY, AI.settings.language);
    populateSettings();
  } catch (error) {
    AI.settings = localCandidate;
    localStorage.removeItem(AI_STORAGE_KEY);
    localStorage.setItem(AI_LANGUAGE_KEY, AI.settings.language);
    populateSettings();
    firestoreToast(error);
  }
}

function handleAuthState(user) {
  if (!user) {
    AI.syncedUid = '';
    AI.settings = normalizedSettings({ language: localStorage.getItem(AI_LANGUAGE_KEY) || AI.settings.language });
    populateSettings();
    return;
  }
  if (AI.syncedUid === user.uid || AI.syncPromise) return;
  AI.syncPromise = syncSettingsForUser(user)
    .finally(() => {
      AI.syncedUid = user.uid;
      AI.syncPromise = null;
    });
}

async function saveSettings() {
  AI.settings.provider = document.getElementById('aiProvider')?.value === 'extra' ? 'extra' : 'gemini';
  AI.settings.geminiKey = document.getElementById('aiGeminiKey')?.value.trim() || '';
  AI.settings.geminiModel = normalizeModel(document.getElementById('aiGeminiModel')?.value.trim() || DEFAULT_GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;
  AI.settings.extraKey = document.getElementById('aiExtraKey')?.value.trim() || '';
  AI.settings.extraModel = document.getElementById('aiExtraModel')?.value.trim() || '';
  AI.settings.extraBaseUrl = document.getElementById('aiExtraBaseUrl')?.value.trim().replace(/\/+$/, '') || '';
  AI.settings.language = document.getElementById('aiLanguage')?.value || 'Hinglish';
  localStorage.setItem(AI_LANGUAGE_KEY, AI.settings.language);
  localStorage.removeItem(AI_STORAGE_KEY);
  const user = window.firebaseUser;
  if (!user) {
    toast('⚠️ Sign in karke AI settings save karein');
    return;
  }
  if (!window.firebaseAiSettingsStore) {
    firestoreToast(new Error('Firestore settings store unavailable'));
    return;
  }
  try {
    await window.firebaseAiSettingsStore.save(user.uid, AI.settings);
    toast('✅ AI settings Firebase account me save ho gayi');
  } catch (error) {
    firestoreToast(error);
  }
}

function toast(message) {
  if (typeof window.showToast === 'function') window.showToast(message);
  else console.info(message);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function parseMarkdownTables(text) {
  const lines = text.split('\n');
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        if (nextLine.startsWith('|') && nextLine.endsWith('|') && /^[|\s\-:.]+$/.test(nextLine)) {
          inTable = true;
          tableHeaders = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
          i++; // Skip the separator line
          tableRows = [];
          continue;
        }
      }
      if (inTable) {
        const row = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(row);
        continue;
      }
    }

    if (inTable && !(line.startsWith('|') && line.endsWith('|'))) {
      result.push(generateHtmlTable(tableHeaders, tableRows));
      inTable = false;
    }

    result.push(lines[i]);
  }

  if (inTable) {
    result.push(generateHtmlTable(tableHeaders, tableRows));
  }

  return result.join('\n');
}

function generateHtmlTable(headers, rows) {
  let html = '<div class="twrap"><table class="dtable" style="table-layout: auto; min-width: 100%; margin: 12px 0;">';
  html += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
  html += '<tbody>' + rows.map(row => '<tr>' + row.map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('') + '</tbody>';
  html += '</table></div>';
  return html;
}

function markdown(value) {
  if (!value) return '';
  let text = esc(value);

  text = parseMarkdownTables(text);

  const lines = text.split('\n');
  let inUl = false;
  let inOl = false;
  const processedLines = [];

  for (let line of lines) {
    const trimmed = line.trim();

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      if (inUl) { processedLines.push('</ul>'); inUl = false; }
      if (inOl) { processedLines.push('</ol>'); inOl = false; }
      processedLines.push('<hr style="margin:12px 0; border:0; border-top:1px solid var(--line, #cbd5e1);">');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      if (inUl) { processedLines.push('</ul>'); inUl = false; }
      if (inOl) { processedLines.push('</ol>'); inOl = false; }
      processedLines.push(`<h3>${trimmed.slice(4)}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inUl) { processedLines.push('</ul>'); inUl = false; }
      if (inOl) { processedLines.push('</ol>'); inOl = false; }
      processedLines.push(`<h2>${trimmed.slice(3)}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      if (inUl) { processedLines.push('</ul>'); inUl = false; }
      if (inOl) { processedLines.push('</ol>'); inOl = false; }
      processedLines.push(`<h1>${trimmed.slice(2)}</h1>`);
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inOl) { processedLines.push('</ol>'); inOl = false; }
      if (!inUl) { processedLines.push('<ul>'); inUl = true; }
      processedLines.push(`<li>${ulMatch[2]}</li>`);
      continue;
    }

    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inUl) { processedLines.push('</ul>'); inUl = false; }
      if (!inOl) { processedLines.push('<ol>'); inOl = true; }
      processedLines.push(`<li>${olMatch[2]}</li>`);
      continue;
    }

    if (inUl && trimmed !== '') {
      processedLines.push('</ul>');
      inUl = false;
    }
    if (inOl && trimmed !== '') {
      processedLines.push('</ol>');
      inOl = false;
    }

    processedLines.push(line);
  }

  if (inUl) processedLines.push('</ul>');
  if (inOl) processedLines.push('</ol>');

  let html = processedLines.join('\n');

  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  if (!window.katex) {
    html = html
      .replace(/\$\$(.+?)\$\$/g, '$1')
      .replace(/\$(.+?)\$/g, '$1');
  }

  html = html
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');

  html = html
    .replace(/<(ul|ol|li|h1|h2|h3|table|thead|tbody|tr|th|td|div|hr)([^>]*)><br>/gi, '<$1$2>')
    .replace(/<\/(ul|ol|li|h1|h2|h3|table|thead|tbody|tr|th|td|div|hr)><br>/gi, '</$1>');

  return html;
}

function renderMathInElementIfPossible(element) {
  if (window.renderMathInElement && window.katex) {
    try {
      window.renderMathInElement(element, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    } catch (e) {
      console.warn('KaTeX render error:', e);
    }
  }
}

window.markdown = markdown;
window.renderMathInElementIfPossible = renderMathInElementIfPossible;
window.askAI = askAI;
window.requireApiKey = requireApiKey;
window.questionContext = questionContext;
window.questionByNo = questionByNo;
window.esc = esc;

function state() {
  return window.QMT?.getState?.() || { questions: [], setup: {} };
}

function activeProvider() {
  return AI.settings.provider === 'extra' ? 'extra' : 'gemini';
}

function requireApiKey() {
  const key = activeProvider() === 'extra' ? AI.settings.extraKey : AI.settings.geminiKey;
  if (!key) {
    toast('⚠️ Settings tab me API key save karein');
    if (typeof window.switchTab === 'function') window.switchTab('settings');
    return '';
  }
  return key;
}

async function askGemini(prompt) {
  const key = AI.settings.geminiKey;
  if (!key) throw new Error('Gemini API key missing');
  const model = AI.settings.geminiModel || DEFAULT_GEMINI_MODEL;
  const url = GEMINI_BASE + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, responseMimeType: 'text/plain' }
    })
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch (error) {}
    throw new Error(detail || `Gemini request failed (${response.status})`);
  }
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n').trim() || '';
}

async function askExtra(prompt) {
  const key = AI.settings.extraKey;
  const model = AI.settings.extraModel;
  const base = String(AI.settings.extraBaseUrl || '').replace(/\/+$/, '');
  if (!key) throw new Error('Extra API key missing');
  if (!model) throw new Error('Extra API model missing');
  if (!base) throw new Error('Extra API base URL missing');
  const response = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25
    })
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch (error) {}
    throw new Error(detail || `Extra API request failed (${response.status})`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function askAI(prompt) {
  return activeProvider() === 'extra' ? askExtra(prompt) : askGemini(prompt);
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.aiLabel = button.textContent;
    button.textContent = label || '⏳ Loading...';
  } else if (button.dataset.aiLabel) {
    button.textContent = button.dataset.aiLabel;
  }
}

function openModal(title, body, options = {}) {
  let modal = document.getElementById('aiModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'aiModal';
    modal.className = 'ai-modal';
    modal.innerHTML = '<div class="ai-modal-card" role="dialog" aria-modal="true">' +
      '<div class="ai-modal-head"><h3 id="aiModalTitle"></h3><button class="ai-close" type="button">✕</button></div>' +
      '<div id="aiModalBody"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('.ai-close')) closeModal();
    });
  }
  document.getElementById('aiModalTitle').textContent = title;
  document.getElementById('aiModalBody').innerHTML = body;
  modal.classList.add('open');
  return modal;
}

function closeModal() {
  document.getElementById('aiModal')?.classList.remove('open');
}

function questionByNo(no) {
  return state().questions.find(question => String(question.qNo) === String(no));
}

function questionContext(question) {
  return JSON.stringify({
    subject: aiSubjectName(),
    questionText: question?.notes || question?.questionText || '',
    options: question?.options || [],
    correctOpt: question?.correctOpt || '',
    yourOpt: question?.yourOpt || '',
    status: question?.status || '',
    category: question?.category || '',
    chapter: question?.chapter || '',
    topic: question?.topic || '',
    subtopic: question?.subtopic || '',
    difficultyLevel: question?.difficultyLevel || '',
    timeTaken: question?.timeTaken || 0,
    avgTime: question?.avgTime || 0,
    reason: question?.reason || '',
    notes: question?.notes || '',
    formula: question?.formula || '',
    revision: {
      keyConcept: question?.keyConcept || '',
      solution: question?.solution || '',
      shortcut: question?.shortcut || '',
      warning: question?.warning || '',
      tip: question?.tip || ''
    }
  }, null, 2);
}

async function renderAIResponse(title, prompt, button) {
  const key = requireApiKey();
  if (!key) return;
  setBusy(button, true);
  openModal(title, '<div class="ai-loading">🤖 AI soch raha hai...</div>');
  try {
    const answer = await askAI(prompt);
    const body = document.getElementById('aiModalBody');
    if (body) {
      body.innerHTML = `<div class="ai-response">${markdown(answer || 'AI response nahi mila.')}</div>`;
      if (window.renderMathInElementIfPossible) window.renderMathInElementIfPossible(body);
    }
  } catch (error) {
    console.error('AI feature:', error);
    document.getElementById('aiModalBody').innerHTML =
      '<div class="ai-response">⚠️ AI response nahi mila. API key, network aur quota check karein.</div>';
    toast('⚠️ AI request fail ho gayi');
  } finally {
    setBusy(button, false);
  }
}

function analysisPrompt(question) {
  return `You are a patient SSC ${aiSubjectName()} mentor. Reply in ${AI.settings.language}.
Analyze this incorrect question and provide exactly these headings:
1. Probable mistake reason
2. Concept weakness vs calculation error
3. Shortest correct solution
4. SSC exam trap
5. Next practice action
Use simple Hindi/English mix, concise and actionable. Do not invent missing options.
IMPORTANT: Har formula LaTeX format me $...$ (inline) ya $$...$$ (block) delimiters me likho.
QUESTION DATA:
${questionContext(question)}`;
}

function askPrompt(question, preset) {
  return `You are an SSC ${aiSubjectName()} tutor. Reply in ${AI.settings.language}. Keep the answer practical,
clear and concise. The learner selected this request: "${preset}".
IMPORTANT: Har formula LaTeX format me $...$ (inline) ya $$...$$ (block) delimiters me likho.
Question data:
${questionContext(question)}
Explain with correct math and use the question's existing options/answer when available.`;
}

function showQuestionAI(no, mode = 'ask', preset = 'आसान भाषा में समझाओ', button) {
  const question = questionByNo(no);
  if (!question) return toast('⚠️ Question nahi mila');
  const title = mode === 'analysis' ? `🔍 AI Analysis · Q${no}` : `🤖 Ask AI · Q${no}`;
  const prompt = mode === 'analysis' ? analysisPrompt(question) : askPrompt(question, preset);
  renderAIResponse(title, prompt, button);
}

function onProviderChange() {
  syncProviderFields();
  const provider = document.getElementById('aiProvider');
  if (provider && provider.value === 'extra') {
    const model = document.getElementById('aiExtraModel');
    const base = document.getElementById('aiExtraBaseUrl');
    if (base && !base.value) base.value = EXTRA_PRESETS[2].base;
    if (model && !model.value) model.value = EXTRA_PRESETS[2].model;
    syncExtraPreset(base ? base.value : '');
  }
}

function onExtraPresetChange() {
  const preset = document.getElementById('aiExtraBasePreset');
  const model = document.getElementById('aiExtraModel');
  const base = document.getElementById('aiExtraBaseUrl');
  if (!preset) return;
  const item = EXTRA_PRESETS.find(entry => entry.id === preset.value);
  if (!item) return;
  if (base) base.value = item.base || '';
  if (item.model && model) model.value = item.model;
}

function addSettingsCard() {
  const tab = document.getElementById('tab-settings');
  if (!tab || document.getElementById('aiSettingsCard')) return;
  const card = document.createElement('div');
  card.id = 'aiSettingsCard';
  card.className = 'card ai-card';
  card.innerHTML = `<div class="card-body">
    <div class="ai-title">🤖 AI Settings</div>
    <div class="ai-sub">Keys Firebase account (Firestore) me save hoti hain, sirf aapke login se access.</div>
    <label><span class="lbl">AI Provider</span>
      <select id="aiProvider" class="inp">
        <option value="gemini">🪐 Gemini (Google)</option>
        <option value="extra">🔌 Extra API (OpenRouter / Groq / OpenAI)</option>
      </select>
    </label>
    <div id="aiGeminiFields" style="margin-top:10px">
      <div class="ai-grid">
        <label><span class="lbl">Gemini API key</span><input id="aiGeminiKey" class="inp" type="password" autocomplete="off" placeholder="AIza..."></label>
        <label><span class="lbl">Gemini Model</span>
          <select id="aiGeminiModel" class="inp">${GEMINI_MODELS.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
        </label>
      </div>
    </div>
    <div id="aiExtraFields" class="hidden" style="margin-top:10px">
      <div class="ai-grid">
        <label><span class="lbl">Extra API key</span><input id="aiExtraKey" class="inp" type="password" autocomplete="off" placeholder="sk-... / provider key"></label>
        <label><span class="lbl">Model</span><input id="aiExtraModel" class="inp" type="text" placeholder="gpt-4o-mini"></label>
        <label><span class="lbl">Base URL preset</span>
          <select id="aiExtraBasePreset" class="inp">${EXTRA_PRESETS.map(p=>`<option value="${p.id}">${p.label}</option>`).join('')}</select>
        </label>
        <label><span class="lbl">Base URL</span><input id="aiExtraBaseUrl" class="inp" type="text" placeholder="https://api.openai.com/v1"></label>
      </div>
    </div>
    <div class="ai-grid" style="margin-top:10px">
      <label><span class="lbl">Language preference</span><select id="aiLanguage" class="inp"><option>Hindi</option><option>English</option><option>Hinglish</option></select></label>
    </div>
    <button class="ai-btn" id="aiSaveSettings" type="button" style="margin-top:12px">💾 Save AI Settings</button>
  </div>`;
  tab.firstElementChild?.prepend(card);
  populateSettings();
  document.getElementById('aiSaveSettings').addEventListener('click', saveSettings);
  document.getElementById('aiProvider').addEventListener('change', onProviderChange);
  document.getElementById('aiExtraBasePreset').addEventListener('change', onExtraPresetChange);
}

function addSmartImportCard() {
  const pane = document.getElementById('entryDataPane');
  if (!pane || document.getElementById('aiImportCard')) return;
  const card = document.createElement('div');
  card.id = 'aiImportCard';
  card.className = 'card ai-card';
  card.innerHTML = `<div class="card-body">
    <div class="ai-title">🤖 AI Smart Import</div>
    <div class="ai-sub">PDF/TXT upload karein — Hindi OCR repair, options, answer, topic aur 5 revision sections automatically banenge.</div>
    <input id="aiImportFile" type="file" accept=".pdf,.txt,text/plain,application/pdf" class="inp">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button id="aiParseImport" class="ai-btn" type="button">✨ Parse with Gemini</button>
      <button id="aiClearImport" class="ai-btn secondary" type="button">Clear</button>
    </div>
    <div id="aiImportStatus" class="ai-sub"></div>
    <div id="aiImportPreview" class="ai-preview hidden"></div>
  </div>`;
  pane.appendChild(card);
  document.getElementById('aiParseImport').addEventListener('click', parseSmartImport);
  document.getElementById('aiClearImport').addEventListener('click', () => {
    document.getElementById('aiImportFile').value = '';
    document.getElementById('aiImportPreview').classList.add('hidden');
    document.getElementById('aiImportStatus').textContent = '';
    AI.preview = [];
  });
}

function addPlannerCard() {
  const tab = document.getElementById('tab-analytics');
  if (!tab || document.getElementById('aiPlannerCard')) return;
  const card = document.createElement('div');
  card.id = 'aiPlannerCard';
  card.className = 'card ai-card';
  card.innerHTML = `<div class="card-body">
    <div class="ai-title">🧠 Personal Revision Planner</div>
    <div class="ai-sub">Weak topics, slow topics aur recent wrong questions se personalized plan banayein.</div>
    <button id="aiStudyPlan" class="ai-btn" type="button">🧠 AI Study Plan</button>
    <div id="aiStudyPlanPreview" class="ai-preview hidden"></div>
  </div>`;
  tab.insertBefore(card, tab.firstElementChild);
  document.getElementById('aiStudyPlan').addEventListener('click', createStudyPlan);
}

async function extractFile(file) {
  if (!file) throw new Error('File select karein');
  if (!/\.pdf$/i.test(file.name)) return file.text();
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDFJS_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error('PDF reader load nahi hua'));
      document.head.appendChild(script);
    });
  }
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  const text = pages.join('\n').trim();
  if (!text) throw new Error('OCR text nahi mila — scanned PDF me text layer nahi hai.');
  return text;
}

function importPrompt(text) {
  const chapterLists = window.qmtSubjectCategoryChapters || window.CATEGORY_CHAPTERS || {
    Arithmetic: ['Percentage', 'Profit & Loss', 'Time & Work', 'Ratio & Proportion', 'Average', 'Ages',
      'Time Speed Distance', 'Simple Interest', 'Compound Interest', 'Number System', 'HCF & LCM',
      'Mixture & Alligation', 'Partnership', 'Boats & Streams'],
    'Advanced Maths': ['Algebra', 'Geometry', 'Trigonometry', 'Mensuration', 'Coordinate Geometry',
      'Quadratic Equations', 'Linear Equation', 'Surds & Indices']
  };
  const activeCategories = typeof window.qmtSubjectCategories === 'function'
    ? window.qmtSubjectCategories() : ['Arithmetic', 'Advanced Maths'];
  const categoryText = JSON.stringify({ activeSubject: aiSubjectName(), categories: activeCategories, chapters: chapterLists });
  return `You extract SSC ${aiSubjectName()} questions from noisy Hindi/English OCR. Repair broken Hindi words and OCR
errors, but never guess an answer when the source is unclear. Use language preference ${AI.settings.language}.
Return ONLY a valid JSON array, no markdown and no commentary. Every object must match this exact schema:
{
 "no": 1,
 "status": "correct|incorrect|skipped",
 "category": "${activeCategories.join('|')}",
 "chapter": "one existing chapter/topic",
 "topic": "specific concept",
 "subtopic": "specific subtopic",
 "difficultyLevel": "Very Easy|Easy|Medium|Hard|Very Hard",
 "timeTaken": 0, "avgTime": 36,
 "questionText": "clean complete question",
 "options": [{"k":"A","v":"option text"},{"k":"B","v":"option text"},{"k":"C","v":"option text"},{"k":"D","v":"option text"}],
 "correctOpt": "A", "yourOpt": "",
 "s1": {"theory":["3-4 concept bullets"],"formulas":["formula"],"whenToApply":"keyword pattern"},
 "s2": {"given":["data"],"toFind":"answer target","strategy":"method choice",
   "steps":[{"t":"Step 1","d":"detail","c":"concept"}],"finalAnswer":"answer","verify":"check"},
 "s3": {"name":"shortcut name","quick":["shortcut steps"],"why":"why it works",
   "elim":[{"opt":"A","txt":"reason","ok":false}]},
 "s4": {"techName":"advanced technique","techDesc":"how to use","traps":"SSC trap"},
 "s5": {"speedHack":"speed action","trapAlert":"trap alert"},
 "videos": [], "tags": ["3-5 keywords"]
}
Use these existing app category chapter lists where applicable: ${categoryText}
Rules: no invented source details; if answer is not available use correctOpt:"" and explain in s4.traps.
Source text:
${text}`;
}

function parseJsonResponse(raw) {
  const cleaned = String(raw || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('AI ne valid JSON array nahi diya');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('AI output array nahi hai');
  return parsed;
}

function toImportSchema(question, index) {
  const q = question || {};
  const options = Array.isArray(q.options) ? q.options : [];
  const status = String(q.status || 'skipped').toLowerCase();
  return {
    no: Number(q.no || q.qNo || index + 1),
    status: ['correct', 'incorrect'].includes(status) ? status : 'skipped',
    chapter: q.category || 'Arithmetic',
    topic: q.chapter || q.topic || '',
    subtopic: q.subtopic || q.topic || '',
    difficulty: q.difficultyLevel || q.difficulty || 'Medium',
    time: Number(q.timeTaken ?? q.time ?? 0) || 0,
    avgTime: Number(q.avgTime ?? 36) || 36,
    questionText: q.questionText || q.notes || '',
    options: options.map(option => ({ k: String(option.k || '').trim(), v: String(option.v || '') })),
    correctOpt: q.correctOpt || '',
    yourOpt: q.yourOpt || '',
    s1: q.s1 || { theory: [], formulas: [], whenToApply: '' },
    s2: q.s2 || { given: [], toFind: '', strategy: '', steps: [], finalAnswer: '', verify: '' },
    s3: q.s3 || { name: '', quick: [], why: '', elim: [] },
    s4: q.s4 || { techName: '', techDesc: '', traps: '' },
    s5: q.s5 || { speedHack: '', trapAlert: '' },
    videos: Array.isArray(q.videos) ? q.videos : [],
    tags: Array.isArray(q.tags) ? q.tags : []
  };
}

function renderImportPreview(questions) {
  const box = document.getElementById('aiImportPreview');
  if (!box) return;
  AI.preview = questions.map(toImportSchema);
  box.classList.remove('hidden');
  box.innerHTML = `<table><thead><tr><th>Q</th><th>Topic</th><th>Question</th><th>Difficulty</th><th>Sections</th></tr></thead><tbody>` +
    AI.preview.map(q => `<tr><td>${esc(q.no)}</td><td>${esc([q.chapter, q.topic, q.subtopic].filter(Boolean).join(' › '))}</td>` +
      `<td>${esc(q.questionText).slice(0, 180)}</td><td>${esc(q.difficulty)}</td><td>${['s1','s2','s3','s4','s5'].filter(key => q[key]).length}/5</td></tr>`).join('') +
    `</tbody></table><button id="aiImportQuestions" class="ai-btn" type="button" style="margin:10px">💾 Import ${AI.preview.length} Questions</button>`;
  document.getElementById('aiImportQuestions').addEventListener('click', () => {
    try {
      window.QMT.importQuestions(AI.preview);
      toast(`✅ ${AI.preview.length} questions existing save path se import ho gaye`);
      box.classList.add('hidden');
    } catch (error) {
      console.error(error);
      toast('⚠️ Import nahi ho paya');
    }
  });
}

async function parseSmartImport(event) {
  const button = event.currentTarget;
  const status = document.getElementById('aiImportStatus');
  const file = document.getElementById('aiImportFile')?.files?.[0];
  const key = requireApiKey();
  if (!key || !file) {
    if (!file) toast('⚠️ PDF/TXT file select karein');
    return;
  }
  setBusy(button, true);
  if (status) status.textContent = '📄 File read ho rahi hai...';
  try {
    const text = await extractFile(file);
    if (status) status.textContent = `🤖 ${text.length.toLocaleString()} characters AI ko bheje ja rahe hain...`;
    const questions = parseJsonResponse(await askAI(importPrompt(text)));
    renderImportPreview(questions);
    if (status) status.textContent = `✅ ${questions.length} questions ka preview ready hai`;
  } catch (error) {
    console.error('Smart import:', error);
    if (status) status.textContent = `⚠️ ${error.message || 'Parse failed'}`;
    toast(error.message?.includes('OCR') ? '⚠️ OCR text nahi mila' : '⚠️ Smart import fail ho gaya');
  } finally {
    setBusy(button, false);
  }
}

function planPayload() {
  const s = state();
  const questions = s.questions || [];
  const topicMap = {};
  questions.forEach(question => {
    const key = [question.category, question.chapter, question.topic].filter(Boolean).join(' › ') || 'Uncategorised';
    const item = topicMap[key] ||= { topic: key, total: 0, correct: 0, wrong: 0, seconds: 0, slow: 0 };
    item.total += 1;
    item.correct += question.status === 'Correct' ? 1 : 0;
    item.wrong += question.status === 'Incorrect' ? 1 : 0;
    item.seconds += Number(question.timeTaken) || 0;
    item.slow += Number(question.timeTaken) > Number(question.avgTime) && Number(question.timeTaken) > 0 ? 1 : 0;
  });
  return {
    topicStats: Object.values(topicMap).map(item => ({
      ...item, accuracy: item.correct + item.wrong ? Math.round(item.correct / (item.correct + item.wrong) * 100) : 0
    })).sort((a, b) => a.accuracy - b.accuracy),
    recentWrong: questions.filter(question => question.status === 'Incorrect').slice(-12).map(question => ({
      no: question.qNo, topic: question.topic || question.chapter, reason: question.reason,
      question: (question.notes || '').slice(0, 180), time: question.timeTaken, avgTime: question.avgTime
    })),
    totals: { questions: questions.length, mocks: s.mocks?.length || 0, setup: s.setup || {} }
  };
}

async function createStudyPlan(event) {
  const button = event.currentTarget;
  const payload = planPayload();
  if (!payload.totals.questions) return toast('⚠️ Pehle kuch questions add karein');
  const key = requireApiKey();
  if (!key) return;
  setBusy(button, true);
  try {
    const prompt = `You are an SSC ${aiSubjectName()} study coach. Reply in ${AI.settings.language}.
Create a personalized plan from this analytics JSON. Use exactly these headings:
## Aaj ke weak topics
## Questions to revise
## 7-day plan
## Speed vs accuracy plan
## Priority practice list
Give concrete counts and short actions; never invent question numbers not present.
IMPORTANT: Har formula LaTeX format me $...$ (inline) ya $$...$$ (block) delimiters me likho.
ANALYTICS:
${JSON.stringify(payload, null, 2)}`;
    const answer = await askAI(prompt);
    const preview = document.getElementById('aiStudyPlanPreview');
    if (preview) {
      preview.classList.remove('hidden');
      preview.innerHTML = `<div class="ai-response">${markdown(answer)}</div>`;
      if (window.renderMathInElementIfPossible) window.renderMathInElementIfPossible(preview);
    }
    openModal('🧠 Personal Revision Planner', `<div class="ai-response">${markdown(answer)}</div>`);
    const modalBody = document.getElementById('aiModalBody');
    if (modalBody && window.renderMathInElementIfPossible) window.renderMathInElementIfPossible(modalBody);
  } catch (error) {
    console.error(error);
    toast('⚠️ Study plan generate nahi hua');
  } finally {
    setBusy(button, false);
  }
}

function findVideos(no, button) {
  const question = questionByNo(no);
  if (!question) return;
  const concept = [question.chapter, question.topic, question.subtopic].filter(Boolean).join(' ');
  const query = (concept ? concept + ' ' : '') + 'SSC ' + aiSubjectName() + ' concept tricks';
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  try {
    window.open(url, '_blank', 'noopener');
  } catch (error) {
    location.href = url;
  }
  toast('📺 YouTube search naye tab me khula');
}

function addQuestionButtons() {
  const appState = state();
  document.querySelectorAll('#qTableBody tr.drow').forEach(row => {
    if (row.querySelector('.ai-row-actions')) return;
    const no = row.cells?.[0]?.textContent?.trim();
    const question = appState.questions.find(item => String(item.qNo) === String(no));
    if (!question) return;
    const cell = row.lastElementChild;
    if (!cell) return;
    const wrap = document.createElement('span');
    wrap.className = 'ai-row-actions';
    wrap.innerHTML = `<button class="act-btn ai-action" data-ai-action="ask" data-no="${esc(no)}" title="Ask AI">🤖</button>` +
      (question.status === 'Incorrect' ? `<button class="act-btn ai-action" data-ai-action="analysis" data-no="${esc(no)}" title="AI Analysis">🔍</button>` : '');
    cell.appendChild(wrap);
  });
  document.querySelectorAll('.rv2-question-card[data-no]').forEach(card => {
    if (card.querySelector('.ai-card-actions')) return;
    const no = card.dataset.no;
    const question = questionByNo(no);
    if (!question) return;
    const actions = card.querySelector('.rv2-q-actions');
    if (!actions) return;
    const wrap = document.createElement('span');
    wrap.className = 'ai-card-actions';
    wrap.innerHTML = `<button class="rv2-mini-btn ai-action" data-ai-action="ask" data-no="${esc(no)}">🤖 Ask AI</button>` +
      (question.status === 'Incorrect' ? `<button class="rv2-mini-btn ai-action" data-ai-action="analysis" data-no="${esc(no)}">🔍 AI Analysis</button>` : '') +
      `<button class="rv2-mini-btn ai-action" data-ai-action="discuss" data-no="${esc(no)}" style="margin-left: 4px;">💬 Discuss</button>`;
    actions.appendChild(wrap);
  });
  document.querySelectorAll('.rv2-qr-card').forEach(card => {
    if (card.querySelector('.ai-card-actions')) return;
    const no = card.querySelector('.rv2-qr-no')?.textContent?.replace(/\D/g, '');
    if (!no || !questionByNo(no)) return;
    const wrap = document.createElement('div');
    wrap.className = 'ai-card-actions';
    wrap.style.cssText = 'padding:0 13px 12px;display:flex;gap:6px;flex-wrap:wrap';
    wrap.innerHTML = `<button class="rv2-mini-btn ai-action" data-ai-action="ask" data-no="${esc(no)}">🤖 Ask AI</button>`;
    card.appendChild(wrap);
  });
  document.querySelectorAll('#rv2videoView .rv2-vb-q').forEach(card => {
    if (card.querySelector('.ai-video-actions')) return;
    const no = card.querySelector('.rv2-vb-no')?.textContent?.replace(/\D/g, '');
    if (!no || !questionByNo(no)) return;
    const head = card.querySelector('.rv2-vb-head');
    if (!head) return;
    const wrap = document.createElement('span');
    wrap.className = 'ai-video-actions';
    wrap.innerHTML = `<button class="ai-btn secondary ai-action" data-ai-action="videos" data-no="${esc(no)}" style="padding:6px 9px">📺 Find Videos</button>`;
    head.appendChild(wrap);
  });
}

function bindActions() {
  document.addEventListener('click', event => {
    const button = event.target.closest('.ai-action');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const no = button.dataset.no;
    if (button.dataset.aiAction === 'videos') findVideos(no, button);
    else if (button.dataset.aiAction === 'analysis') showQuestionAI(no, 'analysis', '', button);
    else if (button.dataset.aiAction === 'discuss') {
      if (window.QmtChat && typeof window.QmtChat.discussQuestion === 'function') {
        window.QmtChat.discussQuestion(no);
      } else {
        toast('⚠️ Chat module loading...');
      }
    }
    else showAskModal(no, button);
  }, true);
}

function showAskModal(no, button) {
  const presets = ['आसान भाषा में समझाओ', 'Alternative shortcut', 'Similar question banao', 'Hindi explanation', 'Meri गलती explain karो'];
  openModal(`🤖 Ask AI · Q${no}`, `<div class="ai-preset-row">${presets.map((preset, index) =>
    `<button class="ai-preset" type="button" data-preset-index="${index}">${esc(preset)}</button>`).join('')}</div>` +
    '<div class="ai-response" id="aiAskResponse">Preset choose karein — AI isi question ke context me explain karega.</div>');
  document.querySelectorAll('#aiModal .ai-preset').forEach(presetButton => {
    presetButton.addEventListener('click', () => {
      showQuestionAI(no, 'ask', presets[Number(presetButton.dataset.presetIndex)], button);
    });
  });
}

function observeDynamicViews() {
  const observer = new MutationObserver(() => addQuestionButtons());
  ['qTableBody', 'rv2allView', 'rv2quickView', 'rv2videoView', 'rv2starredView'].forEach(id => {
    const target = document.getElementById(id);
    if (target) observer.observe(target, { childList: true, subtree: true });
  });
  addQuestionButtons();
}

function resetAIImportForSubject() {
  const file = document.getElementById('aiImportFile');
  const preview = document.getElementById('aiImportPreview');
  const status = document.getElementById('aiImportStatus');
  if (file) file.value = '';
  if (preview) preview.classList.add('hidden');
  if (status) status.textContent = '';
  AI.preview = [];
}

function initAI() {
  addSettingsCard();
  addSmartImportCard();
  addPlannerCard();
  bindActions();
  observeDynamicViews();
  window.addEventListener('qmt-auth-state', event => handleAuthState(event.detail));
  window.addEventListener('qmt-subject-change', resetAIImportForSubject);
  handleAuthState(window.firebaseUser);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAI);
else initAI();
