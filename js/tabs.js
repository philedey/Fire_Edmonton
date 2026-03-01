// Tab navigation with URL hash routing and lazy data loading

let activeTab = 'overview';
let tabCallbacks = {};
let tabLoaded = {};

const TABS = ['overview', 'stations', 'operations', 'trends'];

export function initTabs(callbacks) {
  tabCallbacks = callbacks || {};

  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  // Wire tab buttons
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === activeTab) return;
      switchTab(tab, tabBtns, panels);
    });
  });

  // Read hash from URL
  const hash = window.location.hash.replace('#', '');
  const initialTab = TABS.includes(hash) ? hash : 'overview';

  // Set initial tab without animation
  switchTab(initialTab, tabBtns, panels, false);

  // Listen for hash changes (browser back/forward)
  window.addEventListener('hashchange', () => {
    const tab = window.location.hash.replace('#', '');
    if (TABS.includes(tab) && tab !== activeTab) {
      switchTab(tab, tabBtns, panels);
    }
  });
}

function switchTab(tab, tabBtns, panels, animate = true) {
  activeTab = tab;
  window.history.replaceState(null, '', `#${tab}`);

  // Update button states
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Switch panels
  panels.forEach(panel => {
    const isTarget = panel.dataset.tab === tab;
    if (isTarget) {
      panel.classList.remove('hidden');
      if (animate) {
        panel.classList.add('tab-entering');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => panel.classList.remove('tab-entering'));
        });
      }
    } else {
      panel.classList.add('hidden');
    }
  });

  // Lazy-load data for the tab (only first time)
  if (!tabLoaded[tab] && tabCallbacks[tab]) {
    tabLoaded[tab] = true;
    tabCallbacks[tab]();
  }
}

export function getActiveTab() {
  return activeTab;
}

// Allow programmatic tab switch (e.g. from map station click)
export function navigateToTab(tab) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  if (TABS.includes(tab)) {
    switchTab(tab, tabBtns, panels);
  }
}
