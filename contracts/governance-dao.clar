;; Governance DAO Contract
;; Clarity v2
;; Manages token-weighted voting and proposal execution for platform governance

(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-PAUSED u301)
(define-constant ERR-ZERO-ADDRESS u302)
(define-constant ERR-INVALID-PROPOSAL u303)
(define-constant ERR-ALREADY-VOTED u304)
(define-constant ERR-VOTING-CLOSED u305)
(define-constant ERR-QUORUM-NOT-MET u306)
(define-constant ERR-INVALID-VOTE u307)
(define-constant ERR-INVALID-DESCRIPTION u308)
(define-constant ERR-INVALID-STAKE-AMOUNT u309)

(define-constant VOTING-PERIOD u2880)                 ;; ~2 days in blocks
(define-constant QUORUM-PERCENT u5000)                ;; 50% of staked tokens
(define-constant MAX-PROPOSALS u1000)
(define-constant PROPOSAL-STAKE u1000000)             ;; 1 JRNL token (6 decimals)
(define-constant MAX-STAKE-AMOUNT u1000000000)        ;; 1000 JRNL tokens
(define-constant MIN-DESCRIPTION-LENGTH u10)
(define-constant MAX-DESCRIPTION-LENGTH u500)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var proposal-count uint u0)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var total-staked uint u0)

;; Data structures
(define-map proposals
  { proposal-id: uint }
  {
    proposer: principal,
    description: (string-ascii 500),
    stake-amount: uint,
    start-block: uint,
    end-block: uint,
    yes-votes: uint,
    no-votes: uint,
    executed: bool
  }
)

(define-map votes
  { proposal-id: uint, voter: principal }
  bool
)

(define-map staked-balances principal uint)

;; -------- Private helpers --------

(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-valid-description (description (string-ascii 500)))
  (and (>= (len description) MIN-DESCRIPTION-LENGTH)
       (<= (len description) MAX-DESCRIPTION-LENGTH))
)

(define-private (is-valid-stake-amount (amount uint))
  (and (> amount u0) (<= amount MAX-STAKE-AMOUNT))
)

;; -------- Admin functions --------

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

(define-public (set-token-contract (new-token-contract principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-token-contract 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set token-contract new-token-contract)
    (ok true)
  )
)

;; -------- Core functionality --------

;; Stake tokens: transfer from user -> contract, credit staked balance
(define-public (stake-tokens (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-VOTE))
    (let ((user tx-sender))
      ;; Call token contract as *this* contract, sending tokens from user to contract
      (as-contract
        (try! (contract-call? (var-get token-contract) transfer amount user tx-sender))
      )
    )
    (map-set staked-balances tx-sender (+ amount (default-to u0 (map-get? staked-balances tx-sender))))
    (var-set total-staked (+ (var-get total-staked) amount))
    (print { event: "tokens-staked", staker: tx-sender, amount: amount })
    (ok true)
  )
)

;; Unstake tokens: transfer from contract -> user, debit staked balance
(define-public (unstake-tokens (amount uint))
  (begin
    (ensure-not-paused)
    (let ((stake-balance (default-to u0 (map-get? staked-balances tx-sender))))
      (asserts! (>= stake-balance amount) (err ERR-INVALID-VOTE))
      (map-set staked-balances tx-sender (- stake-balance amount))
      (var-set total-staked (- (var-get total-staked) amount))
      (let ((recipient tx-sender))
        (as-contract
          (try! (contract-call? (var-get token-contract) transfer amount tx-sender recipient))
        )
      )
      (print { event: "tokens-unstaked", unstaker: tx-sender, amount: amount })
      (ok true)
    )
  )
)

