/**
 * LinkedIn Detox — Options Page
 *
 * Manages heuristic patterns, semantic detection phrases, and debug settings.
 * Pattern data is stored in chrome.storage.sync (signal words, co-occurrence).
 * Semantic user phrases (with embeddings) are stored in chrome.storage.local
 * because embeddings are too large for sync quotas.
 */

// Built-in signal words (read-only display)
const BUILTIN_SIGNAL_WORDS = [
  "leverage", "journey", "game-changer", "mindset", "synergy",
  "unlock", "scale", "disrupt", "action/actionable", "framework",
  "ecosystem", "resonate", "impactful", "transformative", "thought leader",
  "delve", "tapestry", "realm", "beacon", "intricate",
  "robust", "seamless", "pivotal", "foster", "harness",
  "holistic", "vibrant", "embark", "unprecedented", "groundbreaking",
  "testament", "navigate", "elevate", "empower", "comprehensive",
  "curate", "streamline", "revolutionize", "cutting-edge", "spearhead",
  "landscape", "ever-evolving",
];

// Built-in co-occurrence patterns (read-only display)
const BUILTIN_COOC_PATTERNS = [
  { label: "interesting thing", a: "interesting, fascinating, intriguing", b: "here, thing, part, where, what" },
  { label: "humbled to share", a: "humbled, thrilled, excited, honored", b: "share, announce, reveal" },
  { label: "false dichotomy", a: "not about", b: "it's about, its about" },
  { label: "if you're not", a: "if you're not, if you are not", b: "you're, you are" },
  { label: "nobody talks about", a: "nobody, no one, most people", b: "talking, miss, realize, understand" },
];

// Built-in semantic phrase labels (from build-embeddings.js canonical list)
const BUILTIN_SEMANTIC_PHRASES = [
  "humblebragging announcement", "thrilled to share", "honored recognition", "grateful milestone",
  "dramatic reveal", "controversial take", "hard truth", "unpopular opinion",
  "false dichotomy wisdom", "reframing cliche", "not X but Y",
  "numbered list wisdom", "story time opener", "counterintuitive insight", "pattern interrupt",
  "nobody talks about", "most people miss", "secret knowledge",
  "motivational fluff", "generic inspiration", "morning routine wisdom", "failure celebration",
  "engagement bait question", "agree or disagree", "hot take poll",
  "corporate jargon overload", "buzzword salad", "framework worship",
  "fake vulnerability", "carefully crafted struggle", "imposter syndrome humble",
  "line break poem", "one sentence paragraphs", "emoji-heavy post",
  "networking virtue signal", "mentorship flex", "giving back narrative",
  "AI will change everything", "future of work", "digital transformation",
  "we're hiring flex", "culture flex",
  "speaking engagement flex", "conference takeaway",
  "pseudo-scientific leadership", "data-backed claim",
  "vague profundity", "zen business wisdom", "paradox wisdom",
];

const els = {
  // Heuristic patterns
  signalWordList: document.getElementById("signal-word-list"),
  newSignalWord: document.getElementById("new-signal-word"),
  addSignalWordBtn: document.getElementById("add-signal-word-btn"),
  toggleBuiltinWords: document.getElementById("toggle-builtin-words"),
  builtinWords: document.getElementById("builtin-words"),
  coocList: document.getElementById("cooc-list"),
  newCoocA: document.getElementById("new-cooc-a"),
  newCoocB: document.getElementById("new-cooc-b"),
  newCoocLabel: document.getElementById("new-cooc-label"),
  addCoocBtn: document.getElementById("add-cooc-btn"),
  toggleBuiltinCooc: document.getElementById("toggle-builtin-cooc"),
  builtinCooc: document.getElementById("builtin-cooc"),
  // Semantic
  semanticEnabled: document.getElementById("toggle-semantic"),
  toggleBuiltinPhrases: document.getElementById("toggle-builtin-phrases"),
  builtinPhrases: document.getElementById("builtin-phrases"),
  phraseList: document.getElementById("phrase-list"),
  newPhraseSentence: document.getElementById("new-phrase-sentence"),
  newPhraseLabel: document.getElementById("new-phrase-label"),
  addPhraseBtn: document.getElementById("add-phrase-btn"),
  embedStatus: document.getElementById("embed-status"),
  // Toolbar
  showBadge: document.getElementById("toggle-show-badge"),
  // Debug
  testMode: document.getElementById("toggle-test-mode"),
  debugLogging: document.getElementById("toggle-debug-logging"),
};

