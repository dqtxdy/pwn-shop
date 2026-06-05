// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnAppraisalTest is BaseSetup {

    function test_UpdateAppraisal() public {
        uint256 estimatedValue = 10_000 * 10**18;
        uint256 ltvBps = 6000;                    
        uint256 interestBps = 500;                

        vm.prank(oracle);
        protocol.updateAppraisal(ASSET_ID, estimatedValue, ltvBps, interestBps, true);

        (uint256 val, , bool isValid, uint256 ltv, uint256 interest) = protocol.appraisals(ASSET_ID);
        
        assertEq(val, estimatedValue, "Estimated value not saved correctly");
        assertTrue(isValid, "Appraisal should be valid");
        assertEq(ltv, ltvBps, "LTV not saved correctly");
        assertEq(interest, interestBps, "Interest not saved correctly");
    }

    function test_RevokeAppraisal() public {
        vm.prank(oracle);
        protocol.updateAppraisal(ASSET_ID, 10_000 * 10**18, 6000, 500, true);

        vm.prank(oracle);
        protocol.revokeAppraisal(ASSET_ID);

        (, , bool isValid, , ) = protocol.appraisals(ASSET_ID);
        assertFalse(isValid, "Appraisal should be invalid after revocation");
    }

    function test_FailUnsafeLtv() public {
        vm.prank(oracle);
        vm.expectRevert(bytes4(keccak256("UnsafeParameter()")));
        protocol.updateAppraisal(ASSET_ID, 10_000 * 10**18, 8000, 500, true);
    }
}
