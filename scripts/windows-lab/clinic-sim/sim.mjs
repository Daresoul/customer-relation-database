#!/usr/bin/env node
/**
 * Clinic simulator for the Windows test lab.
 *
 *   node sim.mjs list
 *   node sim.mjs <scenario> [--config C:\ArkivetLab\lab.json]
 *
 * lab.json says where things go:
 *   { "ports": { "pointcare": "COM21", "healvet": "COM23", "pcr": "COM25" },
 *     "exigoFolder": "C:\\ArkivetLab\\exigo", "fixtures": "C:\\ArkivetLab\\fixtures" }
 * The app listens on the other end of each com0com pair (COM20/22/24).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS, serialPlan, exigoPlan } from './scenarios.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadConfig(argv) {
  const at = argv.indexOf('--config');
  const path = at >= 0 ? argv[at + 1] : 'C:\\ArkivetLab\\lab.json';
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function runSerial(name, scenario, config) {
  const { SerialPort } = await import('serialport');
  const path = config.ports?.[scenario.port];
  if (!path) throw new Error(`no COM port configured for ${scenario.port} in lab.json`);
  const capture = readFileSync(join(config.fixtures, scenario.fixture));
  const port = new SerialPort({ path, baudRate: config.baudRates?.[scenario.port] ?? 9600 });
  await new Promise((resolve, reject) => port.once('open', resolve).once('error', reject));
  let sent = 0;
  for (const step of serialPlan(scenario, capture)) {
    await sleep(step.delayMs);
    await new Promise((resolve, reject) => port.write(step.bytes, (e) => (e ? reject(e) : port.drain(resolve))));
    sent += step.bytes.length;
  }
  await new Promise((resolve) => port.close(resolve));
  console.log(`${name}: wrote ${sent} bytes to ${path}`);
}

async function runExigo(name, scenario, config) {
  const day = readFileSync(join(config.fixtures, 'exigo_daily_two_samples.xml'), 'utf8');
  for (const step of exigoPlan(scenario, day, new Date())) {
    await sleep(step.delayMs);
    const target = join(config.exigoFolder, step.name);
    writeFileSync(target, step.content, 'utf8');
    console.log(`${name}: wrote ${target} (${step.content.length} chars)`);
  }
}

async function main(argv) {
  const name = argv[0];
  if (!name || name === 'list') {
    console.log(Object.keys(SCENARIOS).join('\n'));
    return;
  }
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`unknown scenario "${name}"; try: node sim.mjs list`);
  const config = loadConfig(argv);
  if (scenario.kind === 'serial') await runSerial(name, scenario, config);
  else await runExigo(name, scenario, config);
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`clinic-sim: ${e.message}`);
  process.exit(1);
});
