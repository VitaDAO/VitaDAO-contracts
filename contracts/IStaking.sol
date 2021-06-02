//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IStaking{
    function getStakedBalance(address staker) external view returns(uint256);
    function getUnlockTime(address staker) external view returns(uint256);
    function isShutdown() external view returns(bool);
    function voted(address voter, uint256 endBlock) external returns(bool);
    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function emergencyShutdown(address admin) external;
}