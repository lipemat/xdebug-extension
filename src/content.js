const DEFAULT_TRIGGER_VALUE = 'YOUR-NAME';

const getCookie = (name) => {
    const cookie = document.cookie.split(';').find((c) => c.trim().startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
};

const setCookie = (name, value, days = 365) => {
    const domain = getDomainForCookie();
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    let cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/`;
    if (domain) {
        cookie += `;domain=${domain}`;
    }
    document.cookie = cookie;
};

/**
 * Expire a cookie by name across every domain/path combination it could
 * have been set with. Cookies set by Xdebug itself (or by an IDE's
 * XDEBUG_SESSION_START URL) are host-only, while cookies set by this
 * extension may carry a parent domain, so a single delete is not enough.
 */
const deleteCookie = (name) => {
    const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const hostname = window.location.hostname;

    const domains = [null];
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) && !hostname.startsWith('[')) {
        const parts = hostname.split('.');
        for (let i = 0; i < parts.length; i++) {
            domains.push(parts.slice(i).join('.'));
        }
    }

    const paths = ['/'];
    const segments = window.location.pathname.split('/').filter(Boolean);
    for (let i = 1; i <= segments.length; i++) {
        const path = '/' + segments.slice(0, i).join('/');
        paths.push(path, `${path}/`);
    }

    for (const domain of domains) {
        for (const path of paths) {
            let cookie = `${name}=;${expired};path=${path}`;
            if (domain) {
                cookie += `;domain=${domain}`;
            }
            document.cookie = cookie;
        }
    }
};

const getDomainForCookie = () => {
    const hostname = window.location.hostname;

    // IP addresses should use host-only cookies (no domain attribute)
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)) {
        return null;
    }

    // localhost should also ideally be host-only as domain=localhost is often rejected
    if (hostname === 'localhost') {
        return null;
    }

    const parts = hostname.split('.');

    // Start from the TLD-ish part (e.g. 'com' or 'localhost') and work up.
    // The probe logic will ensure we only use domains that the browser actually accepts.
    for (let i = parts.length - 1; i >= 0; i--) {
        const domain = parts.slice(i).join('.');

        if (parts.length > 1 && i === parts.length - 1 && domain !== 'localhost') {
            continue;
        }

        const value = Math.random().toString(36).substring(2);
        const name = `_xd_${value}`;
        document.cookie = `${name}=${value};domain=${domain};path=/`;

        if (document.cookie.includes(`${name}=${value}`)) {
            document.cookie = `${name}=;domain=${domain};path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            return domain;
        }
    }

    return null;
};

const getStatusMap = (settings) => {
    const { xdebugDebugTrigger, xdebugTraceTrigger, xdebugProfileTrigger } = settings;
    return {
        1: { name: 'XDEBUG_SESSION', trigger: xdebugDebugTrigger },
        2: { name: 'XDEBUG_PROFILE', trigger: xdebugProfileTrigger },
        3: { name: 'XDEBUG_TRACE', trigger: xdebugTraceTrigger },
    };
};

const getCurrentStatus = () => {
    return new Promise((resolve) => {
        chrome.storage.local.get({
            xdebugDebugTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugTraceTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugProfileTrigger: DEFAULT_TRIGGER_VALUE
        }, (settings) => {
            const statusMap = getStatusMap(settings);
            const entries = Object.entries(statusMap);

            // Prefer an exact match on the configured trigger value.
            for (const [idx, { name, trigger }] of entries) {
                if (getCookie(name) === trigger) {
                    resolve(+idx);
                    return;
                }
            }

            // Otherwise any Xdebug cookie (e.g. one set by the IDE or by
            // Xdebug itself) still activates Xdebug, so report it as active.
            for (const [idx, { name }] of entries) {
                if (getCookie(name) !== null) {
                    resolve(+idx);
                    return;
                }
            }

            resolve(0);
        });
    });
};

const setStatus = status => {
    return new Promise((resolve) => {
        chrome.storage.local.get({
            xdebugDebugTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugTraceTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugProfileTrigger: DEFAULT_TRIGGER_VALUE
        }, (settings) => {
            const statusMap = getStatusMap(settings);
            for (const { name } of Object.values(statusMap)) {
                deleteCookie(name); // Delete existing cookies, wherever they were set
            }

            if (status > 0 && statusMap[status]) {
                const { name, trigger } = statusMap[status];
                setCookie(name, trigger);
            }

            resolve();
        });
    });
};

// Listens for messages from the background script
chrome.runtime.onMessage.addListener((msg, _, res) => {
    switch (msg.cmd) {
        case 'getStatus':
            getCurrentStatus().then(status => res({ status }));
            return true;
        case 'setStatus':
            setStatus(msg.status).then(() => res({ status: msg.status }));
            return true;
        case 'getDomain':
            res({ domain: getDomainForCookie() });
            return true;
        default:
            res({ status: 0 });
            return true;
    }
});
