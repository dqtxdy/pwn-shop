# Pawnshop Smart Contracts

This repository contains the smart contracts for the Pawnshop Protocol, built with [Foundry](https://getfoundry.sh/).

## Getting Started

To run this project, you need to have Foundry installed on your machine. We do not include the compiled binaries or external dependencies directly in the source control to keep the repository lightweight.

### 1. Install Foundry

If you don't have Foundry installed, run the following command in your terminal:

```shell
curl -L https://foundry.paradigm.xyz | bash
```

Then, follow the on-screen instructions and restart your terminal. After that, run:

```shell
foundryup
```

### 2. Clone and Setup

Once Foundry is installed, clone this repository and install the dependencies:

```shell
git clone --recursive https://github.com/deeplake31337/PawnShop-SmartContract.git
cd pawnshop
forge install
```

### 3. Build & Test

Compile the smart contracts:

```shell
forge build
```

Run the unit tests:

```shell
forge test
```

## Documentation

For more information on how to use Foundry, please refer to the [Foundry Book](https://book.getfoundry.sh/).

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
