// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnMarketplaceTest is BaseSetup {

    function test_CreateListingAndBuyItem() public {
        uint256 price = 10_000 * 10**18;

        vm.prank(admin);
        protocol.setKYCStatus(alice, true);
        vm.prank(admin);
        protocol.setKYCStatus(bob, true);

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.createListing(ASSET_ID, price, true); // true = Ký gửi
        vm.stopPrank();

        assertEq(protocol.platformFeePercentage(), 1000);

        vm.startPrank(bob);
        paymentToken.approve(address(protocol), price);
        protocol.buyItem(ASSET_ID);
        vm.stopPrank();

        assertEq(assetToken.ownerOf(ASSET_ID), bob, "Bob owns the NFT now"); // Bob cầm đồng hồ
        
        assertEq(paymentToken.balanceOf(alice), 100_000 * 10**18 + 9_000 * 10**18, "Alice receives 90%");
        
        assertEq(paymentToken.balanceOf(address(protocol)), 1_001_000 * 10**18, "Protocol holds 10% fee");
    }
}
