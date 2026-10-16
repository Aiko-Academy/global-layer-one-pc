#!/usr/bin/env node
// scripts/demo/wiring-check.mjs
//
// Reads the LayerZero pathway of the FX corridor on both public test networks and compares it with the
// values pinned in deployments/fx-corridor.json under "wiring". For each chain it checks the peer, the
// send and receive libraries (explicitly set, not the default), the send and receive ULN config, the
// executor, and the enforced options.
//
// It reads the RAW values set by the application (getAppUlnConfig, executorConfigs), not the merged
// "effective" value, because only the raw value tells a pinned setting from an inherited default.
//
// Read only. No build, no private key, no dependency: JSON-RPC over fetch. Exit code 1 if any check
// differs, so the verdict is read from the exit code, not from a log.
//
//   node scripts/demo/wiring-check.mjs
//
// Needs Node 18+ (global fetch). Options:
//   --rpc-sepolia <url>    override the Ethereum Sepolia endpoint
//   --rpc-arbitrum <url>   override the Arbitrum Sepolia endpoint
//   --tracker <file>       read the expected values from another tracker file (default: the surface's own)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };

const tracker = JSON.parse(readFileSync(opt('--tracker', join(ROOT, 'deployments', 'fx-corridor.json')), 'utf8'));
const wiring = tracker.wiring;
if (!wiring) { console.error('the tracker carries no "wiring" block'); process.exit(2); }
const ENDPOINT = tracker.lzEndpointV2;

const CHAINS = [
  { key: 'source', name: 'Ethereum Sepolia', rpc: opt('--rpc-sepolia', 'https://ethereum-sepolia-rpc.publicnode.com') },
  { key: 'destination', name: 'Arbitrum Sepolia', rpc: opt('--rpc-arbitrum', 'https://sepolia-rollup.arbitrum.io/rpc') },
];

// 4-byte selectors of the read functions used below.
const SEL = {
  peers: '0xbb0b6a53', getSendLibrary: '0xb96a277f', isDefaultSendLibrary: '0xdc93c8a2',
  getReceiveLibrary: '0x402f8468', getAppUlnConfig: '0x39e3f938', executorConfigs: '0x4d963200',
  enforcedOptions: '0x5535d461', eid: '0x416ecebf', owner: '0x8da5cb5b', delegates: '0x587cde1e',
};

const word = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const num = (n) => BigInt(n).toString(16).padStart(64, '0');
const lc = (a) => String(a).toLowerCase();
const addrOf = (w) => '0x' + w.slice(24);

