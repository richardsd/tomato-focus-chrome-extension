import { CONSTANTS, chromePromise } from './constants.js';

const { ATLASSIAN_AUTH, JIRA_AUTH_STORAGE_KEY } = CONSTANTS;

function base64UrlEncode(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function generateRandomBytes(length = 32) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

function generateState(length = 16) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomValues = generateRandomBytes(length);
    let state = '';
    for (const value of randomValues) {
        state += charset.charAt(value % charset.length);
    }
    return state;
}

function normalizeUrl(url) {
    if (!url) {
        return '';
    }
    return url.replace(/\/$/, '').toLowerCase();
}

async function generateCodeVerifier() {
    return base64UrlEncode(generateRandomBytes(32));
}

async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
}

function getRedirectUri() {
    return chrome.identity.getRedirectURL('atlassian');
}

function validateClientId() {
    if (!ATLASSIAN_AUTH.CLIENT_ID || ATLASSIAN_AUTH.CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
        throw new Error('Atlassian OAuth client ID is not configured. Update CONSTANTS.ATLASSIAN_AUTH.CLIENT_ID.');
    }
}

function launchWebAuthFlow(url) {
    return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow({ url, interactive: true }, (redirectUri) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!redirectUri) {
                reject(new Error('Authorization flow was cancelled.'));
                return;
            }
            resolve(redirectUri);
        });
    });
}

function parseAuthorizationResponse(redirectUri, expectedState) {
    const url = new URL(redirectUri);
    const returnedState = url.searchParams.get('state');
    if (!returnedState || returnedState !== expectedState) {
        throw new Error('OAuth state verification failed.');
    }

    const error = url.searchParams.get('error') || url.searchParams.get('error_description');
    if (error) {
        throw new Error(error);
    }

    const code = url.searchParams.get('code');
    if (!code) {
        throw new Error('Authorization code was not returned by Atlassian.');
    }

    return code;
}

async function requestToken(body) {
    const response = await fetch(ATLASSIAN_AUTH.TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    let data;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error('Failed to parse Atlassian token response.');
    }

    if (!response.ok) {
        const message = data.error_description || data.error || response.statusText || 'Unknown error';
        throw new Error(`Atlassian token request failed: ${message}`);
    }

    return data;
}

function computeExpiry(expiresInSeconds) {
    const durationMs = Number.isFinite(expiresInSeconds)
        ? expiresInSeconds * 1000
        : 3600 * 1000;
    const skew = ATLASSIAN_AUTH.TOKEN_REFRESH_SKEW_MS || 60000;
    return Date.now() + Math.max(0, durationMs - skew);
}

async function fetchAccessibleResources(accessToken) {
    const response = await fetch(`${ATLASSIAN_AUTH.API_BASE_URL}/oauth/token/accessible-resources`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch accessible Jira sites.');
    }

    return response.json();
}

async function fetchCurrentUser(accessToken) {
    const response = await fetch(`${ATLASSIAN_AUTH.API_BASE_URL}/me`, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch Atlassian account details.');
    }

    return response.json();
}

function selectPreferredResource(resources, preferredUrl) {
    if (!Array.isArray(resources) || resources.length === 0) {
        return null;
    }

    if (preferredUrl) {
        const normalizedPreferred = normalizeUrl(preferredUrl);
        const match = resources.find(resource => normalizeUrl(resource.url) === normalizedPreferred);
        if (match) {
            return match;
        }
    }

    const jiraResources = resources.filter(resource => Array.isArray(resource.scopes)
        ? resource.scopes.some(scope => scope.startsWith('read:jira'))
        : false);

    if (jiraResources.length > 0) {
        return jiraResources[0];
    }

    return resources[0];
}

export async function saveAuthState(authState) {
    await chromePromise.storage.local.set({
        [JIRA_AUTH_STORAGE_KEY]: authState
    });
}

export async function getStoredAuthState() {
    const result = await chromePromise.storage.local.get([JIRA_AUTH_STORAGE_KEY]);
    return result[JIRA_AUTH_STORAGE_KEY] || null;
}

