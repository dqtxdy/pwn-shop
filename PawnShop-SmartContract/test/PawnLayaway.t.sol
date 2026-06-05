// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnLayawayTest is BaseSetup {
    function _createListing(uint256 price) internal {
        vm.prank(admin);
        protocol.setKYCStatus(alice, true);
        vm.prank(admin);
        protocol.setKYCStatus(bob, true);

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.createListing(ASSET_ID, price, true);
        vm.stopPrank();
    }

    function test_LayawayCompletesAndPaysSeller() public {
        uint256 price = 12_000 * 10**18;
        _createListing(price);

        vm.startPrank(bob);
        paymentToken.approve(address(protocol), price);
        protocol.startLayaway(ASSET_ID, 3, 2_400 * 10**18);
        protocol.payInstallment(ASSET_ID, 3_200 * 10**18);
        vm.warp(block.timestamp + 30 days);
        protocol.payInstallment(ASSET_ID, 3_200 * 10**18);
        vm.warp(block.timestamp + 30 days);
        protocol.payInstallment(ASSET_ID, 3_200 * 10**18);
        vm.stopPrank();

        assertEq(assetToken.ownerOf(ASSET_ID), bob, "Bob receives the NFT");
        assertEq(paymentToken.balanceOf(alice), 110_800 * 10**18, "Alice receives net consignment proceeds");
        assertEq(protocol.protocolFees(address(paymentToken)), 1_200 * 10**18, "Protocol records the commission");
    }

    function test_ForfeitLayawayRelistsAsset() public {
        uint256 price = 10_000 * 10**18;
        _createListing(price);

        vm.startPrank(bob);
        paymentToken.approve(address(protocol), price);
        protocol.startLayaway(ASSET_ID, 3, 2_000 * 10**18);
        vm.stopPrank();

        vm.warp(block.timestamp + 31 days);
        vm.prank(admin);
        protocol.forfeitLayaway(ASSET_ID);

        (, , , bool isActive, ) = protocol.listings(ASSET_ID);
        assertTrue(isActive, "Listing is available again after forfeiture");
    }
}
