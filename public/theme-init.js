// Applies the saved theme (§9.1) before first paint. A blocking classic script in <head>, because a module
// script is deferred and the page could flash Light first; it is external because the CSP forbids inline
// scripts (§10.9). Keep the key and the rule in step with src/ui/theme.ts.
(function () {
  var mode = 'system';
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') mode = saved;
  } catch {
    // Storage blocked: System.
  }
  var dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
})();
