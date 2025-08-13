import { describe, it, expect, beforeEach } from "vitest";

interface Proposal {
  proposer: string;
  description: string;
  stakeAmount: bigint;
  startBlock: bigint;
  endBlock: bigint;
  yesVotes: bigint;
  noVotes: bigint;
  executed: boolean;
}

interface MockGovernanceDAOContract {
  admin: string;
  paused: boolean;
  proposalCount: bigint;
  tokenContract: string;
  totalStaked: bigint;
  proposals: Map<string, Proposal>;
  votes: Map<string, boolean>;
  stakedBalances: Map<string, bigint>;
  VOTING_PERIOD: bigint;
  QUORUM_PERCENT: bigint;
  PROPOSAL_STAKE: bigint;
  MAX_PROPOSALS: bigint;
  MAX_STAKE_AMOUNT: bigint;
  MIN_DESCRIPTION_LENGTH: bigint;
  MAX_DESCRIPTION_LENGTH: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  stakeTokens(caller: string, amount: bigint): { value: boolean } | { error: number };
  unstakeTokens(caller: string, amount: bigint): { value: boolean } | { error: number };
  createProposal(caller: string, description: string, stakeAmount: bigint): { value: bigint } | { error: number };
  castVote(caller: string, proposalId: bigint, support: boolean): { value: boolean } | { error: number };
  executeProposal(caller: string, proposalId: bigint): { value: boolean } | { error: number };
  getProposal(proposalId: bigint): { value: Proposal } | { error: number };
  getVote(proposalId: bigint, voter: string): { value: boolean };
}

const mockGovernanceDAOContract: MockGovernanceDAOContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  proposalCount: 0n,
  tokenContract: "ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1",
  totalStaked: 0n,
  proposals: new Map<string, Proposal>(),
  votes: new Map<string, boolean>(),
  stakedBalances: new Map<string, bigint>(),
  VOTING_PERIOD: 2880n,
  QUORUM_PERCENT: 5000n,
  PROPOSAL_STAKE: 1_000_000n,
  MAX_PROPOSALS: 1000n,
  MAX_STAKE_AMOUNT: 1_000_000_000n,
  MIN_DESCRIPTION_LENGTH: 10n,
  MAX_DESCRIPTION_LENGTH: 500n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 300 };
    this.paused = pause;
    return { value: pause };
  },

  stakeTokens(caller: string, amount: bigint) {
    if (this.paused) return { error: 301 };
    if (amount <= 0) return { error: 307 };
    this.stakedBalances.set(caller, (this.stakedBalances.get(caller) || 0n) + amount);
    this.totalStaked += amount;
    return { value: true };
  },

  unstakeTokens(caller: string, amount: bigint) {
    if (this.paused) return { error: 301 };
    const stakeBalance = this.stakedBalances.get(caller) || 0n;
    if (stakeBalance < amount) return { error: 307 };
    this.stakedBalances.set(caller, stakeBalance - amount);
    this.totalStaked -= amount;
    return { value: true };
  },

  createProposal(caller: string, description: string, stakeAmount: bigint) {
    if (this.paused) return { error: 301 };
    if (description.length < Number(this.MIN_DESCRIPTION_LENGTH) || description.length > Number(this.MAX_DESCRIPTION_LENGTH)) return { error: 308 };
    if (stakeAmount <= 0 || stakeAmount > this.MAX_STAKE_AMOUNT) return { error: 309 };
    if (this.proposalCount >= this.MAX_PROPOSALS) return { error: 303 };
    if ((this.stakedBalances.get(caller) || 0n) <= 0) return { error: 300 };
    const proposalId = this.proposalCount + 1n;
    this.proposals.set(proposalId.toString(), {
      proposer: caller,
      description,
      stakeAmount,
      startBlock: BigInt(1000),
      endBlock: BigInt(1000) + this.VOTING_PERIOD,
      yesVotes: 0n,
      noVotes: 0n,
      executed: false,
    });
    this.proposalCount = proposalId;
    return { value: proposalId };
  },

  castVote(caller: string, proposalId: bigint, support: boolean) {
    if (this.paused) return { error: 301 };
    const proposal = this.proposals.get(proposalId.toString());
    if (!proposal) return { error: 303 };
    if (BigInt(1000) >= proposal.endBlock) return { error: 305 };
    const voteKey = `${proposalId}-${caller}`;
    if (this.votes.has(voteKey)) return { error: 304 };
    const stake = this.stakedBalances.get(caller) || 0n;
    if (stake <= 0) return { error: 307 };
    this.votes.set(voteKey, support);
    this.proposals.set(proposalId.toString(), {
      ...proposal,
      yesVotes: support ? proposal.yesVotes + stake : proposal.yesVotes,
      noVotes: !support ? proposal.noVotes + stake : proposal.noVotes,
    });
    return { value: true };
  },

  executeProposal(caller: string, proposalId: bigint) {
    if (this.paused) return { error: 301 };
    const proposal = this.proposals.get(proposalId.toString());
    if (!proposal) return { error: 303 };
    if (BigInt(1000) < proposal.endBlock || proposal.executed) return { error: 303 };
    const totalVotes = proposal.yesVotes + proposal.noVotes;
    if (totalVotes < (this.totalStaked * this.QUORUM_PERCENT) / 10000n) return { error: 306 };
    if (proposal.yesVotes > proposal.noVotes) {
      this.proposals.set(proposalId.toString(), { ...proposal, executed: true });
      return { value: true };
    }
    return { value: false };
  },

  getProposal(proposalId: bigint) {
    const data = this.proposals.get(proposalId.toString());
    return data ? { value: data } : { error: 303 };
  },

  getVote(proposalId: bigint, voter: string) {
    return { value: this.votes.get(`${proposalId}-${voter}`) || false };
  },
};

