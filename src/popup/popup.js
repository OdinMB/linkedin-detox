/**
 * LinkedIn Detox — Popup UI
 *
 * Quick controls: enabled toggle, mode, sensitivity, blocked badge, theme.
 * Pattern configs and debug settings live on the options page.
 */

const SENSITIVITY_THRESHOLDS = { chill: 50, suspicious: 25, unhinged: 1 };
const SENSITIVITY_DESCS = {
  chill: "Only the most blatant slop gets flagged (score > 50). You're feeling generous.",
  suspicious: "Catches most AI-generated slop (score > 25). The sweet spot.",
  unhinged: "Flags anything with even a whiff of AI slop (score > 1). Trust no one.",
};

const els = {
  enabled: document.getElementById("toggle-enabled"),
  semantic: document.getElementById("toggle-semantic"),
  promoted: document.getElementById("toggle-promoted"),
  theme: document.getElementById("toggle-theme"),
  modeButtons: document.querySelectorAll(".mode-btn:not(.sensitivity-btn)"),
  sensitivityButtons: document.querySelectorAll(".sensitivity-btn"),
  blockedBadge: document.getElementById("blocked-badge"),
  openSettings: document.getElementById("open-settings"),
};

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// --- Storage ---

function save() {
  const sensitivity = document.querySelector(".sensitivity-btn.active").dataset.sensitivity;
  chrome.storage.sync.set({
    enabled: els.enabled.checked,
    semanticEnabled: els.semantic.checked,
    blockPromoted: els.promoted.checked,
    mode: document.querySelector(".mode-btn:not(.sensitivity-btn).active").dataset.mode,
    sensitivity: sensitivity,
    threshold: SENSITIVITY_THRESHOLDS[sensitivity],
  });
}

function saveTheme() {
  const theme = els.theme.checked ? "dark" : "light";
  applyTheme(theme);
  chrome.storage.sync.set({ theme: theme });
}

function loadState() {
  chrome.storage.sync.get(
    {
      enabled: true,
      semanticEnabled: false,
      blockPromoted: false,
      mode: "roast",
      sensitivity: "suspicious",
      theme: "light",
    },
    (items) => {
      els.enabled.checked = items.enabled;
      els.semantic.checked = items.semanticEnabled;
      els.promoted.checked = items.blockPromoted;
      els.theme.checked = items.theme === "dark";
      applyTheme(items.theme);

      els.modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === items.mode);
      });

      els.sensitivityButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.sensitivity === items.sensitivity);
      });
      updateSensitivityDesc(items.sensitivity);
    }
  );

  chrome.storage.local.get({ blockedCount: 0 }, (items) => {
    const count = items.blockedCount || 0;
    els.blockedBadge.textContent = count;
    els.blockedBadge.classList.toggle("zero", count === 0);
  });
}

// --- Event Listeners ---

els.enabled.addEventListener("change", save);
els.semantic.addEventListener("change", save);
els.promoted.addEventListener("change", save);
els.theme.addEventListener("change", saveTheme);

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
    updateSensitivityDesc(btn.dataset.sensitivity);
    save();
  });
});

function updateSensitivityDesc(sensitivity) {
  document.getElementById("sensitivity-desc").textContent =
    SENSITIVITY_DESCS[sensitivity] || "";
}

els.openSettings.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Sync theme if changed from options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.theme) {
    const newTheme = changes.theme.newValue || "light";
    els.theme.checked = newTheme === "dark";
    applyTheme(newTheme);
  }
});

// Init
loadState();
