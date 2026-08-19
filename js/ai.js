const AI_STORAGE_KEY = 'qmt_ai_settings_v1';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';

const AI = {
  settings: loadSettings(),
  preview: [],
  busy: new Set()
};

function loadSettings() {
  try {
    return Object.assign({ geminiKey: '', youtubeKey: '', language: 'Hinglish' },
      JSON.parse(localStorage.getItem(AI_STORAGE_KEY) || '{}'));
  } catch (error) {
    return { geminiKey: '', youtubeKey: '', language: 'Hinglish' };
  }
}

function saveSettings() {
  AI.settings.geminiKey = document.getElementById('aiGeminiKey')?.value.trim() || '';
  AI.settings.youtubeKey = document.getElementById('aiYoutubeKey')?.value.trim() || '';
  AI.settings.language = document.getElementById('aiLanguage')?.value || 'Hinglish';
  localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(AI.settings));
  toast('✅ AI settings save ho gayi');
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

function markdown(value) {
  let html = esc(value);
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>.*?<\/li>(?:<br>)?)+/gs, match => '<ul>' + match.replace(/<br>/g, '') + '</ul>');
  return html;
}

function state() {
  return window.QMT?.getState?.() || { questions: [], setup: {} };
}

function requireGeminiKey() {
  AI.settings = loadSettings();
  if (!AI.settings.geminiKey) {
    toast('⚠️ API key set karein');
    openModal('AI Settings', '<div class="ai-response">Data tab me Gemini API key save karein, phir dobara try karein.</div>');
    return '';
  }
  return AI.settings.geminiKey;
}

function requireYoutubeKey() {
  AI.settings = loadSettings();
  if (!AI.settings.youtubeKey) {
    toast('⚠️ API key set karein');
    return '';
  }
  return AI.settings.youtubeKey;
}

