//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IStaking.sol";

contract Staking is IStaking, ReentrancyGuard {
    mapping(address => uint256) private _stakedBalances;
    mapping(address => uint256) private _unlockTimes;

    // TODO make sure this can be changed to point to new contracts
    address public tokenAddress;
    address public daoAddress;
    IERC20 tokenContract;
    uint256 totalStakedBalance;
    bool shutdown=false;

    event StakeChanged(address staker, uint256 newStakedBalance);
    event UnlockTimeIncreased(address staker, uint256 newUnlockBlock);
    event EmergencyShutdown(address calledBy, uint256 shutdownBlock);

    modifier onlyDao() {
        require(msg.sender == daoAddress, "only dao can call this function");
        _;
    }

    modifier notShutdown() {
        require(!shutdown, "cannot be called after shutdown");
        _;
    }

    constructor(address _token, address _dao) {
        tokenAddress = _token;
        daoAddress = _dao;
        tokenContract = IERC20(_token);
    }

    /**
     * @dev returns address of the token that can be staked
     *
     * @return the address of the token contract
     */
    function getTokenAddress() public view returns (address) {
        return tokenAddress;
    }

    /**
     * @dev returns address of the DAO contract
     *
     * @return the address of the dao contract
     */
    function getDaoAddress() public view returns (address) {
        return daoAddress;
    }

    /**
     * @dev Gets staker's staked balance (voting power)
     * @param staker                 The staker's address
     * @return (uint) staked token balance
     */
    function getStakedBalance(address staker) external view override returns(uint256) {
        return _stakedBalances[staker];
    }

    /**
     * @dev Gets staker's unlock time
     * @param staker                 The staker's address
     * @return (uint) staker's unlock time in blocks
     */
    function getUnlockTime(address staker) external view override returns(uint256) {
        return _unlockTimes[staker];
    }

    /**
     * @dev returns if staking contract is shutdown or not
     */
    function isShutdown() public view override returns(bool) {
        return shutdown;
    }

    // Raphael calls this to lock tokens when vote() called
    function voted(
        address voter,
        uint256 endBlock
    ) external onlyDao notShutdown override returns(bool) {
        if(_unlockTimes[voter] < endBlock){
            _unlockTimes[voter] = endBlock;

            emit UnlockTimeIncreased(voter, endBlock);
        }
 
        return true;
    }

    /**
     * @dev allows a user to stake and to increase their stake
     * @param amount the uint256 amount of native token being staked/added
     * @notice user must first approve staking contract for at least the amount
     */
    function stake(uint256 amount) external notShutdown override {
        require(tokenContract.balanceOf(msg.sender) >= amount, "Amount higher than user's balance");
        require(tokenContract.allowance(msg.sender, address(this)) > amount, 'Approved allowance too low');
        require(
            tokenContract.transferFrom(msg.sender, address(this), amount),
            "staking tokens failed"
        );
        totalStakedBalance += amount;
        _stakedBalances[msg.sender] += amount;

        emit StakeChanged(msg.sender, _stakedBalances[msg.sender]);
    }

    /**
     * @dev allows a user to withdraw their unlocked tokens
     * @param amount the uint256 amount of native token being withdrawn
     */
    function withdraw(uint256 amount) external override {
        if(!shutdown){
            require(_unlockTimes[msg.sender] < block.number, "Tokens not unlocked yet");
        }
        require(
            _stakedBalances[msg.sender] >= amount,
            "Insufficient staked balance"
        );
        require(totalStakedBalance >= amount, "insufficient funds in contract");

        // Send unlocked tokens back to user
        totalStakedBalance -= amount;
        _stakedBalances[msg.sender] -= amount;
        require(tokenContract.transfer(msg.sender, amount), "withdraw failed");
    }

    function emergencyShutdown(address admin) external onlyDao notShutdown nonReentrant override {
        // when shutdown = true, it skips the locktime require in withdraw
        // so all users get their tokens unlocked immediately
        shutdown = true;
        emit EmergencyShutdown(admin, block.number);
    }
}
