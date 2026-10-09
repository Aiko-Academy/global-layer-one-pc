# LayerZero: cross-chain transport (credited by reference)

The toolkit uses LayerZero as its cross-chain transport: the leader for reach across EVM networks.
We write our own OApp / OFT / OFTAdapter on the permissive messaging layer and call endpoints that are
already deployed; we never embed the non-redistributable plumbing.

- Upstream: LayerZero-Labs/LayerZero-v2 (git submodule in the private toolkit; not vendored here).
- Compliance hook: LayerZero does not offer a first-class policy hook (CCIP does). We add it as an
  override of `_debit` (source) and `_credit` (destination) in a `ComplianceOFTAdapter` whose
  `innerToken` is the Policy Wrapper; the lock (`transferFrom`) and unlock (`transfer`) are, by
  construction, gated transfers. The attestation travels in the OFT `composeMsg` and is consumed by
  `setContext` on the destination before delivery.
- Licence: consumed through the permissive messaging layer only. A deployment with designated
  participants reviews the commercial licence before hosting any plumbing.
