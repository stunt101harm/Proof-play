use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::{CreatePoolParams, PoolSide};

declare_id!("AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar");

#[program]
pub mod proof_play {
    use super::*;

    pub fn create_pool(context: Context<CreatePool>, params: CreatePoolParams) -> Result<()> {
        instructions::create_pool(context, params)
    }

    pub fn join_pool(context: Context<JoinPool>, side: PoolSide, amount: u64) -> Result<()> {
        instructions::join_pool(context, side, amount)
    }

    pub fn lock_pool(context: Context<LockPool>) -> Result<()> {
        instructions::lock_pool(context)
    }

    /// Temporary, explicitly labelled demo hook used only by wallet-free/devnet
    /// lifecycle testing. Proof-backed pools reject this instruction. Issue #15
    /// adds the production TxLINE validation path.
    pub fn record_demo_outcome(
        context: Context<RecordDemoOutcome>,
        winning_side: PoolSide,
        sequence: u64,
    ) -> Result<()> {
        instructions::record_demo_outcome(context, winning_side, sequence)
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
