;; Review Contract
;; Clarity v2
;; Manages peer review process, reviewer registration, and reward distribution

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-PAPER u201)
(define-constant ERR-ALREADY-REVIEWED u202)
(define-constant ERR-PAUSED u203)
(define-constant ERR-ZERO-ADDRESS u204)
(define-constant ERR-INVALID-SCORE u205)
(define-constant ERR-NOT-REGISTERED u206)
(define-constant ERR-INSUFFICIENT-REVIEWERS u207)
(define-constant ERR-REVIEW-PERIOD-EXPIRED u208)
(define-constant MAX-REVIEWERS u1000)
(define-constant REVIEW-REWARD u500000) ;; 0.5 JRNL token (6 decimals)
(define-constant REVIEW-PERIOD u1440) ;; ~1 day in blocks
(define-constant MIN-SCORE u0)
(define-constant MAX-SCORE u100)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var reviewer-count uint u0)
(define-data-var submission-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)

;; Data structures
(define-map reviewers
  { reviewer: principal }
  {
    expertise: (string-ascii 100),
    review-count: uint,
    average-score: uint
  }
)
(define-map reviews
  { paper-id: uint, reviewer: principal }
  {
    score: uint,
    comments: (string-ascii 500),
    submitted-at: uint
  }
)
(define-map paper-reviewers
  { paper-id: uint }
  (list 3 principal)
)

;; Private helpers
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-valid-score (score uint))
  (and (>= score MIN-SCORE) (<= score MAX-SCORE))
)

;; Admin functions
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-submission-contract (new-submission-contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-submission-contract 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set submission-contract new-submission-contract)
    (ok true)
  )
)

(define-public (set-token-contract (new-token-contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-token-contract 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set token-contract new-token-contract)
    (ok true)
  )
)

;; Core functionality
(define-public (register-reviewer (expertise (string-ascii 100)))
  (begin
    (ensure-not-paused)
    (asserts! (< (var-get reviewer-count) MAX-REVIEWERS) (err ERR-INSUFFICIENT-REVIEWERS))
    (asserts! (is-none (map-get? reviewers { reviewer: tx-sender })) (err ERR-ALREADY-REVIEWED))
    (map-set reviewers
      { reviewer: tx-sender }
      { expertise: expertise, review-count: u0, average-score: u0 }
    )
    (var-set reviewer-count (+ (var-get reviewer-count) u1))
    (print { event: "reviewer-registered", reviewer: tx-sender, expertise: expertise })
    (ok true)
  )
)

(define-public (assign-paper (paper-id uint) (reviewer principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? reviewers { reviewer: reviewer })) (err ERR-NOT-REGISTERED))
    (match (map-get? paper-reviewers { paper-id: paper-id })
      reviewer-list
      (begin
        (asserts! (< (len reviewer-list) u3) (err ERR-INSUFFICIENT-REVIEWERS))
        (map-set paper-reviewers { paper-id: paper-id } (unwrap-panic (as-max-len? (append reviewer-list reviewer) u3)))
        (ok true)
      )
      (begin
        (map-set paper-reviewers { paper-id: paper-id } (list reviewer))
        (ok true)
      )
    )
  )
)

(define-public (submit-review (paper-id uint) (score uint) (comments (string-ascii 500)))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? reviewers { reviewer: tx-sender })) (err ERR-NOT-REGISTERED))
    (asserts! (is-valid-score score) (err ERR-INVALID-SCORE))
    (match (map-get? paper-reviewers { paper-id: paper-id })
      reviewer-list
      (asserts! (is-some (index-of reviewer-list tx-sender)) (err ERR-NOT-AUTHORIZED))
      (err ERR-INVALID-PAPER)
    )
    (asserts! (is-none (map-get? reviews { paper-id: paper-id, reviewer: tx-sender })) (err ERR-ALREADY-REVIEWED))
    (asserts! (< (- block-height (unwrap-panic (contract-call? (var-get submission-contract) get-paper paper-id))) REVIEW-PERIOD) (err ERR-REVIEW-PERIOD-EXPIRED))
    (map-set reviews
      { paper-id: paper-id, reviewer: tx-sender }
      { score: score, comments: comments, submitted-at: block-height }
    )
    (try! (as-contract (contract-call? (var-get token-contract) transfer REVIEW-REWARD (as-contract tx-sender) tx-sender)))
    (let
      (
        (reviewer-data (unwrap-panic (map-get? reviewers { reviewer: tx-sender })))
        (new-count (+ (get review-count reviewer-data) u1))
        (new-score (/ (+ (* (get average-score reviewer-data) (get review-count reviewer-data)) score) new-count))
      )
      (map-set reviewers
        { reviewer: tx-sender }
        (merge reviewer-data { review-count: new-count, average-score: new-score })
      )
    )
    (print { event: "review-submitted", paper-id: paper-id, reviewer: tx-sender, score: score })
    (ok true)
  )
)

;; Read-only functions
(define-read-only (get-reviewer (reviewer principal))
  (match (map-get? reviewers { reviewer: reviewer })
    data (ok data)
    (err ERR-NOT-REGISTERED)
  )
)

(define-read-only (get-review (paper-id uint) (reviewer principal))
  (match (map-get? reviews { paper-id: paper-id, reviewer: reviewer })
    data (ok data)
    (err ERR-ALREADY-REVIEWED)
  )
)

(define-read-only (get-paper-reviewers (paper-id uint))
  (ok (default-to (list) (map-get? paper-reviewers { paper-id: paper-id })))
)

(define-read-only (get-reviewer-count)
  (ok (var-get reviewer-count))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)