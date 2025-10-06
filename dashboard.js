import { initializeDashboard } from './src/dashboard/index.js';

function startDashboard() {
    initializeDashboard();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDashboard, {
        once: true,
    });
} else {
    startDashboard();
}
