#!/usr/bin/env node
// Garde de livraison de la surface d'exposition. Refuse, HORS LIGNE (ne joint ni chaine ni depot
// voisin), ce qui ne doit pas partir chez un tiers (une contrepartie institutionnelle externe) :
//
//   1. une DERIVE : un artefact dont l'empreinte ne reproduit plus celle du MANIFEST ;
//   2. un fichier NON DECLARE sous abi/ interfaces/ deployments/ (surface = exactement le MANIFEST) ;
//   3. une LICENCE non redistribuable (BUSL-1.1, LZBL, UNLICENSED) ou hors liste blanche ;
//   4. une TRACE D'OUTIL (mention d'un assistant, co-auteur machine) dans la surface lue par le tiers ;
//   5. une ADRESSE INVENTEE : nulle, ou non checksummee EIP-55 (casse mixte attendue).
//
// La verification du bytecode DEPLOYE contre la source (etape en ligne, RPC) vit dans le RUNBOOK :
// ce garde reste offline pour pouvoir refuser AVANT un push, en une seconde, sans dependre du reseau.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = process.cwd();
let refus = 0;
const dire = (m) => { console.error('  REFUS: ' + m); refus++; };

// Aiguilles construites par fragments pour que CE fichier ne porte pas les litteraux qu'il traque.
const TRACES = [['Co-', 'Authored-', 'By'].join(''), ['Clau', 'de'].join(''),
  ['Anthro', 'pic'].join(''), ['Generated ', 'with'].join(''), ['Cop', 'ilot'].join('')];
// Une licence interdite se juge sur une DECLARATION SPDX reelle dans un artefact, pas sur une prose
// qui explique la politique (une doc a le droit de nommer BUSL pour dire qu'on l'exclut).
const SPDX_INTERDIT = new RegExp('SPDX-License-Identifier:\\s*(BUSL-1\\.1|' + ['LZ', 'BL'].join('') + '[-\\w.]*|UNLICENSED)');
const CADRATIN = String.fromCharCode(0x2014);
const LICENCES_OK = new Set(['AGPL-3.0', 'GPL-3.0', 'data']);
const ZERO = '0x' + '0'.repeat(40);

// 1 + 2 : MANIFEST charge, empreintes recomputees, surface = exactement les fichiers declares.
const manifest = JSON.parse(readFileSync(join(RACINE, 'MANIFEST.json'), 'utf8'));
const declares = new Set(Object.keys(manifest.fichiers));
for (const [rel, meta] of Object.entries(manifest.fichiers)) {
  const p = join(RACINE, rel);
  if (!existsSync(p)) { dire(`${rel} declare au MANIFEST mais absent du disque`); continue; }
  const h = createHash('sha256').update(readFileSync(p)).digest('hex');
  if (h !== meta.sha256) dire(`${rel} a derive : empreinte ${h.slice(0, 12)} != MANIFEST ${meta.sha256.slice(0, 12)}`);
  if (!LICENCES_OK.has(meta.licence)) dire(`${rel} porte une licence hors liste blanche : ${meta.licence}`);
}
for (const dir of ['abi', 'interfaces', 'deployments']) {
  for (const f of (existsSync(join(RACINE, dir)) ? readdirSync(join(RACINE, dir)) : [])) {
    if (f.startsWith('.')) continue;
    if (!declares.has(`${dir}/${f}`)) dire(`${dir}/${f} present sur le disque mais non declare au MANIFEST (surface = le MANIFEST)`);
  }
}

// 3 + 4 : la surface lue par le tiers (artefacts + docs), jamais le tooling qui NOMME les regles.
function fichiersSurface() {
  const out = [];
  const marche = (d) => {
    const abs = join(RACINE, d);
    if (!existsSync(abs)) return;
    for (const f of readdirSync(abs, { withFileTypes: true })) {
      if (f.name.startsWith('.')) continue;
      const rel = d ? `${d}/${f.name}` : f.name;
      if (f.isDirectory()) marche(rel);
      else out.push(rel);
    }
  };
  ['abi', 'interfaces', 'deployments', 'references', 'scripts', '.githooks'].forEach(marche);
  for (const f of ['README.md', 'RUNBOOK.md', 'MANIFEST.json']) if (existsSync(join(RACINE, f))) out.push(f);
  return out;
}
for (const rel of fichiersSurface()) {
  const txt = readFileSync(join(RACINE, rel), 'utf8');
  for (const t of TRACES) if (txt.includes(t)) dire(`${rel} porte une trace d'outil (${t})`);
  const spdx = txt.match(SPDX_INTERDIT);
  if (spdx) dire(`${rel} declare une licence non redistribuable (${spdx[1]})`);
  if (txt.includes(CADRATIN)) dire(`${rel} porte un cadratin (couche 0 : jamais de tiret cadratin)`);
}

// 5 : adresses inventees dans les traceurs (0x + 40 hex ; on ignore les hash 32 octets et les nombres).
function adresses(val, acc = []) {
  if (typeof val === 'string') { if (/^0x[0-9a-fA-F]{40}$/.test(val)) acc.push(val); }
  else if (Array.isArray(val)) val.forEach((v) => adresses(v, acc));
  else if (val && typeof val === 'object') Object.values(val).forEach((v) => adresses(v, acc));
  return acc;
}
for (const f of (existsSync(join(RACINE, 'deployments')) ? readdirSync(join(RACINE, 'deployments')) : [])) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(readFileSync(join(RACINE, 'deployments', f), 'utf8'));
  for (const a of adresses(j)) {
    if (a.toLowerCase() === ZERO) dire(`deployments/${f} : adresse nulle ${a}`);
    const corps = a.slice(2);
    if (corps === corps.toLowerCase() || corps === corps.toUpperCase())
      dire(`deployments/${f} : adresse non checksummee EIP-55 (casse uniforme) ${a} -> inventee ou placeholder`);
  }
}

if (refus) { console.error(`\ncheck-handoff : ${refus} refus. La surface NE PART PAS.`); process.exit(1); }
console.log('check-handoff : surface propre (empreintes, perimetre, licences, traces, adresses).');
