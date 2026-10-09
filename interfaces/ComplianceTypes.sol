// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ComplianceTypes
/// @notice Les structures du whitepaper GL1 telles qu'elles voyagent sur chaine.
///
///         `CheckResult` et `AttestationItem` sont la forme que les politiques deployees decodent depuis le
///         contexte (`abi.encode(AttestationItem[])`) : un resultat de controle signe par une institution
///         (kind 0, cle P-256 dans le ComplianceKeyRegistry) ou par une cle de TEE endossee (kind 1). Les
///         noms de champs sont ceux des politiques deployees ; les changer changerait l'encodage.
///
///         `TransactionEnvelope` et `PartyPacket` (figure 2 du whitepaper) sont ce que le SDK construit hors
///         chaine ; sur chaine n'en passe que le condense (`envelopeHash`) et l'identifiant (`uetr`).
library ComplianceTypes {
    /// @notice Le resultat d'un controle, signe : c'est la moitie signee d'un `AttestationItem`.
    struct CheckResult {
        bytes16 uetr;
        string checkCode;
        bool verdict;
        bytes32 canonicalDataHash;
        bytes32 policyRef;
        uint256 timestamp;
    }

    /// @notice Un element de Compliance Attestation : un resultat, son signataire, sa signature P-256.
    struct AttestationItem {
        uint8 kind; // 0 : signature d'institution ; 1 : cle de TEE endossee
        bytes32 orgId;
        CheckResult sig;
        bytes32 r;
        bytes32 s;
        bytes32 qx;
        bytes32 qy;
    }

    /// @notice Un acteur de la transaction, reduit a ses identifiants a la construction.
    struct PartyPacket {
        bytes32 role; // keccak256("originator"), keccak256("beneficiary"), keccak256("liquidator")...
        address wallet;
        bytes2 jurisdiction; // ISO 3166-1 alpha-2
        bytes32 ccid; // l'identite resolue par l'Identity Manager, zero avant enrichissement
        bytes32 dataHash; // condense des donnees hors registre (Travel Rule), zero si aucune
    }

    /// @notice L'enregistrement structure qui voyage avec la transaction.
    struct TransactionEnvelope {
        bytes16 uetr;
        address asset;
        uint256 amount;
        uint64 datetime;
        bytes32 mediationPattern; // keccak256("Entity-to-Entity")...
        PartyPacket[] parties;
    }

    uint8 internal constant KIND_INSTITUTION = 0;
    uint8 internal constant KIND_TEE = 1;

    /// @notice Le condense d'une enveloppe : ce qu'un evidencing record designe.
    function hashEnvelope(TransactionEnvelope memory e) internal pure returns (bytes32) {
        return keccak256(abi.encode(e.uetr, e.asset, e.amount, e.datetime, e.mediationPattern, e.parties));
    }
}