describe("Governance DAO Contract", () => {
  beforeEach(() => {
    mockGovernanceDAOContract.paused = false;
    mockGovernanceDAOContract.proposalCount = 0n;
    mockGovernanceDAOContract.totalStaked = 0n;
    mockGovernanceDAOContract.proposals = new Map();
    mockGovernanceDAOContract.votes = new Map();
    mockGovernanceDAOContract.stakedBalances = new Map();
  });

  it("should stake tokens", () => {
    const result = mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    expect(result).toEqual({ value: true });
    expect(mockGovernanceDAOContract.stakedBalances.get("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toBe(1000n);
    expect(mockGovernanceDAOContract.totalStaked).toBe(1000n);
  });

  it("should not stake tokens if paused", () => {
    mockGovernanceDAOContract.setPaused(mockGovernanceDAOContract.admin, true);
    const result = mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    expect(result).toEqual({ error: 301 });
  });

  it("should not stake zero tokens", () => {
    const result = mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 0n);
    expect(result).toEqual({ error: 307 });
  });

  it("should unstake tokens", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    const result = mockGovernanceDAOContract.unstakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 500n);
    expect(result).toEqual({ value: true });
    expect(mockGovernanceDAOContract.stakedBalances.get("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toBe(500n);
    expect(mockGovernanceDAOContract.totalStaked).toBe(500n);
  });

  it("should not unstake tokens if paused", () => {
    mockGovernanceDAOContract.setPaused(mockGovernanceDAOContract.admin, true);
    const result = mockGovernanceDAOContract.unstakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 500n);
    expect(result).toEqual({ error: 301 });
  });

  it("should not unstake more tokens than staked", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    const result = mockGovernanceDAOContract.unstakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1500n);
    expect(result).toEqual({ error: 307 });
  });

  it("should create proposal with valid inputs", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    const result = mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    expect(result).toEqual({ value: 1n });
    expect(mockGovernanceDAOContract.proposals.get("1")).toMatchObject({
      proposer: "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      description: "Update stake amount to 2M",
      stakeAmount: 2000000n,
      yesVotes: 0n,
      noVotes: 0n,
      executed: false,
    });
    expect(mockGovernanceDAOContract.proposalCount).toBe(1n);
  });

  it("should not create proposal with invalid description", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    const result = mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "short", 2000000n);
    expect(result).toEqual({ error: 308 });
  });

  it("should not create proposal with invalid stake amount", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    const result = mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000000n);
    expect(result).toEqual({ error: 309 });
  });

  it("should not create proposal if not staked", () => {
    const result = mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    expect(result).toEqual({ error: 300 });
  });

  it("should not create proposal if paused", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.setPaused(mockGovernanceDAOContract.admin, true);
    const result = mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    expect(result).toEqual({ error: 301 });
  });

  it("should cast vote on proposal", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    const result = mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    expect(result).toEqual({ value: true });
    expect(mockGovernanceDAOContract.proposals.get("1")?.yesVotes).toBe(1000n);
    expect(mockGovernanceDAOContract.votes.get("1-ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toBe(true);
  });

  it("should not cast vote on invalid proposal", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    const result = mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    expect(result).toEqual({ error: 303 });
  });

  it("should not cast vote if voting period closed", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.proposals.set("1", {
      ...mockGovernanceDAOContract.proposals.get("1")!,
      endBlock: BigInt(999),
    });
    const result = mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    expect(result).toEqual({ error: 305 });
  });

  it("should not cast vote if already voted", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    const result = mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, false);
    expect(result).toEqual({ error: 304 });
  });

  it("should not cast vote if no stake", () => {
    // Create a proposal with a different staked user to ensure proposal exists
    mockGovernanceDAOContract.stakeTokens("ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1", 1000n);
    mockGovernanceDAOContract.createProposal("ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1", "Update stake amount to 2M", 2000000n);
    const result = mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    expect(result).toEqual({ error: 307 });
  });

  it("should execute proposal if quorum met and yes votes win", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 10000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    mockGovernanceDAOContract.proposals.set("1", {
      ...mockGovernanceDAOContract.proposals.get("1")!,
      endBlock: BigInt(999),
    });
    const result = mockGovernanceDAOContract.executeProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ value: true });
    expect(mockGovernanceDAOContract.proposals.get("1")?.executed).toBe(true);
  });

  it("should not execute proposal if quorum not met", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.proposals.set("1", {
      ...mockGovernanceDAOContract.proposals.get("1")!,
      endBlock: BigInt(999),
    });
    const result = mockGovernanceDAOContract.executeProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ error: 306 });
  });

  it("should not execute non-existent proposal", () => {
    const result = mockGovernanceDAOContract.executeProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ error: 303 });
  });

  it("should not execute proposal if still in voting period", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 10000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    const result = mockGovernanceDAOContract.executeProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ error: 303 });
  });

  it("should not execute already executed proposal", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 10000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    mockGovernanceDAOContract.proposals.set("1", {
      ...mockGovernanceDAOContract.proposals.get("1")!,
      endBlock: BigInt(999),
      executed: true,
    });
    const result = mockGovernanceDAOContract.executeProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ error: 303 });
  });

  it("should not execute proposal if no votes win", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 10000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, false);
    mockGovernanceDAOContract.proposals.set("1", {
      ...mockGovernanceDAOContract.proposals.get("1")!,
      endBlock: BigInt(999),
    });
    const result = mockGovernanceDAOContract.executeProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ value: false });
  });

  it("should get proposal details", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    const result = mockGovernanceDAOContract.getProposal(1n);
    expect(result).toMatchObject({
      value: {
        proposer: "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
        description: "Update stake amount to 2M",
        stakeAmount: 2000000n,
        yesVotes: 0n,
        noVotes: 0n,
        executed: false,
      },
    });
  });

  it("should not get non-existent proposal", () => {
    const result = mockGovernanceDAOContract.getProposal(1n);
    expect(result).toEqual({ error: 303 });
  });

  it("should get vote status", () => {
    mockGovernanceDAOContract.stakeTokens("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1000n);
    mockGovernanceDAOContract.createProposal("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Update stake amount to 2M", 2000000n);
    mockGovernanceDAOContract.castVote("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, true);
    const result = mockGovernanceDAOContract.getVote(1n, "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4");
    expect(result).toEqual({ value: true });
  });

  it("should return false for non-voted proposal", () => {
    const result = mockGovernanceDAOContract.getVote(1n, "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4");
    expect(result).toEqual({ value: false });
  });
});