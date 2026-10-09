// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IPolicyWrapper
/// @notice Le Policy Wrapper du whitepaper GL1 : un ERC-20 qui emballe un jeton sous-jacent un pour un
///         (lock-and-mint), transfere sous politique (le Policy Manager evalue chaque transfert avec
///         l'attestation mise en contexte), se deballe, et porte l'Administrative Control : restriction
///         d'adresse, gel, transfert force, pause.
interface IPolicyWrapper is IERC20 {
    event TokenWrap(address indexed from, address indexed to, uint256 amount, address underlying);
    event TokenUnwrap(address indexed from, address indexed to, uint256 amount, address underlying);
    event ContextSet(address indexed sender, bytes32 contextHash);
    event AddressRestricted(address indexed account, bool restricted, string reason);
    event BalanceFrozen(address indexed account, uint256 amount, string reason);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount, string reason);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    error WrapperPaused();
    error AccountRestricted(address account);
    error InsufficientUnfrozenBalance(address account, uint256 available, uint256 needed);
    error PolicyManagerNotSet();

    /// @notice Met en contexte, pour l'appelant, l'attestation que le prochain transfert gate consommera.
    function setContext(bytes calldata context) external;

    /// @notice Emballe `amount` de sous-jacent, pris chez l'appelant, au profit de `to`.
    function depositFor(address to, uint256 amount) external returns (bool);

    /// @notice Deballe `amount` de l'appelant vers `to`.
    function withdrawTo(address to, uint256 amount) external returns (bool);

    /// @dev `underlying()` est servi par ERC20Wrapper d'OpenZeppelin, non virtuel : il ne se declare pas ici.
    function policyManager() external view returns (address);

    // ── Administrative Control ─────────────────────────────────────────────────────────────────────────
    function restrict(address account, bool restricted, string calldata reason) external;
    function isRestricted(address account) external view returns (bool);
    function freeze(address account, uint256 amount, string calldata reason) external;
    function frozenOf(address account) external view returns (uint256);
    function forcedTransfer(address from, address to, uint256 amount, string calldata reason) external;
    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);
}
