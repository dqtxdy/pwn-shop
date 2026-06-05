// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnLoansTest is BaseSetup {

    function test_CreatePawnLoan() public {
        vm.prank(admin);
        protocol.setKYCStatus(alice, true);

        vm.prank(oracle);
        protocol.updateAppraisal(ASSET_ID, 10_000 * 10**18, 6000, 500, true); 

        vm.prank(admin);
        protocol.updatePlatformFee(0);

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);

        uint256 requestedAmount = 5_000 * 10**18;
        protocol.createPawnLoan(ASSET_ID, 30, requestedAmount);
        vm.stopPrank();

        assertEq(paymentToken.balanceOf(alice), 105_000 * 10**18, "Alice should receive 5K USDC");
        
        assertEq(assetToken.ownerOf(ASSET_ID), address(protocol), "Protocol should hold the NFT collateral");
        
        (address borrower, uint256 loanAmt, , , , bool isActive, ) = protocol.pawns(ASSET_ID);
        assertEq(borrower, alice, "Alice should be borrower");
        assertEq(loanAmt, requestedAmount, "Loan amount exactly matches requested");
        assertTrue(isActive, "Loan should be active");
    }

    function test_RepayPawnLoan() public {
        test_CreatePawnLoan();

        uint256 requestedAmount = 5_000 * 10**18;
        vm.warp(block.timestamp + 30 days);

        uint256 interest = (requestedAmount * 500 * 30 days) / (10000 * 365 days); // APR-based interest
        uint256 totalRepay = requestedAmount + interest;

        vm.startPrank(alice);
        paymentToken.approve(address(protocol), totalRepay);
        protocol.repayPawn(ASSET_ID);
        vm.stopPrank();

        assertEq(assetToken.ownerOf(ASSET_ID), alice, "Alice got NFT back");
        
        (, , , , , bool isActive, ) = protocol.pawns(ASSET_ID);
        assertFalse(isActive, "Loan should be deactivated");
        
        assertEq(paymentToken.balanceOf(alice), 105_000 * 10**18 - totalRepay, "Alice balance deducted for repayment");
    }
}
