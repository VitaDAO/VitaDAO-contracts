import { BigNumber } from "ethers"
import { ethers } from "hardhat"

export const CREATE_TO_VOTE_PROPOSAL_DELAY = 6
export const VOTING_DURATION = 10

export const skipBlocks = async (blocksToBeSkipped: BigNumber) => {
  if (blocksToBeSkipped.lt(ethers.constants.Zero)) return null
  for (
    let i = BigNumber.from('0');
    i.lt(blocksToBeSkipped);
    i = i.add(BigNumber.from('1'))
  ) {
    await ethers.provider.send("evm_mine", [])
  }
}
