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
  // Trusted Authors
  whitelistAuthorList: document.getElementById("whitelist-author-list"),
  newWhitelistAuthor: document.getElementById("new-whitelist-author"),
  addWhitelistAuthorBtn: document.getElementById("add-whitelist-author-btn"),
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
let whitelistedAuthors = [];
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

// --- Rendering ---

function renderSignalWords() {
  els.signalWordList.innerHTML = "";
  userSignalWords.forEach((w, i) => {
    const item = document.createElement("div");
    item.className = "pattern-item";
    const span = document.createElement("span");
    span.textContent = w;
    const btn = document.createElement("button");
    btn.title = "Remove";
    btn.textContent = "\u00d7";
    btn.addEventListener("click", () => {
      userSignalWords.splice(i, 1);
      savePatterns();
      renderSignalWords();
    });
    item.appendChild(span);
    item.appendChild(btn);
    els.signalWordList.appendChild(item);
  });
}

function renderWhitelistedAuthors() {
  els.whitelistAuthorList.innerHTML = "";
  whitelistedAuthors.forEach((name, i) => {
    const item = document.createElement("div");
    item.className = "pattern-item";
    const span = document.createElement("span");
    span.textContent = name;
    const btn = document.createElement("button");
    btn.title = "Remove";
    btn.textContent = "\u00d7";
    btn.addEventListener("click", () => {
      whitelistedAuthors.splice(i, 1);
      saveWhitelist();
      renderWhitelistedAuthors();
    });
    item.appendChild(span);
    item.appendChild(btn);
    els.whitelistAuthorList.appendChild(item);
  });
}

function renderCoocPatterns() {
  els.coocList.innerHTML = "";
  userCooccurrencePatterns.forEach((p, i) => {
    const item = document.createElement("div");
    item.className = "pattern-item";
    const span = document.createElement("span");
    span.textContent = `${p.label}: [${p.groups[0].join(", ")}] + [${p.groups[1].join(", ")}]`;
    const btn = document.createElement("button");
    btn.title = "Remove";
    btn.textContent = "\u00d7";
    btn.addEventListener("click", () => {
      userCooccurrencePatterns.splice(i, 1);
      savePatterns();
      renderCoocPatterns();
    });
    item.appendChild(span);
    item.appendChild(btn);
    els.coocList.appendChild(item);
  });
}

