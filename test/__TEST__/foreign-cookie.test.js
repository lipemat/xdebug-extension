const { openPopup } = require('../testUtils.js');

/**
 * Cookies set outside the extension (e.g. by Xdebug itself via
 * XDEBUG_SESSION_START, or by an IDE) are host-only and may carry an IDE key
 * that differs from the configured trigger value. The extension should treat
 * them as active and remove them when "Disable" is chosen.
 */
describe('Foreign Cookie Tests', () => {
    const testCases = [
        { name: 'localhost', url: 'http://localhost:8765' },
        { name: 'Subdomain (test.localhost)', url: 'http://test.localhost:8765' }
    ];

    for (const { name, url } of testCases) {
        test(`Should detect and clear a host-only cookie with a foreign value on ${name}`, async () => {
            // Arrange
            const page = await global.browser.newPage();
            await page.goto(url);
            await page.evaluate(() => {
                document.cookie = 'XDEBUG_SESSION=PHPSTORM;path=/';
            });

            try {
                // Assert: popup reflects the foreign cookie as active
                const popup = await openPopup();
                await popup.waitForFunction(() => document.querySelector('#debug').checked);

                // Act
                await popup.locator('label[for="disable"]').click();

                // Assert: cookie is gone
                await page.waitForFunction(() => !document.cookie.includes('XDEBUG_SESSION'));
                const cookies = await global.browser.cookies();
                expect(cookies.find(c => c.name === 'XDEBUG_SESSION')).toBeUndefined();
            } finally {
                await page.close();
            }
        });
    }

    test('Should clear Xdebug cookies scoped to a sub path', async () => {
        // Arrange
        const page = await global.browser.newPage();
        await page.goto('http://test.localhost:8765/app/page');
        await page.evaluate(() => {
            document.cookie = 'XDEBUG_PROFILE=PHPSTORM;path=/app';
        });

        try {
            const popup = await openPopup();
            await popup.waitForFunction(() => document.querySelector('#profile').checked);

            // Act
            await popup.locator('label[for="disable"]').click();

            // Assert
            await page.waitForFunction(() => !document.cookie.includes('XDEBUG_PROFILE'));
            const cookies = await global.browser.cookies();
            expect(cookies.find(c => c.name === 'XDEBUG_PROFILE')).toBeUndefined();
        } finally {
            await page.close();
        }
    });

    test('Should replace a foreign cookie when switching modes', async () => {
        // Arrange
        const page = await global.browser.newPage();
        await page.goto('http://test.localhost:8765');
        await page.evaluate(() => {
            document.cookie = 'XDEBUG_SESSION=PHPSTORM;path=/';
        });

        try {
            const popup = await openPopup();
            await popup.waitForFunction(() => document.querySelector('#debug').checked);

            // Act
            await popup.locator('label[for="trace"]').click();

            // Assert
            await page.waitForFunction(() => document.cookie.includes('XDEBUG_TRACE'));
            const cookies = await global.browser.cookies();
            expect(cookies.find(c => c.name === 'XDEBUG_SESSION')).toBeUndefined();
            expect(cookies.find(c => c.name === 'XDEBUG_TRACE')?.value).toBe(config.defaultKey);
        } finally {
            await page.close();
        }
    });
});
