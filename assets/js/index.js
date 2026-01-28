// Configuration constants (timing)
const HEADER_WHOAMI_DELAY_MS = 1500;
const HEADER_CONTINUE_TIMEOUT_MS = 5000;
const HEADER_FADE_IN_DURATION_MS = 300;
const HEADER_TAGLINE_DELAY_MS = 200;
const FADE_IN_DURATION_MS = 300;
const SECTION_FADE_IN_DURATION_MS = 300;
const SECTION_FADE_IN_STAGGER_MS = 100;
const KEYBOARD_NAV_SCROLL_RESET_MS = 1000;

// State management
let currentSectionIndex = 0;
let isKeyboardNavigating = false;
let headerAnimationComplete = false;
let cursorOverrideSectionId = null;

// Theme (auto/light/dark via CSS variables)
const THEME_MODE_STORAGE_KEY = 'theme';
const THEME_MODES = ['auto', 'dark', 'light'];

function getPreferredThemeFromSystem() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function normalizeThemeMode(mode) {
  return THEME_MODES.includes(mode) ? mode : 'auto';
}

function getStoredThemeMode() {
  try {
    const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  } catch {
    // ignore (storage may be blocked)
  }
  return 'auto';
}

function resolveTheme(mode) {
  const normalizedMode = normalizeThemeMode(mode);
  return normalizedMode === 'auto' ? getPreferredThemeFromSystem() : normalizedMode;
}

