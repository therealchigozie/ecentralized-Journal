import { describe, it, expect, beforeEach } from "vitest";

interface Reviewer {
  expertise: string;
  reviewCount: bigint;
  averageScore: bigint;
}

interface Review {
  score: bigint;
  comments: string;
  submittedAt: bigint;
}

interface MockReviewContract {
  admin: string;
  paused: boolean;
  reviewerCount: bigint;
  submissionContract: string;
  tokenContract: string;
  reviewers: Map<string, Reviewer>;
  reviews: Map<string, Review>;
  paperReviewers: Map<string, string[]>;
  REVIEW_REWARD: bigint;
  REVIEW_PERIOD: bigint;
  MAX_REVIEWERS: bigint;
  MIN_SCORE: bigint;
  MAX_SCORE: bigint;

  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  registerReviewer(caller: string, expertise: string): { value: boolean } | { error: number };
  assignPaper(caller: string, paperId: bigint, reviewer: string): { value: boolean } | { error: number };
  submitReview(caller: string, paperId: bigint, score: bigint, comments: string): { value: boolean } | { error: number };
  getReviewer(reviewer: string): { value: Reviewer } | { error: number };
}

const mockReviewContract: MockReviewContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  reviewerCount: 0n,
  submissionContract: "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4",
  tokenContract: "ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1",
  reviewers: new Map<string, Reviewer>(),
  reviews: new Map<string, Review>(),
  paperReviewers: new Map<string, string[]>(),
  REVIEW_REWARD: 500_000n,
  REVIEW_PERIOD: 1440n,
  MAX_REVIEWERS: 1000n,
  MIN_SCORE: 0n,
  MAX_SCORE: 100n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.paused = pause;
    return { value: pause };
  },

  registerReviewer(caller: string, expertise: string) {
    if (this.paused) return { error: 203 };
    if (this.reviewerCount >= this.MAX_REVIEWERS) return { error: 207 };
    if (this.reviewers.has(caller)) return { error: 206 };
    this.reviewers.set(caller, { expertise, reviewCount: 0n, averageScore: 0n });
    this.reviewerCount += 1n;
    return { value: true };
  },

  assignPaper(caller: string, paperId: bigint, reviewer: string) {
    if (!this.isAdmin(caller)) return { error: 200 };
    if (!this.reviewers.has(reviewer)) return { error: 206 };
    const paperKey = paperId.toString();
    const reviewers = this.paperReviewers.get(paperKey) || [];
    if (reviewers.length >= 3) return { error: 207 };
    this.paperReviewers.set(paperKey, [...reviewers, reviewer]);
    return { value: true };
  },

  submitReview(caller: string, paperId: bigint, score: bigint, comments: string) {
    if (this.paused) return { error: 203 };
    if (!this.reviewers.has(caller)) return { error: 206 };
    if (score < this.MIN_SCORE || score > this.MAX_SCORE) return { error: 205 };
    const paperKey = paperId.toString();
    const reviewers = this.paperReviewers.get(paperKey) || [];
    if (!reviewers.includes(caller)) return { error: 200 };
    const reviewKey = `${paperId}-${caller}`;
    if (this.reviews.has(reviewKey)) return { error: 202 };
    this.reviews.set(reviewKey, { score, comments, submittedAt: BigInt(1000) });
    const reviewerData = this.reviewers.get(caller)!;
    const newCount = reviewerData.reviewCount + 1n;
    const newScore = (reviewerData.averageScore * reviewerData.reviewCount + score) / newCount;
    this.reviewers.set(caller, { ...reviewerData, reviewCount: newCount, averageScore: newScore });
    return { value: true };
  },

  getReviewer(reviewer: string) {
    const data = this.reviewers.get(reviewer);
    return data ? { value: data } : { error: 206 };
  },
};

describe("Review Contract", () => {
  beforeEach(() => {
    mockReviewContract.paused = false;
    mockReviewContract.reviewerCount = 0n;
    mockReviewContract.reviewers = new Map();
    mockReviewContract.reviews = new Map();
    mockReviewContract.paperReviewers = new Map();
  });

  it("should register a reviewer", () => {
    const result = mockReviewContract.registerReviewer("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Computer Science");
    expect(result).toEqual({ value: true });
    expect(mockReviewContract.reviewers.get("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toEqual({
      expertise: "Computer Science",
      reviewCount: 0n,
      averageScore: 0n,
    });
  });

  it("should not register reviewer if paused", () => {
    mockReviewContract.setPaused(mockReviewContract.admin, true);
    const result = mockReviewContract.registerReviewer("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Computer Science");
    expect(result).toEqual({ error: 203 });
  });

  it("should assign paper to reviewer", () => {
    mockReviewContract.registerReviewer("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Computer Science");
    const result = mockReviewContract.assignPaper(mockReviewContract.admin, 1n, "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4");
    expect(result).toEqual({ value: true });
    expect(mockReviewContract.paperReviewers.get("1")).toEqual(["ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4"]);
  });

  it("should not assign paper if not admin", () => {
    const result = mockReviewContract.assignPaper("ST3NBRSFKX28S2H8DY3DE3HTKYX9Z6X9B5B8K0M1", 1n, "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4");
    expect(result).toEqual({ error: 200 });
  });

  it("should submit review", () => {
    mockReviewContract.registerReviewer("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Computer Science");
    mockReviewContract.assignPaper(mockReviewContract.admin, 1n, "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4");
    const result = mockReviewContract.submitReview("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, 80n, "Good paper");
    expect(result).toEqual({ value: true });
    expect(mockReviewContract.reviews.get("1-ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4")).toEqual({
      score: 80n,
      comments: "Good paper",
      submittedAt: 1000n,
    });
  });

  it("should not submit review with invalid score", () => {
    mockReviewContract.registerReviewer("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", "Computer Science");
    mockReviewContract.assignPaper(mockReviewContract.admin, 1n, "ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4");
    const result = mockReviewContract.submitReview("ST2CY5AA7S8M83YVPR06ZNYV216G35A6FPN5JZK4", 1n, 101n, "Invalid score");
    expect(result).toEqual({ error: 205 });
  });
});