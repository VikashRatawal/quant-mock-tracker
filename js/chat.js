// js/chat.js
const CHAT_HISTORY_KEY = 'qmt_chat_history_v1';

function chatSubjectName() {
  return typeof window.qmtSubjectName === 'function' ? window.qmtSubjectName() : 'Maths';
}
function chatHistoryKey() {
  const slug = typeof window.qmtSubjectSlug === 'function' ? window.qmtSubjectSlug() : 'maths';
  return CHAT_HISTORY_KEY + '_' + slug;
}

const Chat = {
  history: [],
  
  init() {
    this.loadHistory();
    this.bindEvents();
    this.renderHistory();
    window.addEventListener('qmt-subject-change', () => {
      this.loadHistory();
      this.renderHistory();
    });
  },

  loadHistory() {
    try {
      const scopedKey = chatHistoryKey();
      let raw = localStorage.getItem(scopedKey);
      if (!raw && chatSubjectName() === 'Maths') {
        // Preserve the pre-subject chat once while moving the app to scoped data.
        raw = localStorage.getItem(CHAT_HISTORY_KEY);
        if (raw) localStorage.setItem(scopedKey, raw);
      }
      this.history = raw ? JSON.parse(raw) : [];
    } catch (e) {
      this.history = [];
    }
  },

  saveHistory() {
    try {
      localStorage.setItem(chatHistoryKey(), JSON.stringify(this.history));
    } catch (e) {}
  },

  bindEvents() {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    const clearBtn = document.getElementById('chatClearBtn');
    const copyBtn = document.getElementById('chatCopyBtn');
    const floatBtn = document.getElementById('floatingChatBtn');
    
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await this.sendMessage(text);
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear chat history?')) {
          this.history = [];
          this.saveHistory();
          this.renderHistory();
        }
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = this.history.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join('\n\n');
        navigator.clipboard.writeText(text).then(() => {
          if (typeof window.showToast === 'function') window.showToast('📋 Chat copied to clipboard!');
        });
      });
    }

    if (floatBtn) {
      floatBtn.addEventListener('click', () => {
        if (typeof window.switchTab === 'function') {
          window.switchTab('chat');
        }
      });
    }

    // Quick-action chips
    document.querySelectorAll('.chat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.text;
        if (input) {
          input.value = text;
          input.focus();
        }
      });
    });
  },

  renderHistory() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    if (this.history.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--muted, #64748b); padding: 40px 10px; font-size: 13px;">
        👋 Welcome to AI Tutor Chat!<br>
        Ask anything, or use quick action chips above to start.
      </div>`;
      return;
    }

    container.innerHTML = this.history.map((m, index) => {
      const isUser = m.role === 'user';
      const bg = isUser ? '#4f46e5' : (document.body.classList.contains('dark') ? '#1e293b' : '#ffffff');
      const color = isUser ? '#ffffff' : 'var(--tx-1, #1e293b)';
      const align = isUser ? 'align-self: flex-end; border-bottom-right-radius: 2px;' : 'align-self: flex-start; border-bottom-left-radius: 2px;';
      const shadow = isUser ? 'rgba(79, 70, 229, 0.15)' : 'rgba(15, 23, 42, 0.05)';
      
      const content = isUser ? window.esc(m.text) : (window.markdown ? window.markdown(m.text) : m.text);
      
      return `<div style="max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.5; ${align} background: ${bg}; color: ${color}; box-shadow: 0 2px 6px ${shadow}; border: 1px solid ${isUser ? '#4f46e5' : 'var(--line, #e2e8f0)'};">
        ${content}
      </div>`;
    }).join('');
    
    // Auto-scroll to bottom
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 30);
    
    // Render formulas/math if katex is loaded
    if (window.renderMathInElementIfPossible) {
      window.renderMathInElementIfPossible(container);
    }
  },

  async sendMessage(text) {
    if (typeof window.requireApiKey === 'function' && !window.requireApiKey()) {
      return; // Redirects to settings tab automatically inside requireApiKey
    }

    this.history.push({ role: 'user', text });
    this.renderHistory();
    this.saveHistory();

    // Add thinking element
    const container = document.getElementById('chatMessages');
    const thinkingId = 'chat-thinking';
    if (container) {
      const thinkingBubble = document.createElement('div');
      thinkingBubble.id = thinkingId;
      thinkingBubble.style.cssText = 'max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; align-self: flex-start; border-bottom-left-radius: 2px; background: var(--card, #ffffff); color: var(--muted, #64748b); box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05); border: 1px solid var(--line, #e2e8f0);';
      thinkingBubble.innerHTML = '⏳ Thinking...';
      container.appendChild(thinkingBubble);
      container.scrollTop = container.scrollHeight;
    }

    try {
      // Build prompt with memory (last ~10 messages)
      const recentHistory = this.history.slice(-10);
      const language = (window.AI && window.AI.settings && window.AI.settings.language) || 'Hinglish';
      
      const systemPrompt = `You are an SSC ${chatSubjectName()} tutor and study coach. Reply in ${language}.
Always reply concisely, practically, and support your explanation with correct mathematics.
Har formula LaTeX format me $...$ (inline) ya $$...$$ (block) delimiters me likho.
Here is the chat history:`;

      const promptParts = [systemPrompt];
      recentHistory.forEach(m => {
        promptParts.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`);
      });
      promptParts.push('Assistant:');

      const fullPrompt = promptParts.join('\n');
      
      if (typeof window.askAI === 'function') {
        const answer = await window.askAI(fullPrompt);
        
        // remove thinking
        document.getElementById(thinkingId)?.remove();
        
        this.history.push({ role: 'assistant', text: answer });
        this.renderHistory();
        this.saveHistory();
      }
    } catch (e) {
      console.error(e);
      document.getElementById(thinkingId)?.remove();
      this.history.push({ role: 'assistant', text: '⚠️ AI request fail ho gayi. Settings aur network verify karein.' });
      this.renderHistory();
    }
  },

  discussQuestion(no) {
    if (typeof window.questionByNo !== 'function') return;
    const question = window.questionByNo(no);
    if (!question) return;
    
    const context = window.questionContext(question);
    const text = `Let's discuss Question ${no}. Explain the concept, any traps, and a fast solution for this question:\n\n${context}`;
    
    if (typeof window.switchTab === 'function') {
      window.switchTab('chat');
    }
    
    this.sendMessage(text);
  }
};

// Expose Chat globally
window.QmtChat = Chat;

// Run on boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Chat.init());
} else {
  Chat.init();
}
