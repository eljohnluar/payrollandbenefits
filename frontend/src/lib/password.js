export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'One number (0–9)', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'One special symbol (!@#$…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Returns a human-readable problem string, or '' when the password is strong. */
export function passwordProblem(password) {
  const missing = PASSWORD_RULES.filter((r) => !r.test(password || '')).map((r) => r.label);
  return missing.length ? `Password needs: ${missing.join(', ').toLowerCase()}.` : '';
}
