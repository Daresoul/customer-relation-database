#!/usr/bin/env node
/**
 * Playwright against the real Windows app, through the SSH tunnel to its
 * WebView2 DevTools port (scripts/appctl connect opens it on 127.0.0.1:9222).
 *
 *   node pw.mjs snapshot                 aria snapshot of the app page
 *   node pw.mjs click  <selector>        e.g. 'role=button[name="Save"]', 'text=Settings'
 *   node pw.mjs fill   <selector> <text>
 *   node pw.mjs press  <key>             e.g. Enter, Control+K
 *   node pw.mjs shot   <file.png>        screenshot of the webview
 *   node pw.mjs eval   <js>              evaluate in the page, print the result
 *   node pw.mjs url | goto <path> | console
 */
import { chromium } from '@playwright/test';

const CDP = process.env.ARKIVET_CDP ?? 'http://127.0.0.1:9222';

async function appPage(browser) {
  const pages = browser.contexts().flatMap((c) => c.pages());
  // The hidden host page of the dev bridge never runs on the lab; the app is
  // the page that isn't about:blank.
  const page = pages.find((p) => !p.url().startsWith('about:')) ?? pages[0];
  if (!page) throw new Error('No app page over DevTools — is the app running (appctl start)?');
  return page;
}

async function main([command, ...args]) {
  const browser = await chromium.connectOverCDP(CDP);
  try {
    const page = await appPage(browser);
    switch (command) {
      case 'snapshot':
        console.log(await page.locator('body').ariaSnapshot());
        break;
      case 'click':
        await page.locator(args[0]).first().click({ timeout: 10_000 });
        console.log(`clicked ${args[0]}`);
        break;
      case 'fill':
        await page.locator(args[0]).first().fill(args[1], { timeout: 10_000 });
        console.log(`filled ${args[0]}`);
        break;
      case 'press':
        await page.keyboard.press(args[0]);
        console.log(`pressed ${args[0]}`);
        break;
      case 'shot':
        await page.screenshot({ path: args[0] ?? 'lab-shot.png' });
        console.log(args[0] ?? 'lab-shot.png');
        break;
      case 'eval':
        console.log(JSON.stringify(await page.evaluate(args[0]), null, 2));
        break;
      case 'url':
        console.log(page.url());
        break;
      case 'goto': {
        const target = new URL(args[0], page.url()).toString();
        await page.goto(target);
        console.log(target);
        break;
      }
      case 'console': {
        // Collect for a few seconds; earlier messages aren't kept by DevTools.
        const seconds = Number(args[0] ?? 5);
        page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
        await page.waitForTimeout(seconds * 1000);
        break;
      }
      default:
        throw new Error(`unknown command "${command}"`);
    }
  } finally {
    // For a CDP connection this only disconnects; the app keeps running.
    await browser.close().catch(() => {});
  }
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`pw: ${e.message}`);
  process.exit(1);
});