function renderBuiltinWords() {
  els.builtinWords.innerHTML = "";
  const activeWords = BUILTIN_SIGNAL_WORDS.filter((w) => !deletedBuiltinWords.includes(w));

  if (activeWords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "builtin-item";
    empty.style.fontStyle = "italic";
    empty.textContent = "All defaults removed";
    els.builtinWords.appendChild(empty);
  } else {
    activeWords.forEach((word) => {
      const row = document.createElement("div");
      row.className = "builtin-item-interactive";
      const span = document.createElement("span");
      span.textContent = word;
      const actions = document.createElement("div");
      actions.className = "builtin-item-actions";

      const editBtn = document.createElement("button");
      editBtn.title = "Edit (copies to custom list)";
      editBtn.textContent = "\u270e";
      editBtn.addEventListener("click", () => {
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
      });

      const delBtn = document.createElement("button");
      delBtn.title = "Remove";
      delBtn.textContent = "\u00d7";
      delBtn.addEventListener("click", () => {
        deletedBuiltinWords.push(word);
        saveDeletedBuiltins();
        renderBuiltinWords();
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(span);
      row.appendChild(actions);
      els.builtinWords.appendChild(row);
    });
  }

  els.restoreBuiltinWords.style.display = deletedBuiltinWords.length > 0 ? "" : "none";
}

function renderBuiltinCooc() {
  els.builtinCooc.innerHTML = "";
  const activePatterns = BUILTIN_COOC_PATTERNS.filter((p) => !deletedBuiltinCoocLabels.includes(p.label));

  if (activePatterns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "builtin-item";
    empty.style.fontStyle = "italic";
    empty.textContent = "All defaults removed";
    els.builtinCooc.appendChild(empty);
  } else {
    activePatterns.forEach((p) => {
      const row = document.createElement("div");
      row.className = "builtin-item-interactive";
      const span = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = p.label;
      span.appendChild(strong);
      span.appendChild(document.createTextNode(`: [${p.a}] + [${p.b}]`));
      const actions = document.createElement("div");
      actions.className = "builtin-item-actions";

      const editBtn = document.createElement("button");
      editBtn.title = "Edit (copies to custom list)";
      editBtn.textContent = "\u270e";
      editBtn.addEventListener("click", () => {
        const groupA = p.a.split(",").map((s) => s.trim()).filter(Boolean);
        const groupB = p.b.split(",").map((s) => s.trim()).filter(Boolean);
        if (!userCooccurrencePatterns.some((up) => up.label === p.label)) {
          userCooccurrencePatterns.push({ groups: [groupA, groupB], label: p.label });
          savePatterns();
          renderCoocPatterns();
        }
        els.newCoocLabel.value = p.label;
        els.newCoocA.value = p.a;
        els.newCoocB.value = p.b;
        els.newCoocLabel.focus();
        deletedBuiltinCoocLabels.push(p.label);
        saveDeletedBuiltins();
        renderBuiltinCooc();
      });

      const delBtn = document.createElement("button");
      delBtn.title = "Remove";
      delBtn.textContent = "\u00d7";
      delBtn.addEventListener("click", () => {
        deletedBuiltinCoocLabels.push(p.label);
        saveDeletedBuiltins();
        renderBuiltinCooc();
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(span);
      row.appendChild(actions);
      els.builtinCooc.appendChild(row);
    });
  }

  els.restoreBuiltinCooc.style.display = deletedBuiltinCoocLabels.length > 0 ? "" : "none";
}

function renderBuiltinPhrases() {
  els.builtinPhrases.innerHTML = "";
  const activePhrases = BUILTIN_SEMANTIC_PHRASES.filter((p) => !deletedBuiltinPhrases.includes(p));

  if (activePhrases.length === 0) {
    const empty = document.createElement("div");
    empty.className = "builtin-item";
    empty.style.fontStyle = "italic";
    empty.textContent = "All defaults removed";
    els.builtinPhrases.appendChild(empty);
  } else {
    activePhrases.forEach((phrase) => {
      const row = document.createElement("div");
      row.className = "builtin-item-interactive";
      const span = document.createElement("span");
      span.textContent = phrase;
      const actions = document.createElement("div");
      actions.className = "builtin-item-actions";

      const delBtn = document.createElement("button");
      delBtn.title = "Remove";
      delBtn.textContent = "\u00d7";
      delBtn.addEventListener("click", () => {
        deletedBuiltinPhrases.push(phrase);
        saveDeletedBuiltins();
        renderBuiltinPhrases();
      });

      actions.appendChild(delBtn);
      row.appendChild(span);
      row.appendChild(actions);
      els.builtinPhrases.appendChild(row);
    });
  }

  els.restoreBuiltinPhrases.style.display = deletedBuiltinPhrases.length > 0 ? "" : "none";
}

function renderSemanticPhrases() {
  els.phraseList.innerHTML = "";
  userSemanticPhrases.forEach((p, i) => {
    const item = document.createElement("div");
    item.className = "pattern-item";
    const span = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = p.label;
    span.appendChild(strong);
    span.appendChild(document.createTextNode(": " + p.sentence));
    const btn = document.createElement("button");
    btn.title = "Remove";
    btn.textContent = "\u00d7";
    btn.addEventListener("click", () => {
      userSemanticPhrases.splice(i, 1);
      saveLocal();
      renderSemanticPhrases();
    });
    item.appendChild(span);
    item.appendChild(btn);
    els.phraseList.appendChild(item);
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
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("[LinkedIn Detox] Failed to save patterns:", chrome.runtime.lastError.message);
    }
  });
}

function saveWhitelist() {
  chrome.storage.sync.set({ whitelistedAuthors: whitelistedAuthors });
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
      whitelistedAuthors: [],
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
      whitelistedAuthors = items.whitelistedAuthors || [];

      renderWhitelistedAuthors();
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

const embedPhrase = _ld.embedPhrase;

// --- Event Listeners ---

els.semanticEnabled.addEventListener("change", saveToggles);
els.blockPromoted.addEventListener("change", saveToggles);
els.showBadge.addEventListener("change", saveToggles);
els.testMode.addEventListener("change", saveToggles);
els.debugLogging.addEventListener("change", saveToggles);
els.theme.addEventListener("change", saveTheme);

// Trusted authors
els.addWhitelistAuthorBtn.addEventListener("click", () => {
  const val = els.newWhitelistAuthor.value.trim();
  if (val && !whitelistedAuthors.some((n) => n.toLowerCase() === val.toLowerCase())) {
    whitelistedAuthors.push(val);
    els.newWhitelistAuthor.value = "";
    saveWhitelist();
    renderWhitelistedAuthors();
  }
});

els.newWhitelistAuthor.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.addWhitelistAuthorBtn.click();
});

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
function clearCoocValidation() {
  els.newCoocA.style.borderColor = "";
  els.newCoocB.style.borderColor = "";
  els.newCoocLabel.style.borderColor = "";
}

els.newCoocA.addEventListener("input", clearCoocValidation);
els.newCoocB.addEventListener("input", clearCoocValidation);
els.newCoocLabel.addEventListener("input", clearCoocValidation);

els.addCoocBtn.addEventListener("click", () => {
  clearCoocValidation();
  const aText = els.newCoocA.value.trim();
  const bText = els.newCoocB.value.trim();
  const label = els.newCoocLabel.value.trim();

  let valid = true;
  if (!aText) { els.newCoocA.style.borderColor = "var(--danger)"; valid = false; }
  if (!bText) { els.newCoocB.style.borderColor = "var(--danger)"; valid = false; }
  if (!label) { els.newCoocLabel.style.borderColor = "var(--danger)"; valid = false; }
  if (!valid) return;

  if (userCooccurrencePatterns.some((p) => p.label === label)) {
    els.newCoocLabel.style.borderColor = "var(--danger)";
    return;
  }

  const groupA = aText.split(",").map((s) => s.trim()).filter(Boolean);
  const groupB = bText.split(",").map((s) => s.trim()).filter(Boolean);
  if (groupA.length === 0) { els.newCoocA.style.borderColor = "var(--danger)"; return; }
  if (groupB.length === 0) { els.newCoocB.style.borderColor = "var(--danger)"; return; }

  userCooccurrencePatterns.push({ groups: [groupA, groupB], label });
  els.newCoocA.value = "";
  els.newCoocB.value = "";
  els.newCoocLabel.value = "";
  savePatterns();
  renderCoocPatterns();
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
