# VitaDAO Contracts

Governance Contracts for VitaDAO

## Setting Up

Navigate to the root of the repository directory in your terminal. 

If you don't have [hardhat](https://hardhat.org/) installed, you will need it: 

```
yarn add hardhat
```

## Instructions for deploying locally (dev chain)

Launch the chain locally: 

```
# Start a local development chain
yarn start
```

You should see a message that says `Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/` and then a list of accounts. At this point you can connect your wallet and begin to interact. 


## Running Tests

### Setting up for testing

Before you test, make sure you've changed the timeouts configured in [Raphael.sol](contracts/Raphael.sol):

```
uint256 public CREATE_TO_VOTE_PROPOSAL_DELAY = 18500; // ~3 days
uint256 public VOTING_DURATION = 30850; // ~5 days

// for testing
// uint256 public CREATE_TO_VOTE_PROPOSAL_DELAY = 5;
// uint256 public VOTING_DURATION = 10;
```

If you fail to do this, the tests will appear to freeze and take a forever to finish. If that happens, Ctrl-C out of that process and use the testing timeouts above. 

### Against the already started local dev chain (as you ran above)

If you have the local development chain running, you can run the tests immediately from another terminal. 

```
# Run the whole test suite
yarn test
```

The tests take a while to run. The test terminal may not update often while the tests run, but the terminal with the running hardhat server should show many transactions or mining of blocks occurring. Be patient, the should all pass after a while.

### Without the local development running

If there isn't already a local network running, you will first need to run: 

``` 
npx hardhat node
```

This will start a local network to which the tests can connect. Then you are free to run:

```
# Run the whole test suite
yarn test
```

# Compiling the Contracts

To compile the contracts, just run: 

```
yarn compile
```
