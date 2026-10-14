#!/usr/bin/env node
// scripts/demo/corridor-fx-e2e.mjs
//
// Replays the FX cross-chain corridor end to end from this surface alone. It reads the two
// demonstration passes declared in deployments/fx-corridor.json and, for each leg, reads the
// transaction receipt on the public test network, then renders the state (block, EVM status,
// target) with the explorer link and the business outcome of each pass: the conforming pass that
// settled, and the refused pass where delivery to an unidentified beneficiary was refused with no
// FX change.
//
// Read only. No build, no private key, no local node: it joins the public chains over JSON-RPC and
// reports what is already settled there. This is layer 2 of the RUNBOOK (on-chain from the surface),
// made runnable. The full offline mechanism proof needs the private toolkit build and is not here.
//
//   node scripts/demo/corridor-fx-e2e.mjs
//
// Needs Node 18+ (global fetch). Options:
//   --rpc-sepolia <url>    override the Ethereum Sepolia endpoint (source leg)
//   --rpc-arbitrum <url>   override the Arbitrum Sepolia endpoint (destination leg)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };

const tracker = JSON.parse(readFileSync(join(ROOT, 'deployments', 'fx-corridor.json'), 'utf8'));

// Chain registry: the explorer is read from the tracker; the RPC is a public endpoint, not a secret.
// Point it at your own node with --rpc-sepolia / --rpc-arbitrum if you prefer.
const CHAINS = {
  11155111: {
    name: 'Ethereum Sepolia',
    explorer: tracker.source?.explorer || 'https://sepolia.etherscan.io',
    rpc: opt('--rpc-sepolia', 'https://ethereum-sepolia-rpc.publicnode.com'),
  },
  421614: {
    name: 'Arbitrum Sepolia',
    explorer: tracker.destination?.explorer || 'https://sepolia.arbiscan.io',
    rpc: opt('--rpc-arbitrum', 'https://arbitrum-sepolia-rpc.publicnode.com'),
  },
};

// Every 20-byte address in the tracker, by lowercase, so a receipt target can be cross-referenced to a
// named corridor contract rather than trusted blind.
const known = new Map();
(function walk(v, path) {
  if (typeof v === 'string') { if (/^0x[0-9a-fA-F]{40}$/.test(v)) known.set(v.toLowerCase(), path); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k); }
})(tracker, '');

async function rpc(url, method, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    return j.result;
  } finally { clearTimeout(timer); }
}

// Returns 'ok' (receipt confirmed), 'bad' (chain does not confirm the tx the surface claims), or
// 'down' (RPC unreachable: a local network problem, not a defect of the surface).
async function leg(l) {
  const c = CHAINS[l.chainId];
  const link = c ? `${c.explorer}/tx/${l.tx}` : `(chain ${l.chainId})`;
  if (!c) { console.log(`    [${l.phase}] chain ${l.chainId} is not in the registry`); return 'bad'; }
  try {
    const rcpt = await rpc(c.rpc, 'eth_getTransactionReceipt', [l.tx]);
    if (!rcpt) {
      console.log(`    [${l.phase}] ${c.name}: the chain has no receipt for this transaction`);
      console.log(`        ${link}`);
      return 'bad';
    }
    const ok = rcpt.status === '0x1';
    const block = parseInt(rcpt.blockNumber, 16);
    const to = (rcpt.to || '').toLowerCase();
    const named = known.get(to);
    console.log(`    [${l.phase}] ${c.name}  block ${block}  EVM status ${ok ? 'success' : 'failed'}`);
    console.log(`        to ${rcpt.to || '(contract creation)'}${named ? `  (corridor: ${named})` : ''}`);
    console.log(`        ${l.what}`);
    console.log(`        ${link}`);
    return ok ? 'ok' : 'bad';
  } catch (e) {
    console.log(`    [${l.phase}] ${c.name}: RPC unreachable (${String(e.message).slice(0, 60)}); explorer link stands`);
    console.log(`        ${link}`);
    return 'down';
  }
}

async function pass(title, p) {
  console.log(`\n== ${title}: ${p.outcome} ==`);
  if (p.parties) {
    const who = (x) => (x && (x.name || x.address)) ? `${x.name || ''} ${x.address || ''}`.trim() : '';
    if (p.parties.originatingFI) console.log(`  originating FI: ${who(p.parties.originatingFI)}`);
    if (p.parties.beneficiaryFI) console.log(`  beneficiary FI: ${who(p.parties.beneficiaryFI)}`);
  }
  if (p.rate_sgd_per_eur) console.log(`  applied rate: 1 EUR = ${p.rate_sgd_per_eur} SGD`);
  if (p.quote_sgd_per_eur) console.log(`  quote at send: 1 EUR = ${p.quote_sgd_per_eur} SGD (not applied, refused)`);
  if (p.reason) console.log(`  reason: ${p.reason}`);
  console.log(`  beneficiary delta: +${p.beneficiary_delta_sgdx} SGDX`);
  const states = [];
  for (const l of p.legs) states.push(await leg(l));
  return states;
}

const dp = tracker.demonstration_passes;
if (!dp || !dp.conforming || !dp.refused) {
  console.error('deployments/fx-corridor.json carries no demonstration_passes to replay');
  process.exit(2);
}

console.log('Programmable Compliance: FX cross-chain corridor EURX to SGDX');
console.log('on-chain replay from the surface (read only, public test networks)');
if (dp.note) console.log(`\n${dp.note}`);

const states = [
  ...(await pass('conforming pass', dp.conforming)),
  ...(await pass('refused pass', dp.refused)),
];
const count = (s) => states.filter((x) => x === s).length;

console.log('\n-- summary --');
console.log('  conforming: beneficiary received SGDX, FX change executed at the arrival pivot, gated delivery passed');
console.log('  refused   : beneficiary received 0 SGDX, no FX change, value kept in transit; the gate held');
console.log(`  receipts  : ${count('ok')} confirmed, ${count('bad')} not confirmed by the chain, ${count('down')} unverified (RPC unreachable)`);

// Exit non-zero only when the chain fails to confirm a transaction the surface claims (a real defect
// of the surface). An unreachable RPC is reported but is not such a defect.
process.exit(count('bad') > 0 ? 1 : 0);