(define-public (create-proposal (description (string-ascii 500)) (stake-amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-valid-description description) (err ERR-INVALID-DESCRIPTION))
    (asserts! (is-valid-stake-amount stake-amount) (err ERR-INVALID-STAKE-AMOUNT))
    (asserts! (< (var-get proposal-count) MAX-PROPOSALS) (err ERR-INVALID-PROPOSAL))
    (asserts! (> (default-to u0 (map-get? staked-balances tx-sender)) u0) (err ERR-NOT-AUTHORIZED))

    ;; Charge proposal stake: user -> contract
    (let ((user tx-sender))
      (as-contract
        (try! (contract-call? (var-get token-contract) transfer PROPOSAL-STAKE user tx-sender))
      )
    )

    (let ((proposal-id (+ (var-get proposal-count) u1)))
      (map-set proposals
        { proposal-id: proposal-id }
        {
          proposer: tx-sender,
          description: description,
          stake-amount: stake-amount,
          start-block: block-height,
          end-block: (+ block-height VOTING-PERIOD),
          yes-votes: u0,
          no-votes: u0,
          executed: false
        }
      )
      (var-set proposal-count proposal-id)
      (print { event: "proposal-created", proposal-id: proposal-id, proposer: tx-sender })
      (ok proposal-id)
    )
  )
)

;; Renamed to avoid interdependent-function detection and shadowing
(define-public (cast-vote (proposal-id uint) (support bool))
  (begin
    (ensure-not-paused)
    (match (map-get? proposals { proposal-id: proposal-id })
      proposal
      (begin
        (asserts! (< block-height (get end-block proposal)) (err ERR-VOTING-CLOSED))
        (asserts! (is-none (map-get? votes { proposal-id: proposal-id, voter: tx-sender })) (err ERR-ALREADY-VOTED))
        (let ((stake (default-to u0 (map-get? staked-balances tx-sender))))
          (asserts! (> stake u0) (err ERR-INVALID-VOTE))
          (map-set votes { proposal-id: proposal-id, voter: tx-sender } support)
          (map-set proposals
            { proposal-id: proposal-id }
            (merge proposal
              {
                yes-votes: (if support (+ (get yes-votes proposal) stake) (get yes-votes proposal)),
                no-votes:  (if (not support) (+ (get no-votes proposal) stake) (get no-votes proposal))
              }
            )
          )
          (print { event: "vote-cast", proposal-id: proposal-id, voter: tx-sender, support: support, weight: stake })
          (ok true)
        )
      )
      (err ERR-INVALID-PROPOSAL)
    )
  )
)

(define-public (execute-proposal (proposal-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? proposals { proposal-id: proposal-id })
      proposal
      (let ((total-votes (+ (get yes-votes proposal) (get no-votes proposal))))
        (asserts! (>= block-height (get end-block proposal)) (err ERR-VOTING-CLOSED))
        (asserts! (not (get executed proposal)) (err ERR-INVALID-PROPOSAL))
        (asserts! (>= total-votes (/ (* (var-get total-staked) QUORUM-PERCENT) u10000)) (err ERR-QUORUM-NOT-MET))
        (if (> (get yes-votes proposal) (get no-votes proposal))
          (begin
            (map-set proposals { proposal-id: proposal-id } (merge proposal { executed: true }))
            (print { event: "proposal-executed", proposal-id: proposal-id, stake-amount: (get stake-amount proposal) })
            (ok true)
          )
          (ok false)
        )
      )
      (err ERR-INVALID-PROPOSAL)
    )
  )
)

;; -------- Read-only functions --------

(define-read-only (get-proposal (proposal-id uint))
  (match (map-get? proposals { proposal-id: proposal-id })
    data (ok data)
    (err ERR-INVALID-PROPOSAL)
  )
)

(define-read-only (get-vote (proposal-id uint) (voter principal))
  (ok (default-to false (map-get? votes { proposal-id: proposal-id, voter: voter })))
)

(define-read-only (get-staked-balance (account principal))
  (ok (default-to u0 (map-get? staked-balances account)))
)

(define-read-only (get-proposal-count)
  (ok (var-get proposal-count))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)