let userSignalWords = [];
let userCooccurrencePatterns = [];
let userSemanticPhrases = [];

// --- Helpers ---

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Rendering ---

function renderSignalWords() {
  els.signalWordList.innerHTML = userSignalWords
    .map(
      (w, i) => `
    <div class="pattern-item">
      <span>${escapeHtml(w)}</span>
      <button data-index="${i}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  els.signalWordList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      userSignalWords.splice(parseInt(btn.dataset.index), 1);
      savePatterns();
      renderSignalWords();
    });
  });
}

function renderCoocPatterns() {
  els.coocList.innerHTML = userCooccurrencePatterns
    .map(
      (p, i) => `
    <div class="pattern-item">
      <span>${escapeHtml(p.label)}: [${escapeHtml(p.groups[0].join(", "))}] + [${escapeHtml(p.groups[1].join(", "))}]</span>
      <button data-index="${i}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  els.coocList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      userCooccurrencePatterns.splice(parseInt(btn.dataset.index), 1);
      savePatterns();
      renderCoocPatterns();
    });
  });
}

function renderBuiltinWords() {
  els.builtinWords.innerHTML = '<div class="builtin-grid">' +
    BUILTIN_SIGNAL_WORDS.map(
      (w) => `<div class="builtin-item">${w}</div>`
    ).join("") + "</div>";
}

function renderBuiltinCooc() {
  els.builtinCooc.innerHTML = BUILTIN_COOC_PATTERNS.map(
    (p) => `<div class="builtin-item"><strong>${p.label}</strong>: [${p.a}] + [${p.b}]</div>`
  ).join("");
}

function renderBuiltinPhrases() {
  els.builtinPhrases.innerHTML = '<div class="builtin-grid">' +
    BUILTIN_SEMANTIC_PHRASES.map(
      (p) => `<div class="builtin-item">${p}</div>`
    ).join("") + "</div>";
}

