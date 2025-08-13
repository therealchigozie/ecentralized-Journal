# Decentralized Journal

A blockchain-powered academic publishing platform that empowers researchers, reviewers, and readers to collaborate transparently, fairly, and without centralized publishers — all on-chain using Clarity on the Stacks blockchain.

---

## Overview

Decentralized Journal consists of four main smart contracts that together form a transparent, decentralized, and incentivized ecosystem for academic publishing:

1. **Submission Contract** – Manages paper submissions and staking by researchers.
2. **Review Contract** – Facilitates peer review and rewards reviewers with tokens.
3. **Access Contract** – Handles micropayments for paper access by readers.
4. **Governance DAO Contract** – Enables community-driven platform governance.

---

## Features

- **Token-based submission** with staking to ensure quality submissions  
- **Rewarded peer review** incentivizing timely and high-quality reviews  
- **Micropayment access** for affordable, pay-per-paper reading  
- **DAO governance** for community-driven platform rules and updates  
- **Transparent records** of submissions, reviews, and access on-chain  
- **IPFS integration** for decentralized paper storage  
- **Fair reward distribution** for reviewers and governance participants  

---

## Smart Contracts

### Submission Contract
- Manages paper submissions with token staking  
- Stores paper metadata (e.g., IPFS hash) on-chain  
- Refunds or burns stakes based on review outcomes  

### Review Contract
- Assigns papers to reviewers based on availability and expertise  
- Distributes token rewards for completed, high-quality reviews  
- Tracks review history and ratings transparently  

### Access Contract
- Enables readers to access papers via micropayments in tokens  
- Manages access rights and payment distribution to authors  
- Prevents unauthorized access with on-chain verification  

### Governance DAO Contract
- Facilitates token-weighted voting on platform rules (e.g., stake amounts, review criteria)  
- Executes approved proposals on-chain  
- Manages quorum and voting periods for fair governance  

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started) for Stacks development.  
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/decentralized-journal.git
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run tests:
   ```bash
   clarinet test
   ```
5. Deploy contracts to the Stacks blockchain:
   ```bash
   clarinet deploy
   ```

---

## Usage

Each smart contract operates independently but integrates with others to create a seamless academic publishing experience. Refer to individual contract documentation in the `/contracts` folder for function calls, parameters, and usage examples.

- **Submitting a Paper**: Use the Submission Contract to stake tokens and upload paper metadata (IPFS hash).
- **Reviewing Papers**: Register as a reviewer via the Review Contract and earn tokens for completed reviews.
- **Accessing Papers**: Use the Access Contract to pay micropayments for paper access.
- **Governing the Platform**: Stake tokens in the Governance DAO Contract to vote on platform proposals.

---

## License

MIT License