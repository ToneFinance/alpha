// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SectorVault} from "../src/SectorVault.sol";

/**
 * @title DeploySectorVault
 * @notice Deployment script for TONE Finance sector vaults
 * @dev Run with: forge script script/DeploySectorVault.s.sol:DeploySectorVault --rpc-url base_sepolia --broadcast --verify
 */
contract DeploySectorVault is Script {
    // Base Sepolia USDC (for testing, you may need to deploy a mock or use faucet)
    // Note: Update these addresses with actual Base Sepolia token addresses
    address constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e; // This is a common testnet USDC

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Try to get fulfillment engine address from env, otherwise use deployer
        address fulfillmentEngine;
        try vm.envAddress("FULFILLMENT_ENGINE") returns (address engineAddr) {
            fulfillmentEngine = engineAddr;
        } catch {
            fulfillmentEngine = deployer;
        }

        console.log("Deploying contracts with account:", deployer);
        console.log("Account balance:", deployer.balance);
        console.log("Fulfillment engine address:", fulfillmentEngine);

        vm.startBroadcast(deployerPrivateKey);

        // For alpha/demo, we'll deploy mock underlying tokens
        // In production, these would be actual DeFi protocol tokens
        MockToken token1 = new MockToken("Wrapped ETH", "WETH");
        MockToken token2 = new MockToken("Uniswap", "UNI");
        MockToken token3 = new MockToken("Aave", "AAVE");

        console.log("Mock Token 1 (WETH) deployed at:", address(token1));
        console.log("Mock Token 2 (UNI) deployed at:", address(token2));
        console.log("Mock Token 3 (AAVE) deployed at:", address(token3));

        // Set up basket composition
        address[] memory underlyingTokens = new address[](3);
        underlyingTokens[0] = address(token1);
        underlyingTokens[1] = address(token2);
        underlyingTokens[2] = address(token3);

        // Equal weights: 33.33%, 33.33%, 33.34%
        uint256[] memory targetWeights = new uint256[](3);
        targetWeights[0] = 3333;
        targetWeights[1] = 3333;
        targetWeights[2] = 3334;

        // Deploy vault
        SectorVault vault = new SectorVault(
            USDC_BASE_SEPOLIA,
            "DeFi Blue Chip Sector",
            "DEFI",
            underlyingTokens,
            targetWeights,
            fulfillmentEngine // fulfillment role
        );

        console.log("SectorVault deployed at:", address(vault));
        console.log("SectorToken deployed at:", address(vault.sectorToken()));
        console.log("Quote token (USDC):", USDC_BASE_SEPOLIA);
        console.log("Fulfillment role set to:", fulfillmentEngine);

        // Verify fulfillment role is set correctly
        require(vault.fulfillmentRole() == fulfillmentEngine, "Fulfillment role mismatch");

        // Transfer tokens to fulfillment engine if it's different from deployer
        if (fulfillmentEngine != deployer) {
            uint256 transferAmount = 500_000 * 10 ** 18; // 500k tokens

            console.log("\n=== Transferring tokens to fulfillment engine ===");
            require(token1.transfer(fulfillmentEngine, transferAmount), "WETH transfer failed");
            console.log("Transferred 500k WETH to fulfillment engine");

            require(token2.transfer(fulfillmentEngine, transferAmount), "UNI transfer failed");
            console.log("Transferred 500k UNI to fulfillment engine");

            require(token3.transfer(fulfillmentEngine, transferAmount), "AAVE transfer failed");
            console.log("Transferred 500k AAVE to fulfillment engine");
        }

        console.log("\n=== Deployment Complete ===");
        console.log("Vault Address:", address(vault));
        console.log("Sector Token Address:", address(vault.sectorToken()));
        console.log("\nNext steps:");
        console.log("1. Ensure fulfillment engine has underlying tokens");
        console.log("2. Test deposit flow with a small amount");
        console.log("3. Monitor fulfillment engine logs");

        vm.stopBroadcast();
    }
}

/**
 * @notice Mock ERC20 token for testing
 * @dev Only for demo/testing purposes
 */
contract MockToken {
    string public name;
    string public symbol;
    uint8 public constant DECIMALS = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        // Mint 1M tokens to deployer
        _mint(msg.sender, 1_000_000 * 10 ** DECIMALS);
    }

    function decimals() public pure returns (uint8) {
        return DECIMALS;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
