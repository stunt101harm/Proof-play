use anchor_lang::prelude::*;

#[error_code]
pub enum ProofPlayError {
    #[msg("Fixture ID must be positive")]
    InvalidFixtureId,
    #[msg("Compiler version must be positive")]
    InvalidCompilerVersion,
    #[msg("Condition commitment cannot be all zeroes")]
    InvalidConditionCommitment,
    #[msg("Deposit cutoff must be in the future")]
    InvalidCutoff,
    #[msg("Refund availability must preserve the minimum settlement grace period")]
    InvalidRefundTime,
    #[msg("Deposit amount must be greater than zero")]
    InvalidAmount,
    #[msg("Pool is not open")]
    PoolNotOpen,
    #[msg("Pool cutoff has passed")]
    CutoffPassed,
    #[msg("Pool cutoff has not been reached")]
    CutoffNotReached,
    #[msg("Pool is not locked")]
    PoolNotLocked,
    #[msg("Pool has already been resolved")]
    PoolAlreadyResolved,
    #[msg("Pool arithmetic overflowed")]
    MathOverflow,
    #[msg("Position belongs to another pool, owner, or side")]
    PositionMismatch,
    #[msg("Position has already been claimed")]
    AlreadyClaimed,
    #[msg("Position has already been refunded")]
    AlreadyRefunded,
    #[msg("Position is not on the winning side")]
    NotWinningPosition,
    #[msg("Pool payout accounting is inconsistent")]
    InvalidPayoutState,
    #[msg("Only the creator may cancel before refund availability")]
    UnauthorizedCancellation,
    #[msg("Pool is not in a refundable state")]
    RefundNotAvailable,
    #[msg("Unverified settlement is disabled for this pool")]
    UnverifiedSettlementDisabled,
    #[msg("Settlement sequence must be positive")]
    InvalidSequence,
    #[msg("Vault balance is below the pool's recorded liability")]
    VaultBalanceMismatch,
    #[msg("Token mint does not match the pool")]
    TokenMintMismatch,
    #[msg("Token account owner does not match the position owner")]
    TokenOwnerMismatch,
    #[msg("Settlement configuration is invalid")]
    InvalidSettlementConfig,
    #[msg("Settlement strategy uses an unsupported predicate shape")]
    UnsupportedSettlementStrategy,
    #[msg("Settlement predicate references a stat index outside the configured inputs")]
    SettlementIndexOutOfBounds,
    #[msg("Settlement strategy must evaluate every configured stat exactly once")]
    InvalidSettlementCoverage,
    #[msg("Settlement configuration does not match the pool")]
    SettlementConfigMismatch,
    #[msg("Settlement strategy does not match the pool's immutable configuration")]
    SettlementStrategyMismatch,
    #[msg("TxLINE proof fixture does not match the pool")]
    SettlementFixtureMismatch,
    #[msg("TxLINE proof timestamp or update summary is invalid")]
    InvalidProofTimestamp,
    #[msg("TxLINE proof contains an invalid Merkle root")]
    InvalidProofRoot,
    #[msg("TxLINE proof stats do not match the pool's immutable configuration")]
    SettlementStatMismatch,
    #[msg("TxLINE settlement proofs must use final full-game period 100")]
    NonFinalSettlementProof,
    #[msg("TxLINE program account is not the supported devnet deployment")]
    InvalidTxlineProgram,
    #[msg("Daily scores root does not match the proof timestamp")]
    InvalidDailyScoresRoot,
    #[msg("Daily scores root is not owned by TxLINE")]
    InvalidDailyScoresRootOwner,
    #[msg("TxLINE validation payload could not be serialized")]
    TxlinePayloadSerializationFailed,
    #[msg("TxLINE validation did not return a result")]
    MissingTxlineReturnData,
    #[msg("TxLINE validation returned malformed data")]
    InvalidTxlineReturnData,
}
