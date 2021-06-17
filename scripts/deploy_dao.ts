import hre, { ethers } from "hardhat";
import "@nomiclabs/hardhat-etherscan";
import chalk from "chalk";
import fs from "fs";
import { Contract } from "ethers";
import cliProgress from "cli-progress";

interface DeploymentObject {
  name: string;
  address: string;
  args: any;
  contract: Contract;
}

// custom `deploy` in order to make verifying easier
const deploy = async (contractName: string, _args: any[] = [], overrides = {}, libraries = {}) => {
  console.log(` 🛰  Deploying: ${contractName}`);

  const contractArgs: any = _args || [];
  const stringifiedArgs = JSON.stringify(contractArgs);
  const contractArtifacts = await ethers.getContractFactory(contractName,{libraries: libraries});
  const contract = await contractArtifacts.deploy(...contractArgs, overrides);
  const contractAddress = contract.address;
  fs.writeFileSync(`artifacts/${contractName}.address`, contractAddress);
  fs.writeFileSync(`artifacts/${contractName}.args`, stringifiedArgs);

  // tslint:disable-next-line: no-console
  console.log("Deploying", chalk.cyan(contractName), "contract to", chalk.magenta(contractAddress));

  await contract.deployed();

  const deployed: DeploymentObject = { name: contractName, address: contractAddress, args: contractArgs, contract };

  return deployed
}

const verifiableNetwork = ["mainnet", "ropsten", "rinkeby", "goerli", "kovan"];

async function main() {
  const network = process.env.HARDHAT_NETWORK === undefined ? "localhost" : process.env.HARDHAT_NETWORK;
  
  // tslint:disable-next-line: no-console
  console.log("🚀 Deploying to", chalk.magenta(network), "!");
  if(
    network === "localhost" || 
    network === "hardhat"
  ) {
    const [deployer] = await ethers.getSigners();

    // tslint:disable-next-line: no-console
    console.log(
      chalk.cyan("deploying contracts with the account:"),
      chalk.green(deployer.address)
    );

    // tslint:disable-next-line: no-console
    console.log("Account balance:", (await deployer.getBalance()).toString());
  }

  // this array stores the data for contract verification
  let contracts: DeploymentObject[] = [];

  // In order to set scripts for certain nets (rinkeby, mainnet), use the 
  // network variable. For example, if you want to set conditions that are 
  // only triggered in a mainnet deployment:
  // if(network === "mainnet"){
  //   // set logic here
  // }

  let tokenAddress: string | undefined;
  let dao: DeploymentObject;
  let staking: DeploymentObject;
  
  switch(network){
    // local testing setup, also deploys token
    case "localhost":
      console.log("\nDeploying to localhost...")
      const token = await deploy("VITA", ["test VITA token", "tVITA", ethers.utils.parseUnits("64298880")]);
      dao = await deploy("Raphael");
      staking = await deploy("Staking", [token.address, dao.address]);
      console.log(chalk.greenBright.bold("Token, DAO, and Staking contracts deployed!"));

      // initial setup - set token and staking address on DAO
      dao.contract.setNativeTokenAddress(token.address);
      console.log(`Token address set in DAO to ${token.address}`);
      dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${staking.address}`);

      break;
    // testnet deploy, relies on previous token deployment
    case "goerli":
      tokenAddress = process.env.GOERLI_VITA_ADDRESS;
      dao = await deploy("Raphael");
      staking = await deploy("Staking", [tokenAddress, dao.address]);

      // initial setup
      dao.contract.setNativeTokenAddress(tokenAddress);
      console.log(`Token address set in DAO to ${tokenAddress}`);
      dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${staking.address}`);

      break;
    // mainnet deploy
    case "mainnet":
      tokenAddress = process.env.MAINNET_VITA_ADDRESS;
      dao = await deploy("Raphael");
      staking = await deploy("Staking", [tokenAddress, dao.address]);

      // initial setup
      dao.contract.setNativeTokenAddress(tokenAddress);
      console.log(`Token address set in DAO to ${tokenAddress}`);
      dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${staking.address}`);

      break;
  }

  // verification
  if(
    verifiableNetwork.includes(network)
    ) {
      let counter = 0;
      
      // tslint:disable-next-line: no-console
      console.log("Beginning Etherscan verification process...\n", 
        chalk.yellow(`WARNING: The process will wait two minutes for Etherscan 
        to update their backend before commencing, please wait and do not stop 
        the terminal process...`)
      );

      const progressBar = new cliProgress.SingleBar({
        format: 'CLI Progress |' + chalk.cyan('{bar}') + '| { percentage}%',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
      }, cliProgress.Presets.shades_classic);
      progressBar.start(120, 0);

      const timer = setInterval(() => {
        counter++;
        progressBar.update(counter);
        if(counter >= progressBar.getTotal()){
          clearInterval(timer);
          progressBar.stop();
          // onComplete.apply(this);
        }
      }, 1000);

      // tslint:disable-next-line: no-console
      console.log(chalk.cyan("\n🔍 Running Etherscan verification..."));
      
      await Promise.all(contracts.map(async contract => {
        // tslint:disable-next-line: no-console
        console.log(`Verifying ${contract.name}...`);
        try {
          await hre.run("verify:verify", {
            address: contract.address,
            constructorArguments: contract.args
          });
          // tslint:disable-next-line: no-console
          console.log(chalk.cyan(`✅ ${contract.name} verified!`));
        } catch (error) {
          // tslint:disable-next-line: no-console
          console.log(error);
        }
      }));
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    // tslint:disable-next-line: no-console
    console.error(error);
    process.exit(1);
  });