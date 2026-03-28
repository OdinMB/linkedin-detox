/**
 * LinkedIn Detox — Options Page
 *
 * Manages heuristic patterns, semantic detection phrases, debug settings, and theme.
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
  // Filters
  blockPromoted: document.getElementById("toggle-promoted"),
  // Theme
  theme: document.getElementById("toggle-theme"),
  // Toolbar
  showBadge: document.getElementById("toggle-show-badge"),
  // Debug
  testMode: document.getElementById("toggle-test-mode"),
  debugLogging: document.getElementById("toggle-debug-logging"),
  // Restore buttons
  restoreBuiltinWords: document.getElementById("restore-builtin-words"),
  restoreBuiltinCooc: document.getElementById("restore-builtin-cooc"),
  restoreBuiltinPhrases: document.getElementById("restore-builtin-phrases"),
};

let userSignalWords = [];
let userCooccurrencePatterns = [];
let userSemanticPhrases = [];
let deletedBuiltinWords = [];
let deletedBuiltinCoocLabels = [];
let deletedBuiltinPhrases = [];

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function saveTheme() {
  const theme = els.theme.checked ? "dark" : "light";
  applyTheme(theme);
  chrome.storage.sync.set({ theme: theme });
}

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
  const activeWords = BUILTIN_SIGNAL_WORDS.filter((w) => !deletedBuiltinWords.includes(w));
  els.builtinWords.innerHTML = activeWords.length === 0
    ? '<div class="builtin-item" style="font-style:italic">All defaults removed</div>'
    : activeWords.map((w) => `
      <div class="builtin-item-interactive">
        <span>${escapeHtml(w)}</span>
        <div class="builtin-item-actions">
          <button data-word="${escapeHtml(w)}" data-action="edit" title="Edit (copies to custom list)">&#9998;</button>
          <button data-word="${escapeHtml(w)}" data-action="delete" title="Remove">&times;</button>
        </div>
      </div>
    `).join("");

  els.builtinWords.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const word = btn.dataset.word;
      if (btn.dataset.action === "delete") {
        deletedBuiltinWords.push(word);
        saveDeletedBuiltins();
        renderBuiltinWords();
      } else if (btn.dataset.action === "edit") {
        // Copy to user list immediately, pre-fill input for tweaking
        if (!userSignalWords.includes(word)) {
          userSignalWords.push(word);
          savePatterns();
          renderSignalWords();
        }
        els.newSignalWord.value = word;
        els.newSignalWord.focus();
        deletedBuiltinWords.push(word);
        saveDeletedBuiltins();
        renderBuiltinWords();
      }
    });
  });

  els.restoreBuiltinWords.style.display = deletedBuiltinWords.length > 0 ? "" : "none";
}

function renderBuiltinCooc() {
  const activePatterns = BUILTIN_COOC_PATTERNS.filter((p) => !deletedBuiltinCoocLabels.includes(p.label));
  els.builtinCooc.innerHTML = activePatterns.length === 0
    ? '<div class="builtin-item" style="font-style:italic">All defaults removed</div>'
    : activePatterns.map((p) => `
      <div class="builtin-item-interactive">
        <span><strong>${escapeHtml(p.label)}</strong>: [${escapeHtml(p.a)}] + [${escapeHtml(p.b)}]</span>
        <div class="builtin-item-actions">
          <button data-label="${escapeHtml(p.label)}" data-a="${escapeHtml(p.a)}" data-b="${escapeHtml(p.b)}" data-action="edit" title="Edit (copies to custom list)">&#9998;</button>
          <button data-label="${escapeHtml(p.label)}" data-action="delete" title="Remove">&times;</button>
        </div>
      </div>
    `).join("");

  els.builtinCooc.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const label = btn.dataset.label;
      if (btn.dataset.action === "delete") {
        deletedBuiltinCoocLabels.push(label);
        saveDeletedBuiltins();
        renderBuiltinCooc();
      } else if (btn.dataset.action === "edit") {
        // Copy to user list immediately, pre-fill inputs for tweaking
        const groupA = btn.dataset.a.split(",").map((s) => s.trim()).filter(Boolean);
        const groupB = btn.dataset.b.split(",").map((s) => s.trim()).filter(Boolean);
        if (!userCooccurrencePatterns.some((p) => p.label === label)) {
          userCooccurrencePatterns.push({ groups: [groupA, groupB], label });
          savePatterns();
          renderCoocPatterns();
        }
        els.newCoocLabel.value = label;
        els.newCoocA.value = btn.dataset.a;
        els.newCoocB.value = btn.dataset.b;
        els.newCoocLabel.focus();
        deletedBuiltinCoocLabels.push(label);
        saveDeletedBuiltins();
        renderBuiltinCooc();
      }
    });
  });

  els.restoreBuiltinCooc.style.display = deletedBuiltinCoocLabels.length > 0 ? "" : "none";
}

function renderBuiltinPhrases() {
  const activePhrases = BUILTIN_SEMANTIC_PHRASES.filter((p) => !deletedBuiltinPhrases.includes(p));
  els.builtinPhrases.innerHTML = activePhrases.length === 0
    ? '<div class="builtin-item" style="font-style:italic">All defaults removed</div>'
    : activePhrases.map((p) => `
      <div class="builtin-item-interactive">
        <span>${escapeHtml(p)}</span>
        <div class="builtin-item-actions">
          <button data-phrase="${escapeHtml(p)}" data-action="delete" title="Remove">&times;</button>
        </div>
      </div>
    `).join("");

  els.builtinPhrases.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      deletedBuiltinPhrases.push(btn.dataset.phrase);
      saveDeletedBuiltins();
      renderBuiltinPhrases();
    });
  });

  els.restoreBuiltinPhrases.style.display = deletedBuiltinPhrases.length > 0 ? "" : "none";
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
    blockPromoted: els.blockPromoted.checked,
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

function saveDeletedBuiltins() {
  chrome.storage.sync.set({
    deletedBuiltinWords: deletedBuiltinWords,
    deletedBuiltinCoocLabels: deletedBuiltinCoocLabels,
    deletedBuiltinPhrases: deletedBuiltinPhrases,
  });
}

function loadState() {
  chrome.storage.sync.get(
    {
      semanticEnabled: false,
      blockPromoted: false,
      showBadge: true,
      testMode: false,
      debugLogging: false,
      theme: "light",
      userSignalWords: [],
      userCooccurrencePatterns: [],
      deletedBuiltinWords: [],
      deletedBuiltinCoocLabels: [],
      deletedBuiltinPhrases: [],
    },
    (items) => {
      els.semanticEnabled.checked = items.semanticEnabled;
      els.blockPromoted.checked = items.blockPromoted;
      els.showBadge.checked = items.showBadge;
      els.testMode.checked = items.testMode;
      els.debugLogging.checked = items.debugLogging;
      els.theme.checked = items.theme === "dark";
      applyTheme(items.theme);

      userSignalWords = items.userSignalWords || [];
      userCooccurrencePatterns = items.userCooccurrencePatterns || [];
      deletedBuiltinWords = items.deletedBuiltinWords || [];
      deletedBuiltinCoocLabels = items.deletedBuiltinCoocLabels || [];
      deletedBuiltinPhrases = items.deletedBuiltinPhrases || [];

      renderSignalWords();
      renderCoocPatterns();
      renderBuiltinWords();
      renderBuiltinCooc();
      renderBuiltinPhrases();
    }
  );

  chrome.storage.local.get({ userSemanticPhrases: [] }, (items) => {
    userSemanticPhrases = items.userSemanticPhrases || [];
    renderSemanticPhrases();
  });

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
els.blockPromoted.addEventListener("change", saveToggles);
els.showBadge.addEventListener("change", saveToggles);
els.testMode.addEventListener("change", saveToggles);
els.debugLogging.addEventListener("change", saveToggles);
els.theme.addEventListener("change", saveTheme);

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

// Restore buttons
els.restoreBuiltinWords.addEventListener("click", () => {
  deletedBuiltinWords = [];
  saveDeletedBuiltins();
  renderBuiltinWords();
});

els.restoreBuiltinCooc.addEventListener("click", () => {
  deletedBuiltinCoocLabels = [];
  saveDeletedBuiltins();
  renderBuiltinCooc();
});

els.restoreBuiltinPhrases.addEventListener("click", () => {
  deletedBuiltinPhrases = [];
  saveDeletedBuiltins();
  renderBuiltinPhrases();
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

// Sync theme if changed from popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.theme) {
    const newTheme = changes.theme.newValue || "light";
    els.theme.checked = newTheme === "dark";
    applyTheme(newTheme);
  }
});

// Init
loadState();
