// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/MockOracle.sol";

/**
 * @title UpdateOraclePrices
 * @notice Script to update mock oracle prices for testing
 * @dev Run with: forge script script/UpdateOraclePrices.s.sol:UpdateOraclePrices --rpc-url base_sepolia --broadcast
 */
contract UpdateOraclePrices is Script {
    // MockOracle address from deployment
    address constant MOCK_ORACLE = 0x114726f91082b788BC828c4B41A0eA03BFF715FB;

    // Token addresses from deployment
    address constant KAITO = 0x2F6c2B645c6721918518895a3834088DDB47882C;
    address constant NEAR = 0x13366FaEE20f1F81A5c855ed17e90cE83Ba3603C;
    address constant FET = 0xb9080604ab9ba300458b324e9A851aBbF157b44A;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Updating oracle prices with account:", deployer);
        console.log("Account balance:", deployer.balance);
        console.log("Oracle address:", MOCK_ORACLE);

        vm.startBroadcast(deployerPrivateKey);

        MockOracle oracle = MockOracle(MOCK_ORACLE);

        // Prepare tokens and prices arrays
        address[] memory tokens = new address[](3);
        tokens[0] = KAITO;
        tokens[1] = NEAR;
        tokens[2] = FET;

        uint256[] memory prices = new uint256[](3);
        prices[0] = 2_000_000; // $2.00 with 6 decimals
        prices[1] = 2_000_000; // $2.00 with 6 decimals
        prices[2] = 2_000_000; // $2.00 with 6 decimals

        // Update prices
        oracle.setPrices(tokens, prices);

        console.log("\n=== Prices Updated ===");
        console.log("KAITO price set to $2.00");
        console.log("NEAR price set to $2.00");
        console.log("FET price set to $2.00");

        vm.stopBroadcast();
    }
}
