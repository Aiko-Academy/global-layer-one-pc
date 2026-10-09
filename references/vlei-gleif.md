# vLEI (GLEIF): verifiable organisational identity (credited by reference)

Know-your-business is carried by a **vLEI credential** (GLEIF verifiable Legal Entity Identifier).
Legal Entity Identifiers are resolved at GLEIF, never derived from a name.

- Integration: `VLEICredentialDataValidator` specialises a cross-chain identity model
  (`IdentityRegistry`, `CredentialRegistry`, `TrustedIssuerRegistry`). `IdentityGatedPolicy` requires
  both originator and beneficiary to hold a compliance account id (CCID) plus a valid vLEI.
- Identifiers: entity identifiers are issued and registered on chain; a LEI is relied upon only when
  resolved at GLEIF, never invented.
- Licence: GLEIF specifications and trust chain are credited by reference; our validator and registries
  are MIT and published in `abi/` and `interfaces/`.
