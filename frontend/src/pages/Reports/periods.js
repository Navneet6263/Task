import { localDate } from '../../services/localDate';

const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localDate(d); };
const monthStart = (offset = 0) => { const d = new Date(); return localDate(new Date(d.getFullYear(), d.getMonth() + offset, 1)); };
const monthEnd = (offset = 0) => { const d = new Date(); return localDate(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)); };
const quarterStart = () => { const d = new Date(); return localDate(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)); };

// Report periods filter tasks by the date they were created.
export const PERIODS = [
  { id: '7d', label: 'Last 7 days', range: () => [shift(-6), localDate()] },
  { id: '30d', label: 'Last 30 days', range: () => [shift(-29), localDate()] },
  { id: 'month', label: 'This month', range: () => [monthStart(), localDate()] },
  { id: 'lastMonth', label: 'Last month', range: () => [monthStart(-1), monthEnd(-1)] },
  { id: 'quarter', label: 'This quarter', range: () => [quarterStart(), localDate()] },
  { id: 'all', label: 'All time', range: () => ['', ''] },
  { id: 'custom', label: 'Custom', range: null },
];

export const periodLabel = (from, to) => {
  const fmt = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!from && !to) return 'All time';
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  return from ? `From ${fmt(from)}` : `Until ${fmt(to)}`;
};
