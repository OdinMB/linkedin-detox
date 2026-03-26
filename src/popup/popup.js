/**
 * LinkedIn Detox — Popup UI
 */

// Built-in signal word descriptions (read-only display)
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

// Built-in co-occurrence pattern descriptions (read-only display)
const BUILTIN_COOC_PATTERNS = [
  { label: "interesting thing", a: "interesting, fascinating, intriguing", b: "here, thing, part, where, what" },
  { label: "humbled to share", a: "humbled, thrilled, excited, honored", b: "share, announce, reveal" },
  { label: "false dichotomy", a: "not about", b: "it's about, its about" },
  { label: "if you're not", a: "if you're not, if you are not", b: "you're, you are" },
  { label: "nobody talks about", a: "nobody, no one, most people", b: "talking, miss, realize, understand" },
];

const SENSITIVITY_THRESHOLDS = { chill: 50, suspicious: 25, unhinged: 1 };

const els = {
  enabled: document.getElementById("toggle-enabled"),
  testMode: document.getElementById("toggle-test-mode"),
  modeButtons: document.querySelectorAll(".mode-btn:not(.sensitivity-btn)"),
  sensitivityButtons: document.querySelectorAll(".sensitivity-btn"),
  blockedCount: document.getElementById("blocked-count"),
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
};

let userSignalWords = [];
let userCooccurrencePatterns = [];

// --- Rendering ---

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
      save();
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
      save();
      renderCoocPatterns();
    });
  });
}

function renderBuiltinWords() {
  els.builtinWords.innerHTML = BUILTIN_SIGNAL_WORDS.map(
    (w) => `<div class="builtin-item">${w}</div>`
  ).join("");
}

function renderBuiltinCooc() {
  els.builtinCooc.innerHTML = BUILTIN_COOC_PATTERNS.map(
    (p) => `<div class="builtin-item"><strong>${p.label}</strong>: [${p.a}] + [${p.b}]</div>`
  ).join("");
}

// --- Storage ---

function save() {
  const sensitivity = document.querySelector(".sensitivity-btn.active").dataset.sensitivity;
  chrome.storage.sync.set({
    enabled: els.enabled.checked,
    testMode: els.testMode.checked,
    mode: document.querySelector(".mode-btn:not(.sensitivity-btn).active").dataset.mode,
    sensitivity: sensitivity,
    threshold: SENSITIVITY_THRESHOLDS[sensitivity],
    userSignalWords: userSignalWords,
    userCooccurrencePatterns: userCooccurrencePatterns,
  });
}

function loadState() {
  chrome.storage.sync.get(
    {
      enabled: true,
      testMode: false,
      mode: "roast",
      sensitivity: "suspicious",
      userSignalWords: [],
      userCooccurrencePatterns: [],
    },
    (items) => {
      els.enabled.checked = items.enabled;
      els.testMode.checked = items.testMode;

      els.modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === items.mode);
      });

      els.sensitivityButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.sensitivity === items.sensitivity);
      });

      userSignalWords = items.userSignalWords || [];
      userCooccurrencePatterns = items.userCooccurrencePatterns || [];

      renderSignalWords();
      renderCoocPatterns();
      renderBuiltinWords();
      renderBuiltinCooc();
    }
  );

  chrome.storage.local.get({ blockedCount: 0 }, (items) => {
    els.blockedCount.textContent = items.blockedCount;
  });
}

// --- Event Listeners ---

els.enabled.addEventListener("change", save);
els.testMode.addEventListener("change", save);

els.modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    save();
  });
});

els.sensitivityButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.sensitivityButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    save();
  });
});

// Signal words
els.addSignalWordBtn.addEventListener("click", () => {
  const val = els.newSignalWord.value.trim();
  if (val && !userSignalWords.includes(val)) {
    userSignalWords.push(val);
    els.newSignalWord.value = "";
    save();
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
      save();
      renderCoocPatterns();
    }
  }
});

// Collapsible built-in sections
els.toggleBuiltinWords.addEventListener("click", () => {
  els.builtinWords.classList.toggle("open");
  els.toggleBuiltinWords.textContent = els.builtinWords.classList.contains("open")
    ? "Hide built-in words"
    : "Show built-in words";
});

els.toggleBuiltinCooc.addEventListener("click", () => {
  els.builtinCooc.classList.toggle("open");
  els.toggleBuiltinCooc.textContent = els.builtinCooc.classList.contains("open")
    ? "Hide built-in patterns"
    : "Show built-in patterns";
});

// Init
loadState();
