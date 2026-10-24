const KEY = 'payroll.theme';

export function currentTheme() {
  return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme() {
  document.documentElement.dataset.theme = currentTheme();
}

export function setTheme(mode) {
  localStorage.setItem(KEY, mode === 'dark' ? 'dark' : 'light');
  applyTheme();
}
