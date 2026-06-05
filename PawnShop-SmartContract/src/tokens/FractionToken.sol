// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FractionToken
 * @dev Represents 1155 fractions of real-world assets after being fractionalized by the PawnProtocol.
 * Note: Requires OpenZeppelin standard contracts
 */
contract FractionToken is ERC1155, Ownable {
    mapping(address => bool) public isMinter;

    constructor(address initialOwner, string memory uri_) ERC1155(uri_) Ownable(initialOwner) {}

    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner(), "FractionToken: caller is not an authorized minter");
        _;
    }

    /**
     * @dev Sets an authorized minter (e.g., the PawnProtocol main contract).
     */
    function setMinter(address minter, bool status) external onlyOwner {
        isMinter[minter] = status;
    }

    /**
     * @dev Mint fractional amounts.
     */
    function mint(address to, uint256 id, uint256 amount, bytes memory data) external onlyMinter {
        _mint(to, id, amount, data);
    }

    /**
     * @dev Burn fractional amounts during full asset redemption.
     */
    function burn(address from, uint256 id, uint256 amount) external onlyMinter {
        _burn(from, id, amount);
    }

    /**
     * @dev Mint batches of multiple assets.
     */
    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external onlyMinter {
        _mintBatch(to, ids, amounts, data);
    }
}
