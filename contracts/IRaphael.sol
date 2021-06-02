//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IRaphael{
    enum ProposalStatus {
        VOTING_NOT_STARTED,
        VOTING,
        VOTES_FINISHED,
        RESOLVED,
        CANCELLED,
        QUORUM_FAILED
    }

    struct Proposal {
        string details;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startBlock;
        uint256 endBlock;
        ProposalStatus status;
    }

    // View functions
    function getProposalData(uint256 proposalIndex) external view returns (string memory, uint256, uint256, uint256, uint256, uint8);
    function getProposalResult(uint256 proposalIndex) external view returns(bool);
    function getMinVotesNeeded() external view returns(uint256);
    function getNativeTokenAddress() external view returns(address);
    function getNativeTokenBalance() external view returns(uint256);
    function getNftContractAddresses() external returns(address[] memory);
    function getStakingAddress() external view returns(address);
    function isShutdown() external view returns(bool);

    // Platform Variable Setters
    function setVotingDelayDuration(uint256 newDuration) external;
    function setVotingDuration(uint256 newDuration) external;
    function setMinVotesNeeded(uint256 newVotesNeeded) external;
    function setStakingAddress(address _stakingContractAddress) external;
    function setNativeTokenAddress(address tokenContractAddress) external;

    // Proposal functions
    function createProposal(string memory details) external;
    function updateProposalStatus(uint256 proposalIndex) external;
    function setProposalToResolved(uint256 proposalIndex) external;
    function setProposalToCancelled(uint256 proposalIndex) external;
    function vote(uint256 proposalIndex, bool _vote) external;
    function delegate(address delegateAddress) external;

    // Asset Management
    function transferNativeToken(address to, uint256 amount) external returns(bool);
    function transferNFT(address nftContractAddress, address recipient, uint256 tokenId) external;
    

    // commenting out liquidity pool functions until more clarity is given
    // function setPool(address poolAddress) external;
    // function depositInPool(uint256 amount) external;
    // function withdrawFromPool(uint256 amount) external;

    function emergencyShutdown() external;

    // onNFTReceived: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC721/IERC721Receiver.sol
    function onNFTReceived(address operator, address from, uint256 tokenId, bytes calldata data) external returns(bytes4);
}
