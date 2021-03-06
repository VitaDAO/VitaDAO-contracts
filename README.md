# ![VitaDAO](https://github.com/VitaDAO/whitepaper/blob/master/images/VitaDAO%20Opengraph.png?raw=true) 
# Smart Contracts

Governance Contracts for VitaDAO

## Ethereum Mainnet Deployment

- Token Address: [0x81f8f0bb1cB2A06649E51913A151F0E7Ef6FA321](https://etherscan.io/token/0x81f8f0bb1cB2A06649E51913A151F0E7Ef6FA321)
- Staking Contract Address: [0x711F2ac9E39615e07B4fe4548154D698B517a66D](https://etherscan.io/address/0x711F2ac9E39615e07B4fe4548154D698B517a66D)
- DAO Contract Address: [0x9aBF28aB6f80c1EF666f983935437E717Aafff7a](https://etherscan.io/address/0x9aBF28aB6f80c1EF666f983935437E717Aafff7a)

## Rinkeby Testnet Deployment

- Token Address: [0x10a2f70487e3a9db4dd48988990176e62724635a](https://rinkeby.etherscan.io/token/0x10a2f70487e3a9db4dd48988990176e62724635a)
- Staking Contract Address: [0xddbb600e551aafe790b286303c31982eb36e6dc0](https://rinkeby.etherscan.io/address/0xddbb600e551aafe790b286303c31982eb36e6dc0)
- DAO Contract Address: [0xa582e94080a45402aa46683f08db6e974ec3135c](https://rinkeby.etherscan.io/address/0xa582e94080a45402aa46683f08db6e974ec3135c)


# Setting Up


Navigate to the root of the repository directory in your terminal. 

If you don't have [hardhat](https://hardhat.org/) installed, you will need it.

Install the project dependencies (including hardhat): 

```Shell
yarn install
```

# Compiling the Contracts

To compile the contracts, just run: 

```Shell
yarn compile
```


Compile before you run locally or run the tests. 

## Instructions for deploying locally (dev chain)

Launch the chain locally: 

```Shell
# Start a local development chain
yarn start
```

You should see a message that says `Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/` and then a list of accounts. 

Congratulations, at this point you can connect your wallet and begin to interact. 


# Running Tests

## Test Against Local Chain (as you ran above)

If you have the local development chain running, you can run the tests immediately from another terminal. 

```Shell
# Run the whole test suite
yarn test
```

The tests take a while to run. The test terminal may not update often while the tests run, but the terminal with the running hardhat server should show many transactions or mining of blocks occurring. Be patient, the should all pass after a while.

## Test if Local Chain Is Not Running

If there isn't already a local network running, you will first need to run: 

```Shell 
npx hardhat node
```
OR 
```Shell
yarn start
```

This will start a local network to which the tests can connect. Then you are free to run:

```Shell
# Run the whole test suite
yarn test
```

# Recompiling

If you need a fresh compile, you can get rid of all the build artifacts and clear the cache using: 
```Shell
yarn clean
```

# Deployment

This script is not ready. 


