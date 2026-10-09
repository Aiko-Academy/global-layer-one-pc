// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPolicy
/// @notice Une politique du Policy Manager. Le Policy Manager les appelle dans l'ordre pose pour une cible et
///         une operation ; chacune rend `Continue` (rien a redire, la suivante decide), `Allowed` (la chaine
///         s'arrete la, accordee) ou refuse en revertant `PolicyRejected(reason)`. Une politique de presence
///         ou de liaison ne rend JAMAIS `Allowed` : le manager s'arreterait avant celles qui suivent.
interface IPolicy {
    /// @dev None = 0, Allowed = 1, Continue = 2 : les politiques deployees mirent cet ordre, ne pas le changer.
    enum PolicyResult {
        None,
        Allowed,
        Continue
    }

    /// @notice Le refus d'une politique. Le manager l'enveloppe dans `PolicyRunRejected` avec son adresse.
    error PolicyRejected(string reason);

    /// @notice Appele par le manager quand la politique est posee sur une operation.
    function onInstall(bytes4 selector) external;

    /// @notice Appele par le manager quand la politique est retiree d'une operation.
    function onUninstall(bytes4 selector) external;

    /// @notice L'evaluation. `parameters` sont les valeurs extraites de l'appel, dans l'ordre des noms
    ///         declares a la pose ; `context` est la Compliance Attestation que l'appelant a mise en contexte.
    function run(address caller, address subject, bytes4 selector, bytes[] calldata parameters, bytes calldata context)
        external
        view
        returns (PolicyResult);

    /// @notice L'ecriture apres evaluation (usage unique d'une attestation, par exemple). Memes arguments.
    function postRun(address caller, address subject, bytes4 selector, bytes[] calldata parameters, bytes calldata context)
        external;

    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
