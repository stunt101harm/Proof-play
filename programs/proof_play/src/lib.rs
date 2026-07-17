use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod txline;

use instructions::*;
use state::{CreatePoolParams, PoolSide, SettlementConfigParams};
use txline::{NDimensionalStrategy, StatValidationInputV3};

declare_id!("AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar");

#[program]
pub mod proof_play {
    use super::*;

    pub fn create_pool(
        context: Context<CreatePool>,
        params: CreatePoolParams,
        settlement: SettlementConfigParams,
    ) -> Result<()> {
        instructions::create_pool(context, params, settlement)
    }

    pub fn join_pool(context: Context<JoinPool>, side: PoolSide, amount: u64) -> Result<()> {
        instructions::join_pool(context, side, amount)
    }

    pub fn lock_pool(context: Context<LockPool>) -> Result<()> {
        instructions::lock_pool(context)
    }

    /// Temporary, explicitly labelled hook used only by demo-mode lifecycle
    /// testing. Production pools reject this instruction.
    pub fn record_demo_outcome(
        context: Context<RecordDemoOutcome>,
        winning_side: PoolSide,
        sequence: u64,
    ) -> Result<()> {
        instructions::record_demo_outcome(context, winning_side, sequence)
    }

    /// Permissionless production settlement. The program validates a final
    /// TxLINE V3 proof against the pool's immutable condition before recording
    /// either the YES or NO outcome.
    pub fn settle_pool(
        context: Context<SettlePool>,
        payload: StatValidationInputV3,
        strategy: NDimensionalStrategy,
        observed_sequence: u64,
    ) -> Result<()> {
        instructions::settle_pool(context, payload, strategy, observed_sequence)
    }

    pub fn cancel_pool(context: Context<CancelPool>) -> Result<()> {
        instructions::cancel_pool(context)
    }

    pub fn claim(context: Context<Claim>) -> Result<()> {
        instructions::claim(context)
    }

    pub fn refund(context: Context<Refund>) -> Result<()> {
        instructions::refund(context)
    }
}
