/**
 * WebdriverIO configuration for full-stack Tauri E2E.
 *
 * Layer 3 of the test pyramid (see docs/arc42-runtime-view.md): runs the real
 * Tauri binary against a real SQLite DB via `tauri-driver`, which sits between
 * WebDriver and Tauri's WebView (Edge WebView2 on Windows, webkit2gtk on Linux).
 *
 * Where this runs:
 *   - Locally: only on machines with tauri-driver installed (Windows / Linux)
 *   - CI: on the self-hosted Windows runner labeled [windows, e2e]
 *
 * What it catches:
 *   - Cross-boundary regressions Layer 2 (mocked) can't see
 *   - SQL schema drift, migration breakage, file watcher bugs
 *   - WebView2-specific UI quirks on the production OS
 *
 * Trade-offs:
 *   - ~30s per test (Tauri startup), flakier than Vitest/Playwright
 *   - tauri-driver is alpha-quality, expect occasional flakes
 *   - Should be a small set of smoke tests, not exhaustive coverage
 */

import type { Options } from '@wdio/types';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

let tauriDriver: ChildProcess | null = null;

/**
 * Path to the production-built Tauri binary that tauri-driver will launch.
 * Windows: target/release/Arkivet.exe (from src-tauri/Cargo.toml productName)
 * Linux:   target/release/arkivet
 */
const tauriBinary = process.platform === 'win32'
  ? path.resolve(__dirname, 'src-tauri', 'target', 'release', 'Arkivet.exe')
  : path.resolve(__dirname, 'src-tauri', 'target', 'release', 'arkivet');

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      transpileOnly: true,
      project: './tsconfig.json',
    },
  },

  specs: ['./e2e-fullstack/**/*.spec.ts'],

  maxInstances: 1, // tauri-driver doesn't support parallel sessions

  capabilities: [
    {
      maxInstances: 1,
      // tauri-driver auto-translates this to the right WebView driver
      'tauri:options': {
        application: tauriBinary,
      } as any,
    },
  ],

  logLevel: 'info',
  bail: 0,
  baseUrl: 'tauri://localhost',
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  // tauri-driver runs on localhost:4444 by default
  hostname: '127.0.0.1',
  port: 4444,

  framework: 'mocha',
  reporters: ['spec'],

  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },

  /**
   * Spawn tauri-driver before any test session opens. tauri-driver itself
   * spawns msedgedriver/webkit2gtk2-driver and our Tauri binary.
   */
  onPrepare: function () {
    tauriDriver = spawn(
      process.platform === 'win32' ? 'tauri-driver.exe' : 'tauri-driver',
      [],
      { stdio: 'inherit', shell: false },
    );
    return new Promise((resolve) => setTimeout(resolve, 1500)); // give it a beat to bind 4444
  },

  /**
   * Clean shutdown so the OS isn't left with zombie WebDriver processes.
   */
  onComplete: function () {
    if (tauriDriver && !tauriDriver.killed) {
      tauriDriver.kill();
    }
  },
};