async function ethCall(rpc, to, data) {
  const res = await fetch(rpc, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${to}: ${j.error.message}`);
  return j.result.replace(/^0x/, '');
}
const words = (hex) => hex.match(/.{64}/g) ?? [];

// getAppUlnConfig returns one dynamic struct: (uint64, uint8, uint8, uint8, address[], address[]).
function decodeUln(hex) {
  const w = words(hex);
  const base = Number(BigInt('0x' + w[0])) / 32; // offset of the struct, in words
  const s = (i) => w[base + i];
  const arr = (offWord) => {
    const at = base + Number(BigInt('0x' + offWord)) / 32;
    const n = Number(BigInt('0x' + w[at]));
    return Array.from({ length: n }, (_, k) => addrOf(w[at + 1 + k]));
  };
  return {
    confirmations: Number(BigInt('0x' + s(0))), requiredCount: Number(BigInt('0x' + s(1))),
    optionalCount: Number(BigInt('0x' + s(2))), threshold: Number(BigInt('0x' + s(3))),
    required: arr(s(4)), optional: arr(s(5)),
  };
}
// enforcedOptions returns `bytes`: offset word, length word, then the data.
function decodeBytes(hex) {
  const w = words(hex.padEnd(Math.ceil(hex.length / 64) * 64, '0'));
  const len = Number(BigInt('0x' + w[1]));
  return '0x' + hex.slice(128, 128 + len * 2);
}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => lc(x) === lc(b[i]));

let bad = 0;
const say = (ok, label) => { console.log(`  ${ok ? 'ok  ' : 'DIFF'}  ${label}`); if (!ok) bad++; };

for (const c of CHAINS) {
  const p = wiring[c.key];
  console.log(`\n== ${c.name} (chain ${p.chainId}), adapter ${p.adapter}`);
  try {
    const adapter = p.adapter;
    const eid = BigInt('0x' + (await ethCall(c.rpc, ENDPOINT, SEL.eid))).toString();
    say(Number(eid) === p.eid, `endpoint.eid() = ${eid}, expected ${p.eid} (witness: this is the right chain)`);

    const owner = addrOf(words(await ethCall(c.rpc, adapter, SEL.owner))[0]);
    const delegate = addrOf(words(await ethCall(c.rpc, ENDPOINT, SEL.delegates + word(adapter)))[0]);
    say(lc(owner) === lc(delegate), 'adapter delegate equals adapter owner');

    const peer = words(await ethCall(c.rpc, adapter, SEL.peers + num(p.remoteEid)))[0];
    say(addrOf(peer) === lc(p.remoteAdapter), `peer(${p.remoteEid}) is the remote adapter`);

    const isDefSend = BigInt('0x' + words(await ethCall(c.rpc, ENDPOINT, SEL.isDefaultSendLibrary + word(adapter) + num(p.remoteEid)))[0]) === 1n;
    const sendLib = addrOf(words(await ethCall(c.rpc, ENDPOINT, SEL.getSendLibrary + word(adapter) + num(p.remoteEid)))[0]);
    say(!isDefSend, 'send library is pinned (not the default)');
    say(lc(sendLib) === lc(p.sendLibrary), `send library is ${p.sendLibrary}`);

    const rw = words(await ethCall(c.rpc, ENDPOINT, SEL.getReceiveLibrary + word(adapter) + num(p.remoteEid)));
    say(BigInt('0x' + rw[1]) === 0n, 'receive library is pinned (not the default)');
    say(lc(addrOf(rw[0])) === lc(p.receiveLibrary), `receive library is ${p.receiveLibrary}`);

    for (const [label, lib] of [['send', p.sendLibrary], ['receive', p.receiveLibrary]]) {
      const u = decodeUln(await ethCall(c.rpc, lib, SEL.getAppUlnConfig + word(adapter) + num(p.remoteEid)));
      const ok = u.confirmations === p.confirmations && u.requiredCount === p.requiredDVNs.length && u.optionalCount === 255
        && u.threshold === 0 && sameList(u.required, p.requiredDVNs) && sameList(u.optional, p.optionalDVNs);
      say(ok, `${label} ULN: ${u.confirmations} confirmations, required DVN ${u.required.join(',')} (${p.requiredDVNNames.join(',')}), no optional DVN (explicit)`);
    }

    const ex = words(await ethCall(c.rpc, p.sendLibrary, SEL.executorConfigs + word(adapter) + num(p.remoteEid)));
    say(Number(BigInt('0x' + ex[0])) === p.maxMessageSize && lc(addrOf(ex[1])) === lc(p.executor), `executor ${p.executor}, max message ${p.maxMessageSize} bytes`);

    for (const [label, type] of [['SEND', 1], ['SEND_AND_CALL', 2]]) {
      const got = decodeBytes(await ethCall(c.rpc, adapter, SEL.enforcedOptions + num(p.remoteEid) + num(type)));
      say(got === p.enforcedOptions[label], `enforced options ${label}: ${got === '0x' ? 'none' : got}`);
    }
  } catch (e) {
    say(false, `read failed (${String(e.message).slice(0, 90)}); a silent RPC is not a pass`);
  }
}

console.log(bad === 0 ? '\nwiring-check: 0 difference. The pathway is pinned as the tracker says.' : `\nwiring-check: ${bad} difference(s).`);
process.exit(bad === 0 ? 0 : 1);
