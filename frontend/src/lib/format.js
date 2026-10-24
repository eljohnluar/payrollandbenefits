export const money = (value) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(
    Number(value || 0)
  );

export const shortDate = (value) =>
  value ? new Date(String(value).replace(' ', 'T')).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : '—';

export const monthBounds = (offset = 0) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
};
