// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPolicy} from "./IPolicy.sol";

/// @title IPolicyManager
/// @notice Le Policy Manager du whitepaper GL1 : le point de coordination entre les Policy Wrappers et les
///         modules d'evaluation. Une cible (un wrapper) s'y attache ; pour chaque operation (selecteur) elle
///         porte une liste ordonnee de politiques, une version, un etat d'activation ; `run` les evalue dans
///         l'ordre et refuse au premier refus.
interface IPolicyManager {
    /// @notice Ce sur quoi les politiques travaillent : l'operation, l'appelant, les arguments, l'attestation.
    struct Payload {
        bytes4 selector;
        address sender;
        bytes data;
        bytes context;
    }

    /// @notice Une valeur extraite d'un appel, nommee (keccak256 du nom) pour etre distribuee aux politiques.
    struct Parameter {
        bytes32 name;
        bytes value;
    }

    event TargetAttached(address indexed target);
    event TargetDetached(address indexed target);
    event ExtractorSet(bytes4 indexed selector, address indexed extractor);
    event PolicyAdded(address indexed target, bytes4 indexed selector, address policy, uint256 position);
    event PolicyRemoved(address indexed target, bytes4 indexed selector, address policy);
    event ActivationSet(address indexed target, bytes4 indexed selector, bool active);
    event DefaultAllowSet(address indexed target, bool set, bool allow);
    event PolicyVersionBumped(address indexed target, uint64 version, string label);
    event PolicyRunComplete(address indexed sender, address indexed target, bytes4 indexed selector, uint64 version);

    error TargetAlreadyAttached(address target);
    error TargetNotAttached(address target);
    error InvalidConfiguration(string what);
    error UnsupportedSelector(bytes4 selector);
    error ExtractorError(bytes4 selector, address extractor, bytes err);
    error PolicyRunRejected(bytes4 selector, address policy, string reason);
    error PolicyRunError(bytes4 selector, address policy, bytes err);
    error PolicyPostRunError(bytes4 selector, address policy, bytes err);

    // ── attachement et extraction ──────────────────────────────────────────────────────────────────────
    function attach() external;
    function detach() external;
    function isAttached(address target) external view returns (bool);
    function setExtractor(bytes4 selector, address extractor) external;
    function getExtractor(bytes4 selector) external view returns (address);

    // ── la liste ordonnee, par cible et par operation ──────────────────────────────────────────────────
    function addPolicy(address target, bytes4 selector, address policy, bytes32[] calldata parameterNames) external;
    function addPolicyAt(
        address target,
        bytes4 selector,
        address policy,
        bytes32[] calldata parameterNames,
        uint256 position
    ) external;
    function removePolicy(address target, bytes4 selector, address policy) external;
    function getPolicies(address target, bytes4 selector) external view returns (address[] memory);
    function getPolicyParameterNames(address target, bytes4 selector, address policy)
        external
        view
        returns (bytes32[] memory);

    // ── version, activation, perimetre effectif, regle par defaut ──────────────────────────────────────
    /// @notice La version de politique d'une cible : incrementee a chaque changement de configuration.
    function policyVersion(address target) external view returns (uint64);
    /// @notice Le libelle pose avec la derniere version (par exemple "2026.09-01").
    function policyVersionLabel(address target) external view returns (string memory);
    /// @notice Pose un libelle et incremente la version, sans autre changement.
    function labelPolicyVersion(address target, string calldata label) external;
    /// @notice Le condense de la liste ordonnee pour une operation : ce qu'une attestation reference.
    function policyDescriptor(address target, bytes4 selector) external view returns (bytes32);
    /// @notice Active ou suspend l'evaluation pour une operation ; suspendue, la regle par defaut s'applique.
    function setActive(address target, bytes4 selector, bool active) external;
    function isActive(address target, bytes4 selector) external view returns (bool);
    /// @notice Le perimetre effectif d'une cible : les operations qui portent au moins une politique.
    function scopeOf(address target) external view returns (bytes4[] memory selectors);
    function setDefaultAllow(bool allow) external;
    function setTargetDefaultAllow(address target, bool set, bool allow) external;

    // ── l'evaluation ───────────────────────────────────────────────────────────────────────────────────
    /// @notice Evalue sans ecrire (pas de `postRun`). Reverte si refuse.
    function check(Payload calldata payload) external view;
    /// @notice Evalue et applique (`postRun` de chaque politique parcourue). Reverte si refuse.
    function run(Payload calldata payload) external;
}

/// @title IExtractor
/// @notice Extrait d'un appel les valeurs nommees que les politiques lisent (from, to, amount pour un ERC-20).
interface IExtractor {
    function extract(IPolicyManager.Payload calldata payload) external view returns (IPolicyManager.Parameter[] memory);
}