function updateThemeSwitcherUI(mode) {
  const normalizedMode = normalizeThemeMode(mode);
  document.querySelectorAll('.theme-switcher-button[data-theme-mode]').forEach((btn) => {
    const btnMode = btn.getAttribute('data-theme-mode');
    const isActive = btnMode === normalizedMode;
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyThemeMode(mode, { persist = false } = {}) {
  const normalizedMode = normalizeThemeMode(mode);
  const theme = resolveTheme(normalizedMode);

  document.documentElement.setAttribute('data-theme-mode', normalizedMode);
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeSwitcherUI(normalizedMode);

  if (persist) {
    try {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, normalizedMode);
    } catch {
      // ignore (storage may be blocked)
    }
  }
}

// Section IDs in order
const sections = ['welcome', 'about', 'experience', 'skills', 'education', 'contact'];
const sectionElements = sections.map(id => document.getElementById(id));
const cursorElements = {
  'welcome': document.getElementById('cursor-welcome'),
  'pressKey': document.getElementById('cursor-press-key'),
  'about': document.getElementById('cursor-about'),
  'experience': document.getElementById('cursor-experience'),
  'skills': document.getElementById('cursor-skills'),
  'education': document.getElementById('cursor-education'),
  'contact': document.getElementById('cursor-contact')
};

// Header navigation items in the same order as `sections`.
// DOM order is: `.nav-home` first, then the remaining `.nav-link`s.
function getNavItems() {
  return Array.from(document.querySelectorAll('.nav-home, .nav-link'));
}

function setCursorOverride(sectionId) {
  cursorOverrideSectionId = sectionId;
  updateActiveSection(currentSectionIndex);
}

function clearCursorOverrideOnFirstScroll() {
  window.addEventListener(
    'scroll',
    () => {
      cursorOverrideSectionId = null;
      updateActiveSection(currentSectionIndex);
    },
    { passive: true, once: true }
  );
}

// Fade in effect
function fadeIn(element, duration = FADE_IN_DURATION_MS, forceReflow = false, callback) {
  if (!element) {
    return;
  }

  // If we just set opacity to 0 in the same tick (common when toggling display:none -> block),
  // forcing a reflow helps ensure the browser commits that initial state before transitioning.
  if (forceReflow) {
    element.style.display = 'block';
    void element.offsetHeight;
  }

  element.style.transition = `opacity ${duration}ms ease-in`;
  element.style.opacity = '1';
  if (callback) {
    setTimeout(callback, duration);
  }
}

function hideElement(element) {
  if (!element) {
    return;
  }
  element.style.display = 'none';
  element.style.transition = 'none';
  element.style.opacity = '0';
}

// Animation state
let animationTimeouts = [];

// Animated header sequence
function startHeaderAnimation() {
  const asciiArt = document.getElementById('john-gully-ascii-art');
  const welcomeTagline = document.getElementById('welcome-tagline');
  const pressKey = document.getElementById('press-key');
  const mainContent = document.getElementById('main-content');
  
  // Defensive: if required elements are missing, just show everything.
  if (!pressKey || !mainContent) {
    showRemainingContent();
    return;
  }

  // Reset animation state in case this is ever re-run
  animationTimeouts.forEach(timeout => clearTimeout(timeout));
  animationTimeouts = [];

  // Ensure main content is visible
  mainContent.style.opacity = '1';

  // Step 1: show `whoami` alone for 1s.
  hideElement(asciiArt);
  hideElement(welcomeTagline);
  hideElement(pressKey);
  setCursorOverride('welcome');

  // Step 2: show ASCII art + "Press any key to continue", with cursor on press-key.
  const stage2TimeoutId = setTimeout(() => {
    hideElement(asciiArt);
    fadeIn(asciiArt, HEADER_FADE_IN_DURATION_MS, true);

    if (welcomeTagline) {
      // Show the tagline shortly after the ASCII art (and keep it visible after continue).
      const taglineTimeoutId = setTimeout(() => {
        fadeIn(welcomeTagline, HEADER_FADE_IN_DURATION_MS, true);        
        const pressKeyTimeoutId = setTimeout(() => {
          fadeIn(pressKey, HEADER_FADE_IN_DURATION_MS, true);
          setCursorOverride('pressKey');
        }, HEADER_TAGLINE_DELAY_MS);
        animationTimeouts.push(pressKeyTimeoutId);          
      }, HEADER_TAGLINE_DELAY_MS);
      animationTimeouts.push(taglineTimeoutId);
    }

    // Avoid focused nav links causing Enter/Space to trigger hash navigation.
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    // Reveal the rest on any keypress (or after a short timeout)
    let revealed = false;
    let timeoutId = null;
    const cleanupAndReveal = () => {
      if (revealed) return;
      revealed = true;
      if (timeoutId) clearTimeout(timeoutId);
      // Prevent any pending header-stage timeouts (e.g., delayed tagline) from firing after reveal.
      animationTimeouts.forEach((t) => clearTimeout(t));
      animationTimeouts = [];
      document.removeEventListener('keydown', keyHandler, true);
      document.removeEventListener('keyup', keyHandler, true);
      document.removeEventListener('pointerdown', pointerHandler, true);
      showRemainingContent();
    };

    const keyHandler = (e) => {
      // Treat the first keypress as "continue" only (avoid triggering navigation handlers)
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      cleanupAndReveal();
    };

    const pointerHandler = (e) => {
      // Treat the first click/tap as "continue" only (avoid triggering navigation handlers)
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      cleanupAndReveal();
    };

    // Use capture + listen on keyup too, to prevent default link activation (Enter/Space)
    // from firing after our keydown handler.
    document.addEventListener('keydown', keyHandler, true);
    document.addEventListener('keyup', keyHandler, true);
    // Use capture so the first tap/click doesn't activate nav links/buttons before continuing.
    document.addEventListener('pointerdown', pointerHandler, true);

    timeoutId = setTimeout(() => {
      cleanupAndReveal();
    }, HEADER_CONTINUE_TIMEOUT_MS);
    animationTimeouts.push(timeoutId);
  }, HEADER_WHOAMI_DELAY_MS);
  animationTimeouts.push(stage2TimeoutId);
}

// Show remaining content sections
function showRemainingContent() {
  const welcomeTagline = document.getElementById('welcome-tagline');
  const pressKey = document.getElementById('press-key');
  const remainingSections = document.querySelectorAll('.content-section:not(.welcome-section)');
  const welcomeSection = document.getElementById('welcome');
  
  pressKey.style.display = 'none';
  if (welcomeTagline) {
    welcomeTagline.style.display = 'block';
    welcomeTagline.style.opacity = '1';
  }
  headerAnimationComplete = true;

  // Once content is revealed, show cursor next to `man about` until the user scrolls.
  setCursorOverride('about');
  clearCursorOverrideOnFirstScroll();
  
  // Show horizontal line under welcome section
  if (welcomeSection) {
    welcomeSection.classList.add('animation-complete');
  }
  
  // Fade in remaining sections
  remainingSections.forEach((section, index) => {
    section.style.opacity = '0';
    setTimeout(() => {
      fadeIn(section, SECTION_FADE_IN_DURATION_MS);
    }, index * SECTION_FADE_IN_STAGGER_MS);
  });
  
  // Initialize navigation
  updateActiveSection(0);
  initializeIntersectionObserver();
}

// Update active section
function updateActiveSection(index) {
  // Clamp index to valid range
  currentSectionIndex = Math.max(0, Math.min(index, sections.length - 1));
  
  // Update navigation items (home + links) to match section index.
  getNavItems().forEach((item, i) => {
    if (i === currentSectionIndex) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Update cursors
  const cursorSectionId = cursorOverrideSectionId ?? sections[currentSectionIndex];
  Object.keys(cursorElements).forEach(sectionId => {
    const cursor = cursorElements[sectionId];
    if (cursor) {
      if (cursorSectionId === sectionId) {
        cursor.classList.add('active');
      } else {
        cursor.classList.remove('active');
      }
    }
  });
}

// Scroll to section
function getStickyNavOffsetPx() {
  const nav = document.querySelector('.nav-bar');
  if (!nav) return 0;
  // Subtract 1px so the section divider line tucks under the nav's bottom border line.
  return Math.max(0, Math.round(nav.getBoundingClientRect().height) - 1);
}

function scrollToSection(index, smooth = true) {
  if (index < 0 || index >= sections.length) return;
  
  const section = sectionElements[index];
  if (section) {
    isKeyboardNavigating = true;
    const y =
      section.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop) - getStickyNavOffsetPx();
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
    
    updateActiveSection(index);
    
    // Reset keyboard navigation flag after scroll completes
    setTimeout(() => {
      isKeyboardNavigating = false;
    }, KEYBOARD_NAV_SCROLL_RESET_MS);
  }
}

// Keyboard navigation
function handleKeyboardNavigation(e) {
  // Only handle navigation if header animation is complete
  if (!headerAnimationComplete) return;
  
  // Don't interfere with typing in input fields (if any)
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  const key = e.key.toLowerCase();
  
  // j or down arrow: next section
  if (key === 'j' || key === 'arrowdown') {
    e.preventDefault();
    scrollToSection(currentSectionIndex + 1);
  }
  // k or up arrow: previous section
  else if (key === 'k' || key === 'arrowup') {
    e.preventDefault();
    scrollToSection(currentSectionIndex - 1);
  }
}

// Intersection Observer for scroll-based section detection
function initializeIntersectionObserver() {
  const options = {
    root: null,
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0
  };
  
  const observer = new IntersectionObserver((entries) => {
    // Only update if not actively keyboard navigating
    if (isKeyboardNavigating) return;
    
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const sectionId = entry.target.id;
        const index = sections.indexOf(sectionId);
        if (index !== -1 && index !== currentSectionIndex) {
          updateActiveSection(index);
        }
      }
    });
  }, options);
  
  // Observe all sections
  sectionElements.forEach(section => {
    if (section) {
      observer.observe(section);
    }
  });
}

