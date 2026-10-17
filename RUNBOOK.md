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

### Two exchange routes at arrival

The arrival composer (`COMPOSER_ARBITRUM_FX` in `deployments/fx-corridor.json`) knows two routes, fixed in the
contract: route 0 swaps EURX to SGDX in the direct pool, route 1 swaps EURX to USDX to SGDX through two pivot
pools. The compose payload carries the route as one byte. A read-only agent quotes both routes on the chain and
picks the higher SGDX output; the contract only accepts a route identifier, and the floor `minOut` applies to
the final SGDX, so a wrong choice can only make the whole call fail. All pools hold base tokens (EURX, USDX,
SGDX), never wrappers. USDX is a demonstration base token with no wrapper: it exists only inside the router
call, and compliance applies to the transfer of the wrapped SGDX. The first two passes used the earlier
single-route composer (`COMPOSER_ARBITRUM_FX_single_route`), and the pivot pass the two-route composer
(`COMPOSER_ARBITRUM_FX_two_routes_v2`); both stay registered on the arrival adapter, as does the very first composer
(`COMPOSER_ARBITRUM_FX_first_composer`).
`scripts/demo/corridor-fx-e2e.mjs` replays the route 1 pass (`demonstration_passes.pivot`) and checks that both
pivot pools moved, that the direct pool did not, and that the composer never held USDX.

To see which route the agent would pick right now, read-only:

```
node scripts/demo/route-agent.mjs [--amount 50] [--tol-bps 30]
```

It checks on the chain that the three tokens of the paths and the three pools are base tokens (it refuses
if one is a wrapper), quotes both routes with the QuoterV2, and prints the choice with its reason, then a
`GL1_FX_ROUTE={...}` line (route, converted amount, floor `minOut`). At the calibrated state the direct
route wins by a fraction of a basis point: both routes start from the same USD-pivot reference, and the
pivot pays one more fee. The choice only flips when a pool is unbalanced.

### Returning a refused amount

A refused delivery used to leave the wrapped EURX with the composer and no way out. The current composer
(`COMPOSER_ARBITRUM_FX`) records each refusal by guid, with the original payer read from the compose message, and
`returnToSource` sends the amount back through the bridge. Only the payer or the operator can call it, once per guid:

1. the composer's wEURX goes to the arrival adapter and is burned there, and the reserve gets the same amount of EURX back
   (this transfer passes through the arrival wrapper's compliance pipeline, like every other leg);
2. the adapter trace (`inboundComposer`, `inboundAmount`) is consumed, so a guid cannot be returned twice;
3. on the source chain the lock is released and `RETURN_RECEIVER` hands the wEURX back to the payer by a gated transfer.
   If the source policy refuses (for example an expired attestation), the wEURX stays with the receiver and a `pending`
   entry is settled by `claim` with a fresh attestation: no funds sit in a compose queue.

`scripts/demo/corridor-fx-e2e.mjs` replays this pass (`demonstration_passes.returned`) and checks that exactly the
refused amount left the composer, was burned, came back to the reserve and reached the payer. Two older composers
hold wEURX recorded before this path existed; their code has no approve or transfer, so that stock stays in place,
backed by the wrapper's EURX.

Gas on the source chain matters: a return needs `lzReceive` gas of about 920,000 (a 500,000 cap dies with an empty
revert) and the compose step a few million; the sender script uses 1,500,000 and 6,000,000.

`scripts/demo/wiring-check.mjs` now also replays the `ComposerSet` events of each adapter and requires the set of
registered composers to equal the announced list in `deployments/fx-corridor.json`.

### Checking the pinned LayerZero pathway

Since 2026-10-16 the pathway of the FX corridor is set by the application on both chains: explicit send and
receive libraries, ULN config (2 confirmations, one required DVN), executor, and enforced gas options. Before,
only the peer was set and everything else ran on the LayerZero defaults. The expected values are in
`deployments/fx-corridor.json`, under `wiring`. To read them back from the chains:

```
node scripts/demo/wiring-check.mjs
```

It reads the raw values set by the application (not the merged effective value, which cannot tell a pinned
setting from an inherited one), prints one line per check, and exits with code 1 if any check differs or if an
RPC does not answer. It is read only and has no dependency. The script that sets these values is
`scripts/wiring/WireLZ.s.sol` (see `scripts/wiring/README.md`).

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