async function askGemini(prompt) {
  const key = requireGeminiKey();
  if (!key) throw new Error('Gemini API key missing');
  const response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
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
  const key = requireGeminiKey();
  if (!key) return;
  setBusy(button, true);
  openModal(title, '<div class="ai-loading">🤖 AI soch raha hai...</div>');
  try {
    const answer = await askGemini(prompt);
    document.getElementById('aiModalBody').innerHTML =
      `<div class="ai-response">${markdown(answer || 'AI response nahi mila.')}</div>`;
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
  return `You are a patient SSC Quant mentor. Reply in ${AI.settings.language}.
Analyze this incorrect question and provide exactly these headings:
1. Probable mistake reason
2. Concept weakness vs calculation error
3. Shortest correct solution
4. SSC exam trap
5. Next practice action
Use simple Hindi/English mix, concise and actionable. Do not invent missing options.
QUESTION DATA:
${questionContext(question)}`;
}

function askPrompt(question, preset) {
  return `You are an SSC Quant tutor. Reply in ${AI.settings.language}. Keep the answer practical,
clear and concise. The learner selected this request: "${preset}".
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

function addSettingsCard() {
  const tab = document.getElementById('tab-data');
  if (!tab || document.getElementById('aiSettingsCard')) return;
  const card = document.createElement('div');
  card.id = 'aiSettingsCard';
  card.className = 'card ai-card';
  card.innerHTML = `<div class="card-body">
    <div class="ai-title">🤖 AI Settings</div>
    <div class="ai-sub">Keys sirf isi browser ke localStorage me save hongi. Firebase/Firestore par nahi bheji jaati.</div>
    <div class="ai-grid">
      <label><span class="lbl">Gemini API key</span><input id="aiGeminiKey" class="inp" type="password" autocomplete="off" placeholder="AIza..."></label>
      <label><span class="lbl">YouTube Data API key</span><input id="aiYoutubeKey" class="inp" type="password" autocomplete="off" placeholder="AIza..."></label>
      <label><span class="lbl">Language preference</span><select id="aiLanguage" class="inp"><option>Hindi</option><option>English</option><option>Hinglish</option></select></label>
    </div>
    <button class="ai-btn" id="aiSaveSettings" type="button" style="margin-top:12px">💾 Save AI Settings</button>
  </div>`;
  tab.firstElementChild?.prepend(card);
  document.getElementById('aiGeminiKey').value = AI.settings.geminiKey || '';
  document.getElementById('aiYoutubeKey').value = AI.settings.youtubeKey || '';
  document.getElementById('aiLanguage').value = AI.settings.language || 'Hinglish';
  document.getElementById('aiSaveSettings').addEventListener('click', saveSettings);
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
  const chapterLists = window.CATEGORY_CHAPTERS || {
    Arithmetic: ['Percentage', 'Profit & Loss', 'Time & Work', 'Ratio & Proportion', 'Average', 'Ages',
      'Time Speed Distance', 'Simple Interest', 'Compound Interest', 'Number System', 'HCF & LCM',
      'Mixture & Alligation', 'Partnership', 'Boats & Streams'],
    'Advanced Maths': ['Algebra', 'Geometry', 'Trigonometry', 'Mensuration', 'Coordinate Geometry',
      'Quadratic Equations', 'Linear Equation', 'Surds & Indices']
  };
  const categoryText = JSON.stringify(chapterLists);
  return `You extract SSC Quant questions from noisy Hindi/English OCR. Repair broken Hindi words and OCR
errors, but never guess an answer when the source is unclear. Use language preference ${AI.settings.language}.
Return ONLY a valid JSON array, no markdown and no commentary. Every object must match this exact schema:
{
 "no": 1,
 "status": "correct|incorrect|skipped",
 "category": "Arithmetic|Advanced Maths",
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
  const key = requireGeminiKey();
  if (!key || !file) {
    if (!file) toast('⚠️ PDF/TXT file select karein');
    return;
  }
  setBusy(button, true);
  if (status) status.textContent = '📄 File read ho rahi hai...';
  try {
    const text = await extractFile(file);
    if (status) status.textContent = `🤖 ${text.length.toLocaleString()} characters AI ko bheje ja rahe hain...`;
    const questions = parseJsonResponse(await askGemini(importPrompt(text)));
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
  const key = requireGeminiKey();
  if (!key) return;
  setBusy(button, true);
  try {
    const prompt = `You are an SSC Quant study coach. Reply in ${AI.settings.language}.
Create a personalized plan from this analytics JSON. Use exactly these headings:
## Aaj ke weak topics
## Questions to revise
## 7-day plan
## Speed vs accuracy plan
## Priority practice list
Give concrete counts and short actions; never invent question numbers not present.
ANALYTICS:
${JSON.stringify(payload, null, 2)}`;
    const answer = await askGemini(prompt);
    const preview = document.getElementById('aiStudyPlanPreview');
    if (preview) {
      preview.classList.remove('hidden');
      preview.innerHTML = `<div class="ai-response">${markdown(answer)}</div>`;
    }
    openModal('🧠 Personal Revision Planner', `<div class="ai-response">${markdown(answer)}</div>`);
  } catch (error) {
    console.error(error);
    toast('⚠️ Study plan generate nahi hua');
  } finally {
    setBusy(button, false);
  }
}

function durationSeconds(iso) {
  const match = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 0;
  return (Number(match[1]) || 0) * 3600 + (Number(match[2]) || 0) * 60 + (Number(match[3]) || 0);
}

async function findVideos(no, button) {
  const key = requireYoutubeKey();
  if (!key) return;
  const question = questionByNo(no);
  if (!question) return;
  setBusy(button, true, '⏳ Finding...');
  try {
    AI.settings = loadSettings();
    const concept = [question.chapter, question.topic, question.subtopic].filter(Boolean).join(' ');
    const query = `${concept} SSC ${AI.settings.language}`;
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.search = new URLSearchParams({
      part: 'snippet', q: query, type: 'video', maxResults: '8', key
    });
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) throw new Error('YouTube search failed');
    const searchData = await searchResponse.json();
    const ids = (searchData.items || []).map(item => item.id?.videoId).filter(Boolean);
    if (!ids.length) throw new Error('No videos found');
    const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    detailsUrl.search = new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key });
    const details = await (await fetch(detailsUrl)).json();
    const durations = new Map((details.items || []).map(item => [item.id, durationSeconds(item.contentDetails?.duration)]));
    const seen = new Set();
    const videos = (searchData.items || []).map(item => {
      const id = item.id.videoId;
      const title = item.snippet?.title || 'YouTube Tutorial';
      const signature = title.toLowerCase().replace(/\W/g, '');
      if (seen.has(signature)) return null;
      seen.add(signature);
      const seconds = durations.get(id) || 0;
      const channel = item.snippet?.channelTitle || '';
      return {
        title: channel ? `${title} · ${channel}` : title,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        min: seconds ? Math.max(1, Math.round(seconds / 60)) : 0,
        channel
      };
    }).filter(Boolean);
    question.videos = videos;
    window.QMT.refresh();
    toast(`📺 ${videos.length} relevant videos mil gaye`);
  } catch (error) {
    console.error('YouTube:', error);
    toast('⚠️ YouTube videos nahi mile');
  } finally {
    setBusy(button, false);
  }
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
      (question.status === 'Incorrect' ? `<button class="rv2-mini-btn ai-action" data-ai-action="analysis" data-no="${esc(no)}">🔍 AI Analysis</button>` : '');
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

function initAI() {
  addSettingsCard();
  addSmartImportCard();
  addPlannerCard();
  bindActions();
  observeDynamicViews();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAI);
else initAI();
