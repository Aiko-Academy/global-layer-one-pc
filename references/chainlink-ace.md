# Chainlink ACE: compliance-engine model (credited by reference)

We take the **model** of Chainlink ACE (Automated Compliance Engine), not its stack. ACE is BUSL-1.1
in full: we study the interface and the pattern and copy no line into this surface.

- Pattern reused: a policy applied as a hook, source and destination, with a `PolicyEngine` resolving
  `Policy` contracts through extractors. We align the Policy Wrapper gating on the ACE
  `PolicyProtectedBase` shape (`Payload{selector, sender, data, context}`, `setContext`, `_gate`), so a
  Policy Manager and a Policy Engine become interchangeable.
- What we do NOT take: the Chainlink transport (Router, DON, CCIP token pools). The transport is
  LayerZero; the off-chain verdict comes from the node's Compliance Rules Engine (signed check results,
  P-256 or TEE), verified by `AttestationValidatorPolicy` / `InstitutionSignatureVerifier` /
  `ZkCheckRegistry`, not a Chainlink DON.
- Licence: no ACE code is redistributed here. The model is credited; the implementation is ours (AGPL-3.0).
