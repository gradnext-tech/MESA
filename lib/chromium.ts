import chromium from '@sparticuz/chromium-min';
import puppeteer from 'puppeteer-core';

export async function launchBrowser() {
  const isDev = process.env.NODE_ENV !== 'production';

  const executablePath = isDev
    ? process.env.PUPPETEER_EXECUTABLE_PATH
    : await chromium.executablePath();

  return puppeteer.launch({
    args: isDev ? [] : chromium.args,
    executablePath: executablePath || undefined,
    // chromium-min is always headless; we just force true to avoid
    // relying on library-specific typings like chromium.headless.
    headless: true,
  });
}

