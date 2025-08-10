export const i18n = {
    locale: 'en',
    override: null,
    messages: {},
    async init() {
        try {
            const { localeOverride } = await chrome.storage.local.get('localeOverride');
            this.override = localeOverride || null;
            const browserLocale = chrome.i18n.getUILanguage().split('-')[0];
            this.locale = this.override || browserLocale || 'en';
            await this.loadMessages();
        } catch (e) {
            console.error('i18n init failed', e);
        }
    },
    async loadMessages() {
        try {
            const url = chrome.runtime.getURL(`_locales/${this.locale}/messages.json`);
            const res = await fetch(url);
            if (res.ok) {
                this.messages = await res.json();
            } else {
                this.messages = {};
            }
            document.documentElement.lang = this.locale;
        } catch (e) {
            console.error('Failed to load locale messages', e);
            this.messages = {};
        }
    },
    t(key) {
        return this.messages[key]?.message || key;
    },
    async setLocale(newLocale) {
        if (!newLocale || newLocale === 'auto') {
            await chrome.storage.local.remove('localeOverride');
            this.override = null;
            const browserLocale = chrome.i18n.getUILanguage().split('-')[0];
            this.locale = browserLocale || 'en';
        } else {
            await chrome.storage.local.set({ localeOverride: newLocale });
            this.override = newLocale;
            this.locale = newLocale;
        }
        await this.loadMessages();
    },
    applyTranslations(root = document) {
        const elements = root.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const message = this.t(key);
            if (message) {
                el.textContent = message;
            }
        });
        const languageSelect = root.getElementById?.('language');
        if (languageSelect) {
            languageSelect.value = this.override || 'auto';
        }
    }
};
