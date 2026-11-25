// Apply the saved theme before first paint (same rules as src/theme/theme.js).
// A separate file, not an inline script, so the page's Content-Security-Policy can refuse every inline script.
(function () {
  try {
    var pref = localStorage.getItem('theme_preference');
    var dark = pref === 'dark' || ((pref !== 'light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
