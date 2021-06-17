// FOR TESTING PURPOSES - DO NOT AUDIT!

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract EvilMockNFT is ERC721("EvilMockNFT", "emNFT") {
    function setApprovalForAll(address operator, bool _approved) public pure override {
      revert("not gonna shut down now, are you?");
    }

    function mint(address to, uint256 tokenId) public {
        _safeMint(to, tokenId, "");
    }
}