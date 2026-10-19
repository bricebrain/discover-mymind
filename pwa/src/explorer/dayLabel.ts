const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** « Aujourd'hui », « Hier », puis « Lundi 12 octobre ». */
export function dayLabel(iso: string | null, now = new Date()): string {
  if (!iso) return 'Sans date';
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff <= 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  const label = dayFmt.format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
