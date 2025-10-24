// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/MockOracle.sol";

/**
 * @title UpdateOraclePrices
 * @notice Script to update mock oracle prices to real-world values
 * @dev Run with: forge script script/UpdateOraclePrices.s.sol:UpdateOraclePrices --rpc-url base_sepolia --broadcast
 * @dev Prices fetched on October 24, 2025
 */
contract UpdateOraclePrices is Script {
    // MockOracle address from deployment
    address constant MOCK_ORACLE = 0xfe6e83c930F868a756d0480720bbfBf4D8CAa815;

    // Token addresses from deployment
    address constant ZRX = 0x4d277c1b483F4F049894c42FE3656815e9f8bf3d;        // 0X0
    address constant ARKM = 0x2DA0d6807a008550592aAA22028378c5058347ec;
    address constant FET = 0x8b0BE05AFF375244bb0e0e9A7CDD8c36c9E6dF4B;
    address constant KAITO = 0x5c2c71305E088f517774dA4d81292e39bE8e4f7E;
    address constant NEAR = 0x6337BfbB0F2671a68293650B6b8811728dC63785;
    address constant NOS = 0x638880e9799401199C40847E773267C5Ee475Fb0;
    address constant PAAL = 0xc2B88B7818766F9FfA76427B12b43c672C969A52;
    address constant RENDER = 0xd1dA8e1D87271d5618B908c5cfc8142cA15300A4;
    address constant TAO = 0x783AceD64b307e8D85849c8bb8B3A1a14DD2F7bE;
    address constant VIRTUAL = 0xA12fF542E109cA5CFFd75740C8134cb720b78833;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Updating oracle prices with account:", deployer);
        console.log("Account balance:", deployer.balance);
        console.log("Oracle address:", MOCK_ORACLE);

        vm.startBroadcast(deployerPrivateKey);

        MockOracle oracle = MockOracle(MOCK_ORACLE);

        // Prepare tokens and prices arrays (all 10 tokens)
        address[] memory tokens = new address[](10);
        tokens[0] = ZRX;
        tokens[1] = ARKM;
        tokens[2] = FET;
        tokens[3] = KAITO;
        tokens[4] = NEAR;
        tokens[5] = NOS;
        tokens[6] = PAAL;
        tokens[7] = RENDER;
        tokens[8] = TAO;
        tokens[9] = VIRTUAL;

        // Real-world prices as of October 24, 2025 (with 6 decimals)
        uint256[] memory prices = new uint256[](10);
        prices[0] = 250_000;      // 0X0 (ZRX): $0.25
        prices[1] = 357_894;      // ARKM: $0.357894
        prices[2] = 250_000;      // FET: $0.25
        prices[3] = 1_040_000;    // KAITO: $1.04
        prices[4] = 2_200_000;    // NEAR: $2.20
        prices[5] = 434_900;      // NOS: $0.4349
        prices[6] = 40_000;       // PAAL: $0.04
        prices[7] = 2_470_000;    // RENDER: $2.47
        prices[8] = 386_035_230;  // TAO: $386.035230
        prices[9] = 1_300_000;    // VIRTUAL: $1.30

        // Set token decimals (all are 18 decimals)
        uint8[] memory decimals = new uint8[](10);
        for (uint256 i = 0; i < 10; i++) {
            decimals[i] = 18;
        }
        oracle.setTokenDecimalsBatch(tokens, decimals);

        // Update prices
        oracle.setPrices(tokens, prices);

        console.log("\n=== Real-World Prices Updated (Oct 24, 2025) ===");
        console.log("0X0 (ZRX) price set to $0.25");
        console.log("ARKM price set to $0.357894");
        console.log("FET price set to $0.25");
        console.log("KAITO price set to $1.04");
        console.log("NEAR price set to $2.20");
        console.log("NOS price set to $0.4349");
        console.log("PAAL price set to $0.04");
        console.log("RENDER price set to $2.47");
        console.log("TAO price set to $386.035230");
        console.log("VIRTUAL price set to $1.30");
        console.log("\nAll token decimals set to 18");

        vm.stopBroadcast();
    }
}
