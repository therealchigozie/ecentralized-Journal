import { describe, it, expect, beforeEach } from "vitest";

interface Paper {
  author: string;
  ipfsHash: string;
  stake: bigint;
  accepted: boolean;
  submissionTime: bigint;
  reviewScore: bigint;
}

interface MockSubmissionContract {
  admin: string;
  paused: boolean;
  paperCount: bigint;
  reviewContract: string;
  tokenContract: string;
  balances: Map<string, bigint>;
  papers: Map<string, Paper>;
  SUBMISSION_STAKE: bigint;
  MAX_PAPERS: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  submitPaper(caller: string, ipfsHash: string): { value: bigint } | { error: number };
  updatePaperStatus(caller: string, paperId: bigint, accepted: boolean, reviewScore: bigint): { value: boolean } | { error: number };
  withdrawStake(caller: string, paperId: bigint): { value: boolean } | { error: number };
  getPaper(paperId: bigint): { value: Paper } | { error: number };
}

const mockSubmissionContract: MockSubmissionContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  paperCount: 0n,
  reviewContract: "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
  tokenContract: "ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1",
  balances: new Map<string, bigint>(),
  papers: new Map<string, Paper>(),
  SUBMISSION_STAKE: 1_000_000n,
  MAX_PAPERS: 1_000_000n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  submitPaper(caller: string, ipfsHash: string) {
    if (this.paused) return { error: 105 };
    if (ipfsHash.length <= 46 || !ipfsHash.startsWith("Qm")) return { error: 102 };
    if (this.paperCount >= this.MAX_PAPERS) return { error: 104 };
    const balance = this.balances.get(caller) || 0n;
    if (balance < this.SUBMISSION_STAKE) return { error: 101 };
    if (this.SUBMISSION_STAKE <= 0) return { error: 107 };
    this.balances.set(caller, balance - this.SUBMISSION_STAKE);
    const paperId = this.paperCount + 1n;
    this.papers.set(paperId.toString(), {
      author: caller,
      ipfsHash,
      stake: this.SUBMISSION_STAKE,
      accepted: false,
      submissionTime: BigInt(1000),
      reviewScore: 0n,
    });
    this.paperCount = paperId;
    return { value: paperId };
  },

  updatePaperStatus(caller: string, paperId: bigint, accepted: boolean, reviewScore: bigint) {
    if (caller !== this.reviewContract) return { error: 100 };
    const paper = this.papers.get(paperId.toString());
    if (!paper) return { error: 103 };
    if (paper.accepted) return { error: 109 };
    this.papers.set(paperId.toString(), { ...paper, accepted, reviewScore });
    if (accepted) {
      this.balances.set(paper.author, (this.balances.get(paper.author) || 0n) + paper.stake);
    }
    return { value: true };
  },

  withdrawStake(caller: string, paperId: bigint) {
    if (this.paused) return { error: 105 };
    const paper = this.papers.get(paperId.toString());
    if (!paper) return { error: 103 };
    if (paper.author !== caller) return { error: 108 };
    if (paper.accepted) return { error: 109 };
    if (paper.stake <= 0) return { error: 107 };
    this.balances.set(caller, (this.balances.get(caller) || 0n) + paper.stake);
    this.papers.delete(paperId.toString());
    return { value: true };
  },

  getPaper(paperId: bigint) {
    const paper = this.papers.get(paperId.toString());
    return paper ? { value: paper } : { error: 103 };
  },
};

describe("Submission Contract", () => {
  beforeEach(() => {
    mockSubmissionContract.paused = false;
    mockSubmissionContract.paperCount = 0n;
    mockSubmissionContract.balances = new Map();
    mockSubmissionContract.papers = new Map();
  });

  it("should submit paper with valid inputs", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    const result = mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    expect(result).toEqual({ value: 1n });
    expect(mockSubmissionContract.papers.get("1")).toEqual({
      author: "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      ipfsHash: "QmValidHash12345678901234567890123456789012345678",
      stake: 1000000n,
      accepted: false,
      submissionTime: 1000n,
      reviewScore: 0n,
    });
    expect(mockSubmissionContract.balances.get("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toBe(1000000n);
  });

  it("should not submit paper if paused", () => {
    mockSubmissionContract.setPaused(mockSubmissionContract.admin, true);
    const result = mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    expect(result).toEqual({ error: 105 });
  });

  it("should not submit paper with invalid IPFS hash", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    const result = mockSubmissionContract.submitPaper("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "InvalidHash");
    expect(result).toEqual({ error: 102 });
  });

  it("should not submit paper if insufficient balance", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 500000n);
    const result = mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    expect(result).toEqual({ error: 101 });
  });

  it("should update paper status by review contract", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    const result = mockSubmissionContract.updatePaperStatus(mockSubmissionContract.reviewContract, 1n, true, 85n);
    expect(result).toEqual({ value: true });
    expect(mockSubmissionContract.papers.get("1")).toMatchObject({
      accepted: true,
      reviewScore: 85n,
    });
    expect(mockSubmissionContract.balances.get("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toBe(2000000n);
  });

  it("should not update paper status if not review contract", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    const result = mockSubmissionContract.updatePaperStatus("ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1", 1n, true, 85n);
    expect(result).toEqual({ error: 100 });
  });

  it("should withdraw stake for unaccepted paper", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    const result = mockSubmissionContract.withdrawStake("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ value: true });
    expect(mockSubmissionContract.papers.get("1")).toBeUndefined();
    expect(mockSubmissionContract.balances.get("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toBe(2000000n);
  });

  it("should not withdraw stake if paper accepted", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    mockSubmissionContract.updatePaperStatus(mockSubmissionContract.reviewContract, 1n, true, 85n);
    const result = mockSubmissionContract.withdrawStake("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n);
    expect(result).toEqual({ error: 109 });
  });

  it("should not withdraw stake if not author", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    const result = mockSubmissionContract.withdrawStake("ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1", 1n);
    expect(result).toEqual({ error: 108 });
  });

  it("should get paper details", () => {
    mockSubmissionContract.balances.set("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 2000000n);
    mockSubmissionContract.submitPaper(
      "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
      "QmValidHash12345678901234567890123456789012345678"
    );
    const result = mockSubmissionContract.getPaper(1n);
    expect(result).toEqual({
      value: {
        author: "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
        ipfsHash: "QmValidHash12345678901234567890123456789012345678",
        stake: 1000000n,
        accepted: false,
        submissionTime: 1000n,
        reviewScore: 0n,
      },
    });
  });

  it("should not get non-existent paper", () => {
    const result = mockSubmissionContract.getPaper(1n);
    expect(result).toEqual({ error: 103 });
  });
});