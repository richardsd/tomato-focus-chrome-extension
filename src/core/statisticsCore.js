export function getDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
        date.getDate()
    ).padStart(2, '0')}`;
}

export function createEmptyDailyStatistics() {
    return {
        completedToday: 0,
        focusTimeToday: 0,
    };
}

export function getTodayStatistics(allStats, date = new Date()) {
    const todayKey = getDateKey(date);
    return allStats[todayKey] || createEmptyDailyStatistics();
}

export function withCompletedIncrement(stats) {
    return {
        ...stats,
        completedToday: Number(stats.completedToday || 0) + 1,
    };
}

export function withFocusTimeAdded(stats, minutes) {
    return {
        ...stats,
        focusTimeToday: Number(stats.focusTimeToday || 0) + minutes,
    };
}

export function pruneStatisticsHistory(
    allStats,
    retentionDays = 30,
    now = new Date()
) {
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const pruned = { ...allStats };
    Object.keys(pruned).forEach((dateKey) => {
        const statDate = new Date(dateKey);
        if (statDate < cutoffDate) {
            delete pruned[dateKey];
        }
    });

    return pruned;
}
