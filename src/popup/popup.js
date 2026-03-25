/**
 * LinkedIn Detox — Popup UI
 */

// Import the default phrases from detector.js is not possible in popup context,
// so we duplicate the defaults here. Keep in sync with detector.js.
const POPUP_DEFAULT_PHRASES = [
  "I'm humbled to announce",
  "I'm thrilled to share",
  "I'm excited to announce",
  "Here's why this matters",
  "Here's what I learned",
  "Let that sink in",
  "Let me be vulnerable for a moment",
  "I never thought I'd say this",
  "Read that again",
  "This changed my life",
  "This is the way",
  "Agree?",
  "Thoughts?",
  "10 lessons I learned",
  "5 things I wish I knew",
  "Most people don't realize",
  "Nobody talks about this",
  "Stop scrolling",
  "Unpopular opinion",
  "Hot take",
  "I used to think",
  "Here's the truth",
  "That's it. That's the post.",
  "If you're not doing this, you're falling behind",
  "Repost if you agree",
  "Share if this resonated",
  "Comment below",
  "Drop a",
  "I asked ChatGPT",
  "I asked AI",
  "AI won't replace you",
  "The future of work",
  "Personal branding is",
];

const els = {
  enabled: document.getElementById("toggle-enabled"),
  modeButtons: document.querySelectorAll(".mode-btn"),
  threshold: document.getElementById("threshold"),
  thresholdDisplay: document.getElementById("threshold-display"),
  phraseList: document.getElementById("phrase-list"),
  newPhrase: document.getElementById("new-phrase"),
  addBtn: document.getElementById("add-btn"),
  resetBtn: document.getElementById("reset-btn"),
  blockedCount: document.getElementById("blocked-count"),
};

let currentPhrases = [...POPUP_DEFAULT_PHRASES];

function renderPhrases() {
  els.phraseList.innerHTML = currentPhrases
    .map(
      (p, i) => `
    <div class="phrase-item">
      <span>${p}</span>
      <button data-index="${i}" title="Remove">&times;</button>
    </div>
  `
    )
    .join("");

  els.phraseList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPhrases.splice(parseInt(btn.dataset.index), 1);
      save();
      renderPhrases();
    });
  });
}

function save() {
  chrome.storage.sync.set({
    enabled: els.enabled.checked,
    mode: document.querySelector(".mode-btn.active").dataset.mode,
    threshold: parseInt(els.threshold.value),
    phrases: currentPhrases,
  });
}

function loadState() {
  chrome.storage.sync.get(
    {
      enabled: true,
      mode: "roast",
      threshold: 30,
      phrases: null,
    },
    (items) => {
      els.enabled.checked = items.enabled;

      els.modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === items.mode);
      });

      els.threshold.value = items.threshold;
      els.thresholdDisplay.textContent = items.threshold;

      currentPhrases = items.phrases || [...POPUP_DEFAULT_PHRASES];
      renderPhrases();
    }
  );

  chrome.storage.local.get({ blockedCount: 0 }, (items) => {
    els.blockedCount.textContent = items.blockedCount;
  });
}

// Event listeners
els.enabled.addEventListener("change", save);

els.modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    els.modeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    save();
  });
});

els.threshold.addEventListener("input", () => {
  els.thresholdDisplay.textContent = els.threshold.value;
  save();
});

els.addBtn.addEventListener("click", () => {
  const val = els.newPhrase.value.trim();
  if (val && !currentPhrases.includes(val)) {
    currentPhrases.push(val);
    els.newPhrase.value = "";
    save();
    renderPhrases();
  }
});

els.newPhrase.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.addBtn.click();
});

els.resetBtn.addEventListener("click", () => {
  currentPhrases = [...POPUP_DEFAULT_PHRASES];
  save();
  renderPhrases();
});

// Init
loadState();