export async function clearJiraAuth() {
    await new Promise(resolve => chrome.storage.local.remove(JIRA_AUTH_STORAGE_KEY, resolve));
}

export async function startJiraOAuth(preferredSiteUrl = '') {
    validateClientId();

    const state = generateState();
    const codeVerifier = await generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = getRedirectUri();

    const authUrl = new URL(ATLASSIAN_AUTH.AUTHORIZATION_URL);
    authUrl.searchParams.set('audience', 'api.atlassian.com');
    authUrl.searchParams.set('client_id', ATLASSIAN_AUTH.CLIENT_ID);
    authUrl.searchParams.set('scope', ATLASSIAN_AUTH.SCOPES.join(' '));
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const redirectResponse = await launchWebAuthFlow(authUrl.toString());
    const authorizationCode = parseAuthorizationResponse(redirectResponse, state);

    const tokenResponse = await requestToken({
        grant_type: 'authorization_code',
        client_id: ATLASSIAN_AUTH.CLIENT_ID,
        code: authorizationCode,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    });

    if (!tokenResponse.access_token || !tokenResponse.refresh_token) {
        throw new Error('Atlassian token response was incomplete.');
    }

    const baseAuthState = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: computeExpiry(tokenResponse.expires_in),
        scope: typeof tokenResponse.scope === 'string'
            ? tokenResponse.scope.split(' ')
            : ATLASSIAN_AUTH.SCOPES,
        obtainedAt: Date.now()
    };

    const resources = await fetchAccessibleResources(baseAuthState.accessToken);
    const resource = selectPreferredResource(resources, preferredSiteUrl);

    if (!resource) {
        throw new Error('No Jira Cloud sites are available for this account.');
    }

    const account = await fetchCurrentUser(baseAuthState.accessToken);

    const fullAuthState = {
        ...baseAuthState,
        cloudId: resource.id,
        siteUrl: resource.url,
        resourceName: resource.name,
        accountId: account?.account_id || null,
        accountName: account?.name || account?.display_name || null,
        accountEmail: account?.email || null
    };

    await saveAuthState(fullAuthState);

    return {
        authState: fullAuthState,
        resource,
        account: {
            accountId: fullAuthState.accountId,
            name: fullAuthState.accountName,
            email: fullAuthState.accountEmail
        }
    };
}

export async function refreshAccessToken(currentAuthState) {
    if (!currentAuthState?.refreshToken) {
        throw new Error('Refresh token is missing. Please reconnect to Jira.');
    }

    const tokenResponse = await requestToken({
        grant_type: 'refresh_token',
        client_id: ATLASSIAN_AUTH.CLIENT_ID,
        refresh_token: currentAuthState.refreshToken
    });

    if (!tokenResponse.access_token) {
        throw new Error('Failed to refresh Atlassian access token.');
    }

    const updatedAuthState = {
        ...currentAuthState,
        accessToken: tokenResponse.access_token,
        expiresAt: computeExpiry(tokenResponse.expires_in),
        obtainedAt: Date.now()
    };

    if (tokenResponse.refresh_token) {
        updatedAuthState.refreshToken = tokenResponse.refresh_token;
    }
    if (typeof tokenResponse.scope === 'string') {
        updatedAuthState.scope = tokenResponse.scope.split(' ');
    }

    await saveAuthState(updatedAuthState);

    return updatedAuthState;
}

export async function ensureAccessToken(existingAuthState, { forceRefresh = false } = {}) {
    let authState = existingAuthState || await getStoredAuthState();
    if (!authState) {
        throw new Error('Jira OAuth session not found. Please connect again.');
    }

    const expiresAt = Number(authState.expiresAt) || 0;
    const shouldRefresh = forceRefresh
        || !authState.accessToken
        || expiresAt <= Date.now();

    if (!shouldRefresh) {
        return { auth: authState, accessToken: authState.accessToken };
    }

    authState = await refreshAccessToken(authState);
    return { auth: authState, accessToken: authState.accessToken };
}
