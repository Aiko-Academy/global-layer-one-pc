# LayerZero: cross-chain transport (credited by reference)

The toolkit uses LayerZero as its cross-chain transport: the leader for reach across EVM networks.
We write our own OApp / OFT / OFTAdapter on the permissive messaging layer and call endpoints that are
already deployed; we never embed the non-redistributable plumbing.

- Upstream: LayerZero-Labs/LayerZero-v2 (git submodule in the private toolkit; not vendored here).
- Compliance hook: LayerZero does not offer a first-class policy hook (CCIP does). We add it as an
  override of `_debit` (source) and `_credit` (destination) in a `ComplianceOFTAdapter` whose
  `innerToken` is the Policy Wrapper. On the source, `_debit` pulls the wrapped token from the payer
  by `transferFrom` (a transfer gated by the Policy Manager) and withdraws the underlying into the
  adapter, locking it; the wrapped supply at the source returns to zero. On the destination, `_credit`
  releases the wrapped token from a pre-financed reserve held by the adapter, through the wrapper's
  ungated deposit, with no mint: this is the OFTAdapter lock and release model. The compliance
  attestation travels in the OFT compose message, and the final delivery to the beneficiary is a
  gated transfer that runs the policies against that attestation.
- Licence: consumed through the permissive messaging layer only. A deployment with designated
  participants reviews the commercial licence before hosting any plumbing.
