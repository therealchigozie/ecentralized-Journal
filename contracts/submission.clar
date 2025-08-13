;; Submission Contract
;; Clarity v2
;; Manages paper submissions with token staking, IPFS storage, and review integration

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INVALID-IPFS-HASH u102)
(define-constant ERR-PAPER-NOT-FOUND u103)
(define-constant ERR-ALREADY-SUBMITTED u104)
(define-constant ERR-PAUSED u105)
(define-constant ERR-ZERO-ADDRESS u106)
(define-constant ERR-INVALID-STAKE u107)
(define-constant ERR-NOT-SUBMITTED u108)
(define-constant ERR-ALREADY-ACCEPTED u109)

;; Token and contract metadata
(define-constant TOKEN-NAME "Journal Token")
(define-constant TOKEN-SYMBOL "JRNL")
(define-constant TOKEN-DECIMALS u6)
(define-constant SUBMISSION-STAKE u1000000) ;; 1 JRNL token (with 6 decimals)
(define-constant MAX-PAPERS u1000000) ;; Max papers allowed

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var paper-count uint u0)
(define-data-var review-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)

;; Data structures
(define-map papers
  { paper-id: uint }
  {
    author: principal,
    ipfs-hash: (string-ascii 64),
    stake: uint,
    accepted: bool,
    submission-time: uint,
    review-score: uint
  }
)
(define-map balances principal uint)

;; Private helpers
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-valid-ipfs-hash (hash (string-ascii 64)))
  (and (> (len hash) u46) (is-eq (slice? hash u0 u2) "Qm"))
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

(define-public (set-review-contract (new-review-contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-review-contract 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set review-contract new-review-contract)
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
(define-public (submit-paper (ipfs-hash (string-ascii 64)))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-ipfs-hash ipfs-hash) (err ERR-INVALID-IPFS-HASH))
    (asserts! (< (var-get paper-count) MAX-PAPERS) (err ERR-ALREADY-SUBMITTED))
    (let
      (
        (balance (default-to u0 (map-get? balances tx-sender)))
        (paper-id (+ (var-get paper-count) u1))
      )
      (asserts! (>= balance SUBMISSION-STAKE) (err ERR-INSUFFICIENT-BALANCE))
      (asserts! (> SUBMISSION-STAKE u0) (err ERR-INVALID-STAKE))
      (try! (contract-call? (var-get token-contract) transfer SUBMISSION-STAKE tx-sender (as-contract tx-sender)))
      (map-set papers
        { paper-id: paper-id }
        {
          author: tx-sender,
          ipfs-hash: ipfs-hash,
          stake: SUBMISSION-STAKE,
          accepted: false,
          submission-time: block-height,
          review-score: u0
        }
      )
      (var-set paper-count paper-id)
      (print { event: "paper-submitted", paper-id: paper-id, author: tx-sender, ipfs-hash: ipfs-hash })
      (ok paper-id)
    )
  )
)

(define-public (update-paper-status (paper-id uint) (accepted bool) (review-score uint))
  (begin
    (asserts! (is-eq tx-sender (var-get review-contract)) (err ERR-NOT-AUTHORIZED))
    (match (map-get? papers { paper-id: paper-id })
      paper
      (begin
        (asserts! (not (get accepted paper)) (err ERR-ALREADY-ACCEPTED))
        (map-set papers
          { paper-id: paper-id }
          (merge paper { accepted: accepted, review-score: review-score })
        )
        (if accepted
          (try! (as-contract (contract-call? (var-get token-contract) transfer (get stake paper) (get author paper) (as-contract tx-sender))))
          (ok true)
        )
        (ok true)
      )
      (err ERR-PAPER-NOT-FOUND)
    )
  )
)

(define-public (withdraw-stake (paper-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? papers { config-id: paper-id })
      paper
      (begin
        (asserts! (is-eq (get author paper) tx-sender) (err ERR-NOT-AUTHORIZED))
        (asserts! (not (get accepted paper)) (err ERR-ALREADY-ACCEPTED))
        (asserts! (> (get stake paper) u0) (err ERR-INVALID-STAKE))
        (try! (as-contract (contract-call? (var-get token-contract) transfer (get stake paper) (get author paper) (as-contract tx-sender))))
        (map-delete papers { paper-id: paper-id })
        (ok true)
      )
      (err ERR-PAPER-NOT-FOUND)
    )
  )
)

;; Read-only functions
(define-read-only (get-paper (paper-id uint))
  (match (map-get? papers { paper-id: paper-id })
    paper (ok paper)
    (err ERR-PAPER-NOT-FOUND)
  )
)

(define-read-only (get-paper-count)
  (ok (var-get paper-count))
)

(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)