// Handle navigation link clicks
function initializeNavigationLinks() {
  getNavItems().forEach((item, index) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToSection(index);
    });
  });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Apply mode (HTML head script may have already set attributes, but this ensures UI is in sync).
  applyThemeMode(getStoredThemeMode());

  document.querySelectorAll('.theme-switcher-button[data-theme-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-theme-mode');
      applyThemeMode(mode, { persist: true });
    });
  });

  // Keep auto mode in sync with system changes.
  if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const currentMode = document.documentElement.getAttribute('data-theme-mode') || 'auto';
      if (normalizeThemeMode(currentMode) === 'auto') {
        applyThemeMode('auto');
      }
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
    } else if (typeof mql.addListener === 'function') {
      // Safari < 14
      mql.addListener(handler);
    }
  }

  // Initialize all cursors as inactive
  Object.values(cursorElements).forEach(cursor => {
    if (cursor) {
      cursor.classList.remove('active');
    }
  });
  
  // Hide all sections except welcome initially
  const allSections = document.querySelectorAll('.content-section');
  allSections.forEach((section, index) => {
    if (index > 0) { // Skip welcome section (index 0)
      section.style.opacity = '0';
    }
  });
  
  // Start header animation
  startHeaderAnimation();
  
  // Initialize keyboard navigation
  document.addEventListener('keydown', handleKeyboardNavigation);
  
  // Initialize navigation links
  initializeNavigationLinks();
});