function renderSemanticPhrases() {
  els.phraseList.innerHTML = userSemanticPhrases
    .map(
      (p, i) => `
    <div class="pattern-item">
      <span><strong>${escapeHtml(p.label)}</strong>: ${escapeHtml(p.sentence)}</span>
      <button data-index="${i}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  els.phraseList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      userSemanticPhrases.splice(parseInt(btn.dataset.index), 1);
      saveLocal();
      renderSemanticPhrases();
    });
  });
}

// --- Storage ---

function saveToggles() {
  chrome.storage.sync.set({
    semanticEnabled: els.semanticEnabled.checked,
    showBadge: els.showBadge.checked,
    testMode: els.testMode.checked,
    debugLogging: els.debugLogging.checked,
  });
}

function savePatterns() {
  chrome.storage.sync.set({
    userSignalWords: userSignalWords,
    userCooccurrencePatterns: userCooccurrencePatterns,
  });
}

function saveLocal() {
  chrome.storage.local.set({
    userSemanticPhrases: userSemanticPhrases,
  });
}

function loadState() {
  chrome.storage.sync.get(
    {
      semanticEnabled: false,
      showBadge: true,
      testMode: false,
      debugLogging: false,
      userSignalWords: [],
      userCooccurrencePatterns: [],
    },
    (items) => {
      els.semanticEnabled.checked = items.semanticEnabled;
      els.showBadge.checked = items.showBadge;
      els.testMode.checked = items.testMode;
      els.debugLogging.checked = items.debugLogging;

      userSignalWords = items.userSignalWords || [];
      userCooccurrencePatterns = items.userCooccurrencePatterns || [];

      renderSignalWords();
      renderCoocPatterns();
    }
  );

  chrome.storage.local.get({ userSemanticPhrases: [] }, (items) => {
    userSemanticPhrases = items.userSemanticPhrases || [];
    renderSemanticPhrases();
  });

  // Static renders (only need to run once)
  renderBuiltinWords();
  renderBuiltinCooc();
  renderBuiltinPhrases();
}

// --- Embedding ---

function embedPhrase(sentence) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Embedding timed out"));
    }, 30000);

    chrome.runtime.sendMessage({ type: "embed", sentences: [sentence] }, (response) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response || !response.embeddings || response.embeddings.length === 0) {
        reject(new Error(response?.error || "No embedding returned"));
        return;
      }
      resolve(response.embeddings[0]);
    });
  });
}

// --- Event Listeners ---

els.semanticEnabled.addEventListener("change", saveToggles);
els.showBadge.addEventListener("change", saveToggles);
els.testMode.addEventListener("change", saveToggles);
els.debugLogging.addEventListener("change", saveToggles);

// Signal words
els.addSignalWordBtn.addEventListener("click", () => {
  const val = els.newSignalWord.value.trim();
  if (val && !userSignalWords.includes(val)) {
    userSignalWords.push(val);
    els.newSignalWord.value = "";
    savePatterns();
    renderSignalWords();
  }
});

els.newSignalWord.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.addSignalWordBtn.click();
});

// Co-occurrence patterns
els.addCoocBtn.addEventListener("click", () => {
  const aText = els.newCoocA.value.trim();
  const bText = els.newCoocB.value.trim();
  const label = els.newCoocLabel.value.trim();
  if (aText && bText && label) {
    const groupA = aText.split(",").map((s) => s.trim()).filter(Boolean);
    const groupB = bText.split(",").map((s) => s.trim()).filter(Boolean);
    if (groupA.length > 0 && groupB.length > 0) {
      userCooccurrencePatterns.push({ groups: [groupA, groupB], label });
      els.newCoocA.value = "";
      els.newCoocB.value = "";
      els.newCoocLabel.value = "";
      savePatterns();
      renderCoocPatterns();
    }
  }
});

// Semantic phrases
els.addPhraseBtn.addEventListener("click", async () => {
  const sentence = els.newPhraseSentence.value.trim();
  const label = els.newPhraseLabel.value.trim();
  if (!sentence || !label) return;

  els.embedStatus.textContent = "Crunching vectors...";
  els.addPhraseBtn.disabled = true;

  try {
    const embedding = await embedPhrase(sentence);
    userSemanticPhrases.push({ label, sentence, embedding });
    els.newPhraseSentence.value = "";
    els.newPhraseLabel.value = "";
    saveLocal();
    renderSemanticPhrases();
    els.embedStatus.textContent = "";
  } catch (err) {
    els.embedStatus.textContent = "Failed: " + err.message;
  } finally {
    els.addPhraseBtn.disabled = false;
  }
});

els.newPhraseLabel.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.addPhraseBtn.click();
});

// Collapsible built-in sections
els.toggleBuiltinWords.addEventListener("click", () => {
  els.builtinWords.classList.toggle("open");
  els.toggleBuiltinWords.textContent = els.builtinWords.classList.contains("open")
    ? "Hide the usual suspects"
    : "Show the usual suspects";
});

els.toggleBuiltinCooc.addEventListener("click", () => {
  els.builtinCooc.classList.toggle("open");
  els.toggleBuiltinCooc.textContent = els.builtinCooc.classList.contains("open")
    ? "Hide built-in combos"
    : "Show built-in combos";
});

els.toggleBuiltinPhrases.addEventListener("click", () => {
  els.builtinPhrases.classList.toggle("open");
  els.toggleBuiltinPhrases.textContent = els.builtinPhrases.classList.contains("open")
    ? "Hide the ~50 built-in phrase variations we sniff for"
    : "Show the ~50 built-in phrase variations we sniff for";
});

// Tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// Init
loadState();
