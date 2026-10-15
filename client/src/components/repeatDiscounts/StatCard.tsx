// ─── Stat Card Component ─────────────────────────────────────────────────────

export function StatCard({
  icon: Icon, label, value, sub, accent, delay,
}: {
  icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode;
  accent: 'red' | 'green' | 'blue' | 'orange' | 'purple'; delay: number;
}) {
  const accentMap = {
    red: { bg: 'stat-accent-red', icon: 'bg-red-500/15 text-red-600 dark:text-red-400' },
    green: { bg: 'stat-accent-green', icon: 'bg-green-500/15 text-green-600 dark:text-green-400' },
    blue: { bg: 'stat-accent-blue', icon: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    orange: { bg: 'stat-accent-orange', icon: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
    purple: { bg: 'stat-accent-purple', icon: 'bg-purple-500/15 text-purple-600 dark:text-purple-400' },
  };
  const a = accentMap[accent];
  return (
    <div
      className={`glass-card rounded-2xl p-5 animate-fade-up card-hover ${a.bg}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`icon-badge ${a.icon}`}>
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </div>
        {sub}
      </div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
