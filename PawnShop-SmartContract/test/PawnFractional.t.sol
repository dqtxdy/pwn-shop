// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnFractionalTest is BaseSetup {

    function test_FractionalizeAndBuyFractions() public {
        uint256 totalShares = 100;
        uint256 targetPrice = 10_000 * 10**18; // Mỗi mảnh 100 USD

        // Setup: Asset needs to be overdue pawn loan or cheap sell (we will simulate passing voluntary cheap sell check if we just approve directly but PawnFractionalize requires a loan)
        // Wait, original test failed because "No active pawn loan for this asset"
        // Let's create a PawnLoan first and let it become overdue, or simulate cheap sell.
        
        vm.prank(admin);
        protocol.setKYCStatus(alice, true);
        vm.prank(admin);
        protocol.setKYCStatus(bob, true);

        vm.prank(oracle);
        protocol.updateAppraisal(ASSET_ID, 20_000 * 10**18, 6000, 500, true); 

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.createPawnLoan(ASSET_ID, 30, 5_000 * 10**18);
        vm.stopPrank();
        
        // Time warp to make it overdue
        vm.warp(block.timestamp + 31 days);

        // Now admin can fractionalize it
        vm.startPrank(admin);
        protocol.fractionalizeItem(ASSET_ID, totalShares, targetPrice);
        vm.stopPrank();

        uint256 sharesToBuy = 20;
        uint256 totalCost = 2_000 * 10**18;

        vm.startPrank(bob);
        paymentToken.approve(address(protocol), totalCost);
        protocol.buyFractions(ASSET_ID, sharesToBuy);
        vm.stopPrank();

        assertEq(protocol.getFractionsOf(ASSET_ID, bob), 20, "Bob should own 20 shares in the contract");
        assertEq(paymentToken.balanceOf(bob), 100_000 * 10**18 - 2_000 * 10**18, "Bob paid exactly 2000 USDC");
        
        assertEq(assetToken.ownerOf(ASSET_ID), address(protocol), "Protocol keeps the locked NFT until full redemption");
    }

    function test_RedeemAssetWithAllFractions() public {
        vm.prank(admin);
        protocol.setKYCStatus(alice, true);

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.fractionalizeOwnedAsset(ASSET_ID, 100, 10_000 * 10**18);
        protocol.redeemAsset(ASSET_ID);
        vm.stopPrank();

        assertEq(assetToken.ownerOf(ASSET_ID), alice, "Alice receives the NFT after burning all shares");
        assertEq(protocol.getFractionsOf(ASSET_ID, alice), 0, "All shares should be burned");
    }
}
