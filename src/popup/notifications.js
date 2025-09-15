const TOAST_CONTAINER_ID = 'popup-toast-container';
const SUCCESS_DURATION = 4000;
const ERROR_DURATION = 6000;

function ensureContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        container.className = 'popup-toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }
    return container;
}

function removeToast(toast) {
    const container = toast?.parentElement;
    if (!toast || !container) { return; }

    toast.classList.remove('popup-toast--visible');
    toast.classList.add('popup-toast--closing');

    toast.addEventListener('transitionend', () => {
        toast.remove();
        if (!container.hasChildNodes()) {
            container.remove();
        }
    }, { once: true });
}

function showToast(message, type) {
    if (!message) { return; }

    const container = ensureContainer();
    const toast = document.createElement('div');
    toast.className = `popup-toast popup-toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;

    container.appendChild(toast);

    // Wait a frame so CSS transitions can animate
    requestAnimationFrame(() => {
        toast.classList.add('popup-toast--visible');
    });

    const timeout = setTimeout(() => removeToast(toast), type === 'error' ? ERROR_DURATION : SUCCESS_DURATION);

    toast.addEventListener('click', () => {
        clearTimeout(timeout);
        removeToast(toast);
    }, { once: true });
}

export function notifySuccess(message) {
    showToast(message, 'success');
}

export function notifyError(message) {
    const errorMessage = message instanceof Error ? message.message : message;
    showToast(errorMessage || 'Something went wrong', 'error');
}
