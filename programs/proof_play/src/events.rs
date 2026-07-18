use anchor_lang::prelude::*;

use crate::state::{PoolSide, PoolState};

#[event]
pub struct PoolCreated {
    pub pool: Pubkey,
    pub creator: Pubkey,
    pub fixture_id: i64,
    pub pool_id: u64,
    pub token_mint: Pubkey,
    pub cutoff_unix_seconds: i64,
    pub refund_after_unix_seconds: i64,
    pub compiler_version: u16,
    pub condition_commitment: [u8; 32],
    pub demo_mode: bool,
}

#[event]
pub struct SettlementConfigCreated {
    pub pool: Pubkey,
    pub settlement_config: Pubkey,
    pub compiler_version: u16,
    pub condition_commitment: [u8; 32],
    pub stat_keys: Vec<u32>,
}

#[event]
pub struct PoolJoined {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub side: PoolSide,
    pub amount: u64,
    pub position_amount: u64,
    pub yes_amount: u64,
    pub no_amount: u64,
}

#[event]
pub struct PoolLocked {
    pub pool: Pubkey,
    pub locked_at: i64,
}

#[event]
pub struct DemoOutcomeRecorded {
    pub pool: Pubkey,
    pub winning_side: PoolSide,
    pub sequence: u64,
    pub resulting_state: PoolState,
    pub remaining_pool_amount: u64,
    pub remaining_winning_stake: u64,
}

#[event]
pub struct PoolSettledFromTxline {
    pub pool: Pubkey,
    pub settlement_record: Pubkey,
    pub settler: Pubkey,
    pub txline_program: Pubkey,
    pub daily_scores_root: Pubkey,
    pub proof_timestamp_ms: i64,
    /// TxLINE's proof API selects the event by sequence, but V3's on-chain
    /// payload commits to the event root rather than including the sequence.
    pub observed_sequence: u64,
    pub event_stat_root: [u8; 32],
    pub stat_keys: Vec<u32>,
    pub stat_values: Vec<i32>,
    pub predicate_result: bool,
    pub winning_side: PoolSide,
    pub resulting_state: PoolState,
}

#[event]
pub struct PoolCancelled {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub cancelled_at: i64,
    pub remaining_pool_amount: u64,
}

#[event]
pub struct PayoutClaimed {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub side: PoolSide,
    pub stake: u64,
    pub payout: u64,
    pub remaining_pool_amount: u64,
    pub remaining_winning_stake: u64,
}

#[event]
pub struct PositionRefunded {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub side: PoolSide,
    pub amount: u64,
    pub remaining_pool_amount: u64,
}

#[event]
pub struct PoolClosed {
    pub pool: Pubkey,
    pub final_state: PoolState,
    pub closed_at: i64,
}
