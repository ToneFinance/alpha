// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SectorToken
 * @notice ERC20 token representing shares in a sector vault
 * @dev Only the vault (owner) can mint and burn tokens
 */
contract SectorToken is ERC20, Ownable {
    /**
     * @notice Creates a new sector token
     * @param name Token name (e.g., "DeFi Sector Token")
     * @param symbol Token symbol (e.g., "DEFI")
     * @param vault Address of the vault that can mint/burn tokens
     */
    constructor(string memory name, string memory symbol, address vault) ERC20(name, symbol) Ownable(vault) {}

    /**
     * @notice Mints new sector tokens
     * @dev Only callable by the vault (owner)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burns sector tokens
     * @dev Only callable by the vault (owner)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }
}
