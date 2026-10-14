# RUNBOOK: verifying the PC exposure surface

This runbook is the companion to the offline delivery gate described in the README. It sets out, step
by step, how an institutional counterparty checks that this
surface is exactly what it claims to be. Verification has two layers: an offline layer that needs no
network, and an on-chain layer that reads the public test networks.

## 1. Offline reproducibility (no network)

Enable the gates once per clone, then run the offline gate:

```
git config core.hooksPath .githooks
node scripts/ci/tous.mjs --rapide
```

The gate (`scripts/ci/check-handoff.mjs`) recomputes the sha256 of every published artifact against
`MANIFEST.json` and refuses:

- any artifact whose digest no longer matches the manifest (a drift);
- any file under `abi/`, `interfaces/` or `deployments/` not declared in the manifest (the surface is
  exactly the manifest);
- any licence outside the whitelist (AGPL-3.0, GPL-3.0, MIT, data), and any non-redistributable licence
  declaration (BUSL, the LayerZero source-available licence, or an unlicensed artifact);
- any tool trace in the surface read by the counterparty;
- any invented address in a tracker (zero, or not in EIP-55 mixed-case checksum).

A green gate proves the digests, the perimeter, the licences, the absence of tool traces, and the
checksum shape of every address. It does not join the chain: that is layer 2.

## 2. On-chain, from the surface alone

Every address in `deployments/` is a live contract on a public test network. A reader who holds only
this surface confirms each address on its explorer and, for the LayerZero legs, cross-checks the
endpoint and the endpoint id against LayerZero's own published deployments.

| role | network | chain id | LayerZero EID | address source |
|---|---|---|---|---|
| production reference deployment | Ethereum Hoodi testnet | 560048 | n/a | `deployments/560048-*.json` (chain id in the file name) |
| cross-border demonstration, source (EUR) | Ethereum Sepolia | 11155111 | 40161 | `deployments/11155111-layerzero-leg.json` |
| cross-border demonstration, destination (SGD) | Arbitrum Sepolia | 421614 | 40231 | `deployments/421614-layerzero-leg.json` |

Both LayerZero legs share the Endpoint V2 at `0x6EDCE65403992e310A62460808c4b910D972f10f`. The explorer
for each leg is named in its tracker (`sepolia.etherscan.io`, `sepolia.arbiscan.io`).

The leg contracts are OpenZeppelin 4.9 representations with a reduced interface, deployed only for this
demonstration: they are not the production contracts and are not described by the production ABIs in
`abi/`. The production contracts are the `560048` tracker set, whose contracts match those ABIs. The
stablecoins on the legs are demonstration ERC-20 tokens, never central bank money, which is never
issued on a public chain. The same address string can denote different contracts on different chains:
deployment is deterministic by deployer and nonce, and each tracker is read on its own chain id.

### Replaying the FX corridor from the surface

The FX cross-chain corridor (EURX to SGD, changed at the arrival pivot by a Uniswap V3 pool and gated
by the Policy Wrapper) carries its two demonstration passes in `deployments/fx-corridor.json`, under
`demonstration_passes`: the conforming pass that settled, and the refused pass where delivery to an
unidentified beneficiary was refused with no FX change. A reader holding only this surface replays both
end to end, reading each receipt live on the public RPC:

```
node scripts/demo/corridor-fx-e2e.mjs
```

For each leg it prints the block, the EVM status, the transaction target cross-checked against a named
corridor contract, and the explorer link, then the business outcome of each pass. It is read only: it
joins the public chains, signs nothing and holds no key (point it at your own node with `--rpc-sepolia`
and `--rpc-arbitrum` if you prefer the public endpoints not be used). Both arrival transactions carry
EVM status success; the refusal is semantic, so the proof of refusal is the pair beneficiary receives 0
SGDX and the pool is unchanged, not a reverted transaction.

## 3. On-chain, bytecode against source (participant holding the toolkit)

The strongest check compares the runtime bytecode deployed at each address to the bytecode compiled
from source. This needs the compiled artifacts, which are produced from the private toolkit build and
are not part of this surface. It is therefore the step run inside a deployment with designated
participants who hold that build, not from the surface alone. The procedure is:

1. compile the contracts under the profile that matches the deployment (the same compiler settings as
   the origin);
2. take the compiled `deployedBytecode` and strip the trailing CBOR metadata (its last two bytes give
   its length);
3. zero out the immutable reference ranges on both sides: the compiler reports where they are, because
   an immutable such as a manager address is written into the code at deployment;
4. read the on-chain code with `eth_getCode` at the address, and strip its CBOR metadata the same way;
5. compare. Equal, outside metadata and immutables, means the deployed contract is this source.

In the toolkit this is implemented as `scripts/verifier-bytecode.mjs`. It is named here so a
participant knows where it lives; it stays out of this surface because it depends on the build.

## 4. Provenance

`MANIFEST.json` records `source_commit`: the toolkit commit the reproducible artifacts (`abi/` and
`interfaces/`) are cut from. Those artifacts are unchanged since that commit. The LayerZero testnet
legs were deployed later, as on-chain demonstration data: their trackers carry the `data` licence, are
read from the chain, and make no reproducibility claim against `source_commit`. The `source_commit` is
a bare commit fingerprint, never a private path or repository name.

## 5. What is not in this surface

- the LayerZero plumbing (endpoints, libraries) under its own source-available commercial licence: it
  is consumed through the permissive messaging layer and credited by reference, never embedded here;
- the session attestation seal used in the demonstration (a secp256k1 test key): it is kept out of the
  surface; in production the attestation is validated against the P-256 `InstitutionSignatureVerifier`
  (`abi/InstitutionSignatureVerifier.json`), see `references/layerzero.md`;
- any private key, mnemonic or secret: none is ever part of this surface.
