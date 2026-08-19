import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-analytics.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAynuva6Z0v4PKXXmr87Je0tW7ioMVbjTY",
  authDomain: "mocks-analytics-pro.firebaseapp.com",
  projectId: "mocks-analytics-pro",
  storageBucket: "mocks-analytics-pro.firebasestorage.app",
  messagingSenderId: "560509225429",
  appId: "1:560509225429:web:bf1a75793100e206d6555c",
  measurementId: "G-MBQEWV6BZY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const FIRESTORE_DATABASE_IDS = ['(default)', 'default'];
let firestoreCandidates = [];
try {
  firestoreCandidates = FIRESTORE_DATABASE_IDS.map(id => getFirestore(app, id));
} catch (error) {
  console.warn('Firebase Firestore unavailable.', error);
}
let firestore = firestoreCandidates[0] || null;

function isDatabaseNotFound(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'not-found' || message.includes('not found') || message.includes('NOT_FOUND');
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error('Firestore request timed out');
      error.code = 'not-found';
      reject(error);
    }, ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

async function withFirestoreFallback(operation) {
  let lastError = null;
  const candidates = firestore && firestore !== firestoreCandidates[0]
    ? [firestore, ...firestoreCandidates.filter(db => db !== firestore)]
    : firestoreCandidates;
  for (const db of candidates) {
    try {
      const result = await withTimeout(operation(db), 8000);
      firestore = db;
      return result;
    } catch (error) {
      lastError = error;
      if (!isDatabaseNotFound(error)) throw error;
    }
  }
  throw lastError || new Error('Firestore is unavailable');
}
try {
  getAnalytics(app);
} catch (error) {
  console.info('Firebase Analytics unavailable in this environment.', error);
}

window.firebaseAuth = auth;
window.firebaseUser = null;
window.firebaseFirestore = firestore;
window.firebaseAiSettingsStore = {
  async load(uid) {
    if (!firestoreCandidates.length) {
      const error = new Error('Firestore is unavailable');
      error.code = 'firestore/unavailable';
      throw error;
    }
    return withFirestoreFallback(async db => {
      const snapshot = await getDoc(doc(db, 'users', uid, 'private', 'aiSettings'));
      return snapshot.exists() ? snapshot.data() : null;
    });
  },
  async save(uid, settings) {
    if (!firestoreCandidates.length) {
      const error = new Error('Firestore is unavailable');
      error.code = 'firestore/unavailable';
      throw error;
    }
    return withFirestoreFallback(db =>
      setDoc(doc(db, 'users', uid, 'private', 'aiSettings'), {
        geminiKey: String(settings.geminiKey || ''),
        youtubeKey: String(settings.youtubeKey || ''),
        language: String(settings.language || 'Hinglish')
      }, { merge: true }));
  }
};

const $ = id => document.getElementById(id);
const setMessage = message => {
  const el = $('authMsg');
  if (el) el.textContent = message || '';
};
const friendlyError = error => {
  const code = String(error?.code || '');
  const messages = {
    'auth/invalid-credential': 'Email ya password check karein.',
    'auth/operation-not-allowed': 'Firebase Console me yeh sign-in method enable karein (Authentication → Sign-in method).',
    'auth/unauthorized-domain': 'Firebase Console me is domain ko authorized domains me add karein.',
    'auth/invalid-email': 'Valid email address daalein.',
    'auth/email-already-in-use': 'Is email se account already hai.',
    'auth/weak-password': 'Password kam se kam 6 characters ka ho.',
    'auth/popup-closed-by-user': 'Google sign-in cancel ho gaya.',
    'auth/popup-blocked': 'Popup allow karke dobara try karein.'
  };
  return messages[code] || 'Sign in nahi ho paya. Dobara try karein.';
};

function showApp(user) {
  window.firebaseUser = user;
  const gate = $('authGate');
  if (gate) {
    gate.classList.add('auth-hidden');
    gate.setAttribute('aria-hidden', 'true');
  }
  const userBox = $('authUser');
  const email = $('authEmail');
  const avatar = $('authAvatar');
  if (userBox) userBox.classList.remove('hidden');
  if (email) email.textContent = user?.email || user?.displayName || 'Signed in';
  if (avatar) {
    if (user?.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;">`;
    } else {
      avatar.textContent = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();
    }
  }
  window.dispatchEvent(new CustomEvent('qmt-auth-state', { detail: user }));
}

function showGate() {
  window.firebaseUser = null;
  const gate = $('authGate');
  if (gate) {
    gate.classList.remove('auth-hidden');
    gate.setAttribute('aria-hidden', 'false');
  }
  const userBox = $('authUser');
  if (userBox) userBox.classList.add('hidden');
  window.dispatchEvent(new CustomEvent('qmt-auth-state', { detail: null }));
}

async function runAuth(action) {
  setMessage('');
  try {
    await action();
  } catch (error) {
    console.error('Firebase Auth:', error);
    setMessage(friendlyError(error));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('authForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const email = $('authEmailInput')?.value.trim();
    const password = $('authPasswordInput')?.value || '';
    runAuth(() => signInWithEmailAndPassword(auth, email, password));
  });
  $('authSignup')?.addEventListener('click', () => {
    const email = $('authEmailInput')?.value.trim();
    const password = $('authPasswordInput')?.value || '';
    if (!email || !password) {
      setMessage('Email aur password pehle daalein.');
      return;
    }
    runAuth(() => createUserWithEmailAndPassword(auth, email, password));
  });
  $('authGoogle')?.addEventListener('click', () => {
    runAuth(() => signInWithPopup(auth, new GoogleAuthProvider()));
  });
  $('authReset')?.addEventListener('click', () => {
    const email = $('authEmailInput')?.value.trim();
    if (!email) {
      setMessage('Reset link ke liye email daalein.');
      return;
    }
    runAuth(async () => {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset link email par bhej diya.');
    });
  });
  $('authLogout')?.addEventListener('click', () => runAuth(() => signOut(auth)));
});

onAuthStateChanged(auth, user => {
  if (user) showApp(user);
  else showGate();
});
