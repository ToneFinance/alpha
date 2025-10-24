// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SectorVault} from "../src/SectorVault.sol";
import {MockOracle} from "../src/MockOracle.sol";

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

        // Deploy mock AI tokens and setup basket
        (address[] memory underlyingTokens, uint256[] memory targetWeights) = _deployAiTokens();

        // Deploy mock oracle
        MockOracle oracle = new MockOracle();
        console.log("MockOracle deployed at:", address(oracle));

        // Set all token prices to 1 USDC (1000000 with 6 decimals)
        uint256[] memory prices = new uint256[](underlyingTokens.length);
        uint8[] memory decimals = new uint8[](underlyingTokens.length);
        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            prices[i] = 1_000_000; // $1.00 in 6 decimals
            decimals[i] = 18; // All mock tokens have 18 decimals
        }
        oracle.setPrices(underlyingTokens, prices);
        oracle.setTokenDecimalsBatch(underlyingTokens, decimals);
        console.log("Set all token prices to $1.00 and decimals to 18");

        // Deploy vault
        SectorVault vault = new SectorVault(
            USDC_BASE_SEPOLIA,
            "Tone AI Sector",
            "tAI",
            underlyingTokens,
            targetWeights,
            fulfillmentEngine, // fulfillment role
            address(oracle) // oracle
        );

        console.log("SectorVault deployed at:", address(vault));
        console.log("SectorToken deployed at:", address(vault.SECTOR_TOKEN()));
        console.log("Quote token (USDC):", USDC_BASE_SEPOLIA);
        console.log("Fulfillment role set to:", fulfillmentEngine);

        // Verify fulfillment role is set correctly
        require(vault.fulfillmentRole() == fulfillmentEngine, "Fulfillment role mismatch");

        // Transfer tokens to fulfillment engine if it's different from deployer
        if (fulfillmentEngine != deployer) {
            _transferTokensToFulfillmentEngine(underlyingTokens, fulfillmentEngine);
        }

        console.log("\n=== Deployment Complete ===");
        console.log("Vault Address:", address(vault));
        console.log("Sector Token Address:", address(vault.SECTOR_TOKEN()));
        console.log("\nNext steps:");
        console.log("1. Ensure fulfillment engine has underlying tokens");
        console.log("2. Test deposit flow with a small amount");
        console.log("3. Monitor fulfillment engine logs");

        vm.stopBroadcast();
    }

    function _deployAiTokens() internal returns (address[] memory, uint256[] memory) {
        // For alpha/demo, we'll deploy mock underlying tokens
        // In production, these would be actual AI protocol tokens
        address[] memory tokens = new address[](10);

        tokens[0] = address(new MockToken("0x0", "0X0"));
        console.log("Mock Token 1 (0X0) deployed at:", tokens[0]);

        tokens[1] = address(new MockToken("Arkham", "ARKM"));
        console.log("Mock Token 2 (ARKM) deployed at:", tokens[1]);

        tokens[2] = address(new MockToken("Fetch.ai", "FET"));
        console.log("Mock Token 3 (FET) deployed at:", tokens[2]);

        tokens[3] = address(new MockToken("Kaito", "KAITO"));
        console.log("Mock Token 4 (KAITO) deployed at:", tokens[3]);

        tokens[4] = address(new MockToken("NEAR Protocol", "NEAR"));
        console.log("Mock Token 5 (NEAR) deployed at:", tokens[4]);

        tokens[5] = address(new MockToken("Nosana", "NOS"));
        console.log("Mock Token 6 (NOS) deployed at:", tokens[5]);

        tokens[6] = address(new MockToken("PAAL AI", "PAAL"));
        console.log("Mock Token 7 (PAAL) deployed at:", tokens[6]);

        tokens[7] = address(new MockToken("Render", "RENDER"));
        console.log("Mock Token 8 (RENDER) deployed at:", tokens[7]);

        tokens[8] = address(new MockToken("Bittensor", "TAO"));
        console.log("Mock Token 9 (TAO) deployed at:", tokens[8]);

        tokens[9] = address(new MockToken("Virtual Protocol", "VIRTUAL"));
        console.log("Mock Token 10 (VIRTUAL) deployed at:", tokens[9]);

        // Equal weights: 10% each (1000 basis points each = 10000 total)
        uint256[] memory weights = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            weights[i] = 1000;
        }

        return (tokens, weights);
    }

    function _transferTokensToFulfillmentEngine(address[] memory tokens, address fulfillmentEngine) internal {
        uint256 transferAmount = 500_000 * 10 ** 18; // 500k tokens
        string[10] memory symbols = ["0X0", "ARKM", "FET", "KAITO", "NEAR", "NOS", "PAAL", "RENDER", "TAO", "VIRTUAL"];

        console.log("\n=== Transferring tokens to fulfillment engine ===");

        for (uint256 i = 0; i < tokens.length; i++) {
            MockToken token = MockToken(tokens[i]);
            require(token.transfer(fulfillmentEngine, transferAmount), string.concat(symbols[i], " transfer failed"));
            console.log(string.concat("Transferred 500k ", symbols[i], " to fulfillment engine"));
        }
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
