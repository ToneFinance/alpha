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

    // Store deployed tokens globally to share between sectors
    mapping(string => address) private deployedTokens;

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

        // Deploy mock oracle (shared between both sectors)
        MockOracle oracle = new MockOracle();
        console.log("MockOracle deployed at:", address(oracle));

        // Deploy AI Sector
        console.log("\n========================================");
        console.log("=== DEPLOYING AI SECTOR ===");
        console.log("========================================");
        SectorVault aiVault = _deployAiSector(fulfillmentEngine, oracle);

        // Deploy Made in America Sector
        console.log("\n========================================");
        console.log("=== DEPLOYING MADE IN AMERICA SECTOR ===");
        console.log("========================================");
        SectorVault miaVault = _deployMadeInAmericaSector(fulfillmentEngine, oracle);

        // Transfer tokens to fulfillment engine if it's different from deployer
        if (fulfillmentEngine != deployer) {
            _transferAllTokensToFulfillmentEngine(fulfillmentEngine);
        }

        console.log("\n========================================");
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("========================================");
        console.log("\nAI Sector:");
        console.log("  Vault Address:", address(aiVault));
        console.log("  Sector Token Address:", address(aiVault.SECTOR_TOKEN()));
        console.log("\nMade in America Sector:");
        console.log("  Vault Address:", address(miaVault));
        console.log("  Sector Token Address:", address(miaVault.SECTOR_TOKEN()));
        console.log("\nShared:");
        console.log("  Oracle Address:", address(oracle));
        console.log("  Quote token (USDC):", USDC_BASE_SEPOLIA);
        console.log("\nNext steps:");
        console.log("1. Ensure fulfillment engine has underlying tokens");
        console.log("2. Test deposit flow with a small amount");
        console.log("3. Monitor fulfillment engine logs");

        vm.stopBroadcast();
    }

    function _deployAiSector(address fulfillmentEngine, MockOracle oracle) internal returns (SectorVault) {
        // Deploy mock AI tokens and setup basket
        (address[] memory underlyingTokens, uint256[] memory targetWeights) = _deployAiTokens();

        // Set all token prices to 1 USDC (1000000 with 6 decimals)
        uint256[] memory prices = new uint256[](underlyingTokens.length);
        uint8[] memory decimals = new uint8[](underlyingTokens.length);
        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            prices[i] = 1_000_000; // $1.00 in 6 decimals
            decimals[i] = 18; // All mock tokens have 18 decimals
        }
        oracle.setPrices(underlyingTokens, prices);
        oracle.setTokenDecimalsBatch(underlyingTokens, decimals);
        console.log("Set AI sector token prices to $1.00 and decimals to 18");

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

        console.log("AI SectorVault deployed at:", address(vault));
        console.log("AI SectorToken deployed at:", address(vault.SECTOR_TOKEN()));

        // Verify fulfillment role is set correctly
        require(vault.fulfillmentRole() == fulfillmentEngine, "AI vault fulfillment role mismatch");

        return vault;
    }

    function _deployMadeInAmericaSector(address fulfillmentEngine, MockOracle oracle) internal returns (SectorVault) {
        // Deploy Made in America tokens and setup basket
        (address[] memory underlyingTokens, uint256[] memory targetWeights) = _deployMadeInAmericaTokens();

        // Set all token prices to 1 USDC (1000000 with 6 decimals)
        uint256[] memory prices = new uint256[](underlyingTokens.length);
        uint8[] memory decimals = new uint8[](underlyingTokens.length);
        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            prices[i] = 1_000_000; // $1.00 in 6 decimals
            decimals[i] = 18; // All mock tokens have 18 decimals
        }
        oracle.setPrices(underlyingTokens, prices);
        oracle.setTokenDecimalsBatch(underlyingTokens, decimals);
        console.log("Set Made in America sector token prices to $1.00 and decimals to 18");

        // Deploy vault
        SectorVault vault = new SectorVault(
            USDC_BASE_SEPOLIA,
            "Tone Made in America Sector",
            "tUSA",
            underlyingTokens,
            targetWeights,
            fulfillmentEngine, // fulfillment role
            address(oracle) // oracle
        );

        console.log("Made in America SectorVault deployed at:", address(vault));
        console.log("Made in America SectorToken deployed at:", address(vault.SECTOR_TOKEN()));

        // Verify fulfillment role is set correctly
        require(vault.fulfillmentRole() == fulfillmentEngine, "MIA vault fulfillment role mismatch");

        return vault;
    }

    function _deployAiTokens() internal returns (address[] memory, uint256[] memory) {
        // Deploy mock AI sector tokens based on latest sector allocations
        // Weights are calculated from: BAT(2685.65), BDX(1692.79), FIL(1450.26), GLM(2035.79),
        // ICP(1867.28), NEAR(1343.58), NMR(1361.45), SIREN(1523.14), TRAC(2322.32), VANA(1474.66)
        // Total: 18,757.85

        address[] memory tokens = new address[](10);

        tokens[0] = _getOrDeployToken("BAT", "Basic Attention Token");
        tokens[1] = _getOrDeployToken("BDX", "Beldex");
        tokens[2] = _getOrDeployToken("FIL", "Filecoin");
        tokens[3] = _getOrDeployToken("GLM", "Golem");
        tokens[4] = _getOrDeployToken("ICP", "Internet Computer");
        tokens[5] = _getOrDeployToken("NEAR", "NEAR Protocol");
        tokens[6] = _getOrDeployToken("NMR", "Numeraire");
        tokens[7] = _getOrDeployToken("SIREN", "Siren");
        tokens[8] = _getOrDeployToken("TRAC", "OriginTrail");
        tokens[9] = _getOrDeployToken("VANA", "Vana");

        // Optimized weights (basis points, total = 10000)
        // Calculated from allocation ratios and adjusted to sum exactly to 10000
        uint256[] memory weights = new uint256[](10);
        weights[0] = 1432; // BAT: 14.32%
        weights[1] = 902;  // BDX: 9.02%
        weights[2] = 773;  // FIL: 7.73%
        weights[3] = 1085; // GLM: 10.85%
        weights[4] = 996;  // ICP: 9.96%
        weights[5] = 716;  // NEAR: 7.16%
        weights[6] = 726;  // NMR: 7.26%
        weights[7] = 812;  // SIREN: 8.12%
        weights[8] = 1238; // TRAC: 12.38%
        weights[9] = 1320; // VANA: 13.20% (adjusted to reach exactly 10000)
        // Total: 10000 basis points (100%)

        // Verify weights sum to 10000
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            totalWeight += weights[i];
        }
        require(totalWeight == 10000, "AI sector weights must sum to 10000 basis points");

        console.log("\n=== AI Sector Token Allocations ===");
        string[10] memory symbols = ["BAT", "BDX", "FIL", "GLM", "ICP", "NEAR", "NMR", "SIREN", "TRAC", "VANA"];
        for (uint256 i = 0; i < weights.length; i++) {
            console.log(string.concat(symbols[i], ": ", vm.toString(weights[i]), " bp (", vm.toString(weights[i] / 100), ".", vm.toString(weights[i] % 100), "%)"));
        }

        return (tokens, weights);
    }

    function _deployMadeInAmericaTokens() internal returns (address[] memory, uint256[] memory) {
        // Deploy Made in America sector tokens
        // Composition: BAT(1853.59), BCH(1270.38), COMP(958.46), FRAX(1190.01), KAS(1049.42),
        // LTC(944.38), UNI(959.60), WLFI(1130.41), XRP(1013.62), ZEN(1091.80)
        // Total: 11,461.67

        address[] memory tokens = new address[](10);

        tokens[0] = _getOrDeployToken("BAT", "Basic Attention Token"); // Shared with AI sector
        tokens[1] = _getOrDeployToken("BCH", "Bitcoin Cash");
        tokens[2] = _getOrDeployToken("COMP", "Compound");
        tokens[3] = _getOrDeployToken("FRAX", "Frax");
        tokens[4] = _getOrDeployToken("KAS", "Kaspa");
        tokens[5] = _getOrDeployToken("LTC", "Litecoin");
        tokens[6] = _getOrDeployToken("UNI", "Uniswap");
        tokens[7] = _getOrDeployToken("WLFI", "World Liberty Financial");
        tokens[8] = _getOrDeployToken("XRP", "XRP");
        tokens[9] = _getOrDeployToken("ZEN", "Horizen");

        // Optimized weights (basis points, total = 10000)
        // Calculated from allocation ratios and adjusted to sum exactly to 10000
        uint256[] memory weights = new uint256[](10);
        weights[0] = 1617; // BAT: 16.17%
        weights[1] = 1108; // BCH: 11.08%
        weights[2] = 836;  // COMP: 8.36%
        weights[3] = 1038; // FRAX: 10.38%
        weights[4] = 915;  // KAS: 9.15%
        weights[5] = 824;  // LTC: 8.24%
        weights[6] = 837;  // UNI: 8.37%
        weights[7] = 986;  // WLFI: 9.86%
        weights[8] = 884;  // XRP: 8.84%
        weights[9] = 955;  // ZEN: 9.55%
        // Total: 10000 basis points (100%)

        // Verify weights sum to 10000
        uint256 totalWeight = 0;
        for (uint256 i = 0; i < weights.length; i++) {
            totalWeight += weights[i];
        }
        require(totalWeight == 10000, "Made in America sector weights must sum to 10000 basis points");

        console.log("\n=== Made in America Sector Token Allocations ===");
        string[10] memory symbols = ["BAT", "BCH", "COMP", "FRAX", "KAS", "LTC", "UNI", "WLFI", "XRP", "ZEN"];
        for (uint256 i = 0; i < weights.length; i++) {
            console.log(string.concat(symbols[i], ": ", vm.toString(weights[i]), " bp (", vm.toString(weights[i] / 100), ".", vm.toString(weights[i] % 100), "%)"));
        }

        return (tokens, weights);
    }

    function _getOrDeployToken(string memory symbol, string memory name) internal returns (address) {
        address token = deployedTokens[symbol];
        if (token == address(0)) {
            token = address(new MockToken(name, symbol));
            deployedTokens[symbol] = token;
            console.log(string.concat("Mock Token (", symbol, ") deployed at: ", vm.toString(token)));
        } else {
            console.log(string.concat("Mock Token (", symbol, ") reusing existing: ", vm.toString(token)));
        }
        return token;
    }

    function _transferAllTokensToFulfillmentEngine(address fulfillmentEngine) internal {
        uint256 transferAmount = 500_000 * 10 ** 18; // 500k tokens

        console.log("\n=== Transferring tokens to fulfillment engine ===");

        // List of all unique token symbols across both sectors
        string[19] memory symbols = [
            "BAT", "BDX", "FIL", "GLM", "ICP", "NEAR", "NMR", "SIREN", "TRAC", "VANA", // AI sector
            "BCH", "COMP", "FRAX", "KAS", "LTC", "UNI", "WLFI", "XRP", "ZEN" // Made in America sector (excluding BAT which is shared)
        ];

        for (uint256 i = 0; i < symbols.length; i++) {
            address tokenAddr = deployedTokens[symbols[i]];
            if (tokenAddr != address(0)) {
                MockToken token = MockToken(tokenAddr);
                require(token.transfer(fulfillmentEngine, transferAmount), string.concat(symbols[i], " transfer failed"));
                console.log(string.concat("Transferred 500k ", symbols[i], " to fulfillment engine"));
            }
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
