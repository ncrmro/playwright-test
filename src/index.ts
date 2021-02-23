/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { config, folio as baseFolio } from 'folio';
import type { Browser, BrowserContext, BrowserContextOptions, BrowserType, LaunchOptions, Page } from 'playwright';
export { expect, config } from 'folio';

// Test timeout for e2e tests is 30 seconds.
config.timeout = 30000;

// Parameters ------------------------------------------------------------------
// ... these can be used to run tests in different modes.

type PlaywrightParameters = {
  // Browser type name.
  browserName: 'chromium' | 'firefox' | 'webkit';
  // Whether to run tests headless or headful.
  // If undefined, headfulness will be handled by playwright.
  headful: boolean | undefined;
  // Operating system.
  platform: 'win32' | 'linux' | 'darwin';
  // Generate screenshot on failure.
  screenshotOnFailure: boolean;
  // Slows down Playwright operations by the specified amount of milliseconds.
  slowMo: number;
  // Whether to record videos for all tests.
  video: boolean;
};


// Worker fixture declarations -------------------------------------------------
// ... these live as long as the worker process.

type PlaywrightWorkerFixtures = {
  // Playwright library.
  playwright: typeof import('playwright');
  // Browser type (Chromium / WebKit / Firefox)
  browserType: BrowserType<Browser>;
  // Default browserType.launch() options.
  browserOptions: LaunchOptions;
  // Browser instance, shared for the worker.
  browser: Browser;
  // True iff browserName is Chromium
  isChromium: boolean;
  // True iff browserName is Firefox
  isFirefox: boolean;
  // True iff browserName is WebKit
  isWebKit: boolean;
  // True iff running on Windows.
  isWindows: boolean;
  // True iff running on Mac.
  isMac: boolean;
  // True iff running on Linux.
  isLinux: boolean;
};


// Test fixture definitions, those are created for each test ------------------

export type PlaywrightTestFixtures = {
  // Default browser.newContext() options.
  contextOptions: BrowserContextOptions;
  // Factory for creating a context with given additional options.
  contextFactory: (options?: BrowserContextOptions) => Promise<BrowserContext>;
  // Context instance for test.
  context: BrowserContext;
  // Page instance for test.
  page: Page;
};

const fixtures = baseFolio.extend<PlaywrightTestFixtures, PlaywrightWorkerFixtures, PlaywrightParameters>();
fixtures.browserName.initParameter('Browser type name', (process.env.BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit');
fixtures.headful.initParameter('Whether to run tests headless or headful', process.env.HEADFUL ? true : undefined);
fixtures.platform.initParameter('Operating system', process.platform as ('win32' | 'linux' | 'darwin'));
fixtures.screenshotOnFailure.initParameter('Generate screenshot on failure', false);
fixtures.slowMo.initParameter('Slows down Playwright operations by the specified amount of milliseconds', 0);
fixtures.video.initParameter('Record videos while running tests', false);

fixtures.browserOptions.init(async ({ headful, slowMo }, run) => {
  await run({
    handleSIGINT: false,
    slowMo,
    headless: headful === undefined ? undefined : !headful,
  });
}, { scope: 'worker' });

fixtures.playwright.init(async ({ }, run) => {
  const playwright = require('playwright');
  await run(playwright);
}, { scope: 'worker' });

fixtures.browserType.init(async ({ playwright, browserName }, run) => {
  const browserType = (playwright as any)[browserName];
  await run(browserType);
}, { scope: 'worker' });

fixtures.browser.init(async ({ browserType, browserOptions }, run) => {
  const browser = await browserType.launch(browserOptions);
  await run(browser);
  await browser.close();
}, { scope: 'worker' });

fixtures.isChromium.init(async ({ browserName }, run) => {
  await run(browserName === 'chromium');
}, { scope: 'worker' });

fixtures.isFirefox.init(async ({ browserName }, run) => {
  await run(browserName === 'firefox');
}, { scope: 'worker' });

fixtures.isWebKit.init(async ({ browserName }, run) => {
  await run(browserName === 'webkit');
}, { scope: 'worker' });

fixtures.isWindows.init(async ({ platform }, run) => {
  await run(platform === 'win32');
}, { scope: 'worker' });

fixtures.isMac.init(async ({ platform }, run) => {
  await run(platform === 'darwin');
}, { scope: 'worker' });

fixtures.isLinux.init(async ({ platform }, run) => {
  await run(platform === 'linux');
}, { scope: 'worker' });

fixtures.contextOptions.init(async ({ video, testInfo }, run) => {
  if (video) {
    await run({
      videosPath: testInfo.outputPath(''),
    });
  } else {
    await run({});
  }
});

fixtures.contextFactory.init(async ({ browser, contextOptions, testInfo, screenshotOnFailure }, run) => {
  const contexts: BrowserContext[] = [];
  async function contextFactory(options: BrowserContextOptions = {}) {
    const context = await browser.newContext({ ...contextOptions, ...options });
    contexts.push(context);
    return context;
  }
  await run(contextFactory);

  if (screenshotOnFailure && (testInfo.status !== testInfo.expectedStatus)) {
    let ordinal = 0;
    for (const context of contexts) {
      for (const page of context.pages())
        await page.screenshot({ timeout: 5000, path: testInfo.outputPath(`test-failed-${++ordinal}.png`) });
    }
  }
  for (const context of contexts)
    await context.close();
});

fixtures.context.init(async ({ contextFactory }, run) => {
  const context = await contextFactory();
  await run(context);
  // Context factory is taking care of closing the context,
  // so that it could capture a screenshot on failure.
});

fixtures.page.init(async ({ context }, run) => {
  // Always create page off context so that they matched.
  await run(await context.newPage());
  // Context fixture is taking care of closing the page.
});

fixtures.testParametersPathSegment.override(async ({ browserName, platform }, run) => {
  await run(browserName + '-' + platform);
});

export const folio = fixtures.build();
export const it = folio.it;
export const fit = folio.fit;
export const xit = folio.xit;
export const test = folio.test;
export const describe = folio.describe;
export const beforeEach = folio.beforeEach;
export const afterEach = folio.afterEach;
export const beforeAll = folio.beforeAll;
export const afterAll = folio.afterAll;

// If browser is not specified, we are running tests against all three browsers.

folio.generateParametrizedTests(
    'browserName',
    process.env.BROWSER ? [process.env.BROWSER] as any : ['chromium', 'webkit', 'firefox']);
