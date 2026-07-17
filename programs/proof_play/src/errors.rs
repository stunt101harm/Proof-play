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
}
