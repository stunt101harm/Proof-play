use anchor_lang::prelude::*;

use crate::{
    errors::ProofPlayError,
    txline::{
        NDimensionalStrategy, StatValidationInputV3, FINAL_MATCH_PERIOD, MAX_SETTLEMENT_STATS,
        TXLINE_PROGRAM_ID,
    },
};

pub const MIN_SETTLEMENT_GRACE_SECONDS: i64 = 3_600;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
pub enum PoolSide {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
pub enum PoolState {
    Open,
    Locked,
    SettledYes,
    SettledNo,
    Cancelled,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreatePoolParams {
    pub pool_id: u64,
    pub fixture_id: i64,
    pub condition_commitment: [u8; 32],
    pub compiler_version: u16,
    pub cutoff_unix_seconds: i64,
    pub refund_after_unix_seconds: i64,
    pub demo_mode: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SettlementConfigParams {
    pub stat_keys: Vec<u32>,
    pub strategy: NDimensionalStrategy,
}

#[account]
#[derive(Debug, InitSpace)]
pub struct SettlementConfig {
    pub pool: Pubkey,
    pub condition_commitment: [u8; 32],
    pub compiler_version: u16,
    #[max_len(4)]
    pub stat_keys: Vec<u32>,
    pub strategy: NDimensionalStrategy,
    pub bump: u8,
}

impl SettlementConfig {
    pub fn initialize(
        &mut self,
        pool: Pubkey,
        condition_commitment: [u8; 32],
        compiler_version: u16,
        params: &SettlementConfigParams,
        bump: u8,
    ) -> Result<()> {
        require!(
            !params.stat_keys.is_empty() && params.stat_keys.len() <= MAX_SETTLEMENT_STATS,
            ProofPlayError::InvalidSettlementConfig
        );
        require!(
            params
                .stat_keys
                .iter()
                .all(|key| matches!(*key, 1 | 2 | 7 | 8))
                && params.stat_keys.windows(2).all(|keys| keys[0] < keys[1]),
            ProofPlayError::InvalidSettlementConfig
        );
        require!(
            params.strategy.geometric_targets.is_empty()
                && params.strategy.distance_predicate.is_none()
                && !params.strategy.discrete_predicates.is_empty()
                && params.strategy.discrete_predicates.len() <= MAX_SETTLEMENT_STATS,
            ProofPlayError::UnsupportedSettlementStrategy
        );

        let mut coverage = [0_u8; MAX_SETTLEMENT_STATS];
        for predicate in &params.strategy.discrete_predicates {
            let (indexes, count) = predicate.indexes();
            for index in indexes.iter().take(count) {
                require!(
                    *index < params.stat_keys.len(),
                    ProofPlayError::SettlementIndexOutOfBounds
                );
                coverage[*index] = coverage[*index]
                    .checked_add(1)
                    .ok_or(ProofPlayError::MathOverflow)?;
            }
        }
        require!(
            coverage[..params.stat_keys.len()]
                .iter()
                .all(|count| *count == 1),
            ProofPlayError::InvalidSettlementCoverage
        );

        self.pool = pool;
        self.condition_commitment = condition_commitment;
        self.compiler_version = compiler_version;
        self.stat_keys.clone_from(&params.stat_keys);
        self.strategy.clone_from(&params.strategy);
        self.bump = bump;
        Ok(())
    }

    pub fn validate_payload(
        &self,
        pool_key: Pubkey,
        pool: &Pool,
        payload: &StatValidationInputV3,
        strategy: &NDimensionalStrategy,
    ) -> Result<()> {
        require_keys_eq!(
            self.pool,
            pool_key,
            ProofPlayError::SettlementConfigMismatch
        );
        require!(
            self.condition_commitment == pool.condition_commitment
                && self.compiler_version == pool.compiler_version,
            ProofPlayError::SettlementConfigMismatch
        );
        require!(
            strategy == &self.strategy,
            ProofPlayError::SettlementStrategyMismatch
        );
        require!(
            payload.fixture_summary.fixture_id == pool.fixture_id,
            ProofPlayError::SettlementFixtureMismatch
        );
        require!(
            payload.ts >= 0
                && payload.ts == payload.fixture_summary.update_stats.min_timestamp
                && payload.fixture_summary.update_stats.update_count > 0
                && payload.fixture_summary.update_stats.min_timestamp
                    <= payload.fixture_summary.update_stats.max_timestamp,
            ProofPlayError::InvalidProofTimestamp
        );
        require!(
            payload.event_stat_root.iter().any(|byte| *byte != 0)
                && payload
                    .fixture_summary
                    .events_sub_tree_root
                    .iter()
                    .any(|byte| *byte != 0),
            ProofPlayError::InvalidProofRoot
        );
        require!(
            payload.leaves.len() == self.stat_keys.len()
                && payload.leaf_indices.len() == self.stat_keys.len(),
            ProofPlayError::SettlementStatMismatch
        );
        for (leaf, expected_key) in payload.leaves.iter().zip(&self.stat_keys) {
            require!(
                leaf.stat.key == *expected_key,
                ProofPlayError::SettlementStatMismatch
            );
            require!(
                leaf.stat.period == FINAL_MATCH_PERIOD,
                ProofPlayError::NonFinalSettlementProof
            );
        }
        Ok(())
    }
}

#[account]
#[derive(Debug, InitSpace)]
pub struct Pool {
    pub creator: Pubkey,
    pub fixture_id: i64,
    pub pool_id: u64,
    pub token_mint: Pubkey,
    pub condition_commitment: [u8; 32],
    pub compiler_version: u16,
    pub cutoff_unix_seconds: i64,
    pub refund_after_unix_seconds: i64,
    pub created_at: i64,
    pub state: PoolState,
    pub winning_side: Option<PoolSide>,
    pub yes_amount: u64,
    pub no_amount: u64,
    pub remaining_pool_amount: u64,
    pub remaining_winning_stake: u64,
    pub settled_sequence: u64,
    pub demo_mode: bool,
    pub bump: u8,
}

impl Pool {
    pub fn initialize(
        &mut self,
        creator: Pubkey,
        token_mint: Pubkey,
        params: &CreatePoolParams,
        now: i64,
        bump: u8,
    ) -> Result<()> {
        require!(params.fixture_id > 0, ProofPlayError::InvalidFixtureId);
        require!(
            params.compiler_version > 0,
            ProofPlayError::InvalidCompilerVersion
        );
        require!(
            params.condition_commitment.iter().any(|byte| *byte != 0),
            ProofPlayError::InvalidConditionCommitment
        );
        require!(
            params.cutoff_unix_seconds > now,
            ProofPlayError::InvalidCutoff
        );
        let minimum_refund_time = params
            .cutoff_unix_seconds
            .checked_add(MIN_SETTLEMENT_GRACE_SECONDS)
            .ok_or(ProofPlayError::MathOverflow)?;
        require!(
            params.refund_after_unix_seconds >= minimum_refund_time,
            ProofPlayError::InvalidRefundTime
        );

        self.creator = creator;
        self.fixture_id = params.fixture_id;
        self.pool_id = params.pool_id;
        self.token_mint = token_mint;
        self.condition_commitment = params.condition_commitment;
        self.compiler_version = params.compiler_version;
        self.cutoff_unix_seconds = params.cutoff_unix_seconds;
        self.refund_after_unix_seconds = params.refund_after_unix_seconds;
        self.created_at = now;
        self.state = PoolState::Open;
        self.winning_side = None;
        self.yes_amount = 0;
        self.no_amount = 0;
        self.remaining_pool_amount = 0;
        self.remaining_winning_stake = 0;
        self.settled_sequence = 0;
        self.demo_mode = params.demo_mode;
        self.bump = bump;
        Ok(())
    }

    pub fn add_stake(&mut self, side: PoolSide, amount: u64, now: i64) -> Result<()> {
        require!(self.state == PoolState::Open, ProofPlayError::PoolNotOpen);
        require!(now < self.cutoff_unix_seconds, ProofPlayError::CutoffPassed);
        require!(amount > 0, ProofPlayError::InvalidAmount);

        let current_side_amount = match side {
            PoolSide::Yes => self.yes_amount,
            PoolSide::No => self.no_amount,
        };
        let next_side_amount = current_side_amount
            .checked_add(amount)
            .ok_or(ProofPlayError::MathOverflow)?;
        let next_remaining_pool_amount = self
            .remaining_pool_amount
            .checked_add(amount)
            .ok_or(ProofPlayError::MathOverflow)?;
        match side {
            PoolSide::Yes => self.yes_amount = next_side_amount,
            PoolSide::No => self.no_amount = next_side_amount,
        }
        self.remaining_pool_amount = next_remaining_pool_amount;
        Ok(())
    }

    pub fn lock(&mut self, now: i64) -> Result<()> {
        require!(self.state == PoolState::Open, ProofPlayError::PoolNotOpen);
        require!(
            now >= self.cutoff_unix_seconds,
            ProofPlayError::CutoffNotReached
        );
        self.state = PoolState::Locked;
        Ok(())
    }

    pub fn record_demo_outcome(&mut self, side: PoolSide, sequence: u64) -> Result<()> {
        require!(self.demo_mode, ProofPlayError::UnverifiedSettlementDisabled);
        self.record_outcome(side, sequence)
    }

    pub fn record_verified_outcome(&mut self, side: PoolSide, sequence: u64) -> Result<()> {
        self.record_outcome(side, sequence)
    }

    fn record_outcome(&mut self, side: PoolSide, sequence: u64) -> Result<()> {
        require!(
            self.state == PoolState::Locked,
            ProofPlayError::PoolNotLocked
        );
        require!(sequence > 0, ProofPlayError::InvalidSequence);

        let winning_stake = match side {
            PoolSide::Yes => self.yes_amount,
            PoolSide::No => self.no_amount,
        };
        self.winning_side = Some(side);
        self.settled_sequence = sequence;
        self.remaining_winning_stake = winning_stake;
        self.state = if self.remaining_pool_amount == 0 {
            PoolState::Closed
        } else if winning_stake == 0 {
            PoolState::Cancelled
        } else {
            match side {
                PoolSide::Yes => PoolState::SettledYes,
                PoolSide::No => PoolState::SettledNo,
            }
        };
        Ok(())
    }

    pub fn cancel(&mut self, authority: Pubkey, now: i64) -> Result<()> {
        require!(
            self.state == PoolState::Open || self.state == PoolState::Locked,
            ProofPlayError::PoolAlreadyResolved
        );
        require!(
            authority == self.creator || now >= self.refund_after_unix_seconds,
            ProofPlayError::UnauthorizedCancellation
        );
        self.winning_side = None;
        self.remaining_winning_stake = 0;
        self.state = if self.remaining_pool_amount == 0 {
            PoolState::Closed
        } else {
            PoolState::Cancelled
        };
        Ok(())
    }

    pub fn claim_amount(&self, position: &Position) -> Result<u64> {
        let winning_side = match self.state {
            PoolState::SettledYes => PoolSide::Yes,
            PoolState::SettledNo => PoolSide::No,
            _ => return err!(ProofPlayError::InvalidPayoutState),
        };
        require!(
            position.side == winning_side,
            ProofPlayError::NotWinningPosition
        );
        require!(!position.claimed, ProofPlayError::AlreadyClaimed);
        require!(!position.refunded, ProofPlayError::AlreadyRefunded);
        require!(
            position.amount > 0
                && self.remaining_winning_stake >= position.amount
                && self.remaining_pool_amount >= self.remaining_winning_stake,
            ProofPlayError::InvalidPayoutState
        );

        if position.amount == self.remaining_winning_stake {
            return Ok(self.remaining_pool_amount);
        }

        let payout = (u128::from(self.remaining_pool_amount)
            .checked_mul(u128::from(position.amount))
            .ok_or(ProofPlayError::MathOverflow)?
            / u128::from(self.remaining_winning_stake))
        .try_into()
        .map_err(|_| ProofPlayError::MathOverflow)?;
        require!(payout > 0, ProofPlayError::InvalidPayoutState);
        Ok(payout)
    }

    pub fn record_claim(&mut self, position: &mut Position, payout: u64) -> Result<()> {
        let next_remaining_pool_amount = self
            .remaining_pool_amount
            .checked_sub(payout)
            .ok_or(ProofPlayError::InvalidPayoutState)?;
        let next_remaining_winning_stake = self
            .remaining_winning_stake
            .checked_sub(position.amount)
            .ok_or(ProofPlayError::InvalidPayoutState)?;
        self.remaining_pool_amount = next_remaining_pool_amount;
        self.remaining_winning_stake = next_remaining_winning_stake;
        position.claimed = true;

        if self.remaining_winning_stake == 0 {
            require!(
                self.remaining_pool_amount == 0,
                ProofPlayError::InvalidPayoutState
            );
            self.state = PoolState::Closed;
        }
        Ok(())
    }

    pub fn refund_amount(&self, position: &Position) -> Result<u64> {
        require!(
            self.state == PoolState::Cancelled,
            ProofPlayError::RefundNotAvailable
        );
        require!(!position.claimed, ProofPlayError::AlreadyClaimed);
        require!(!position.refunded, ProofPlayError::AlreadyRefunded);
        require!(
            position.amount > 0 && self.remaining_pool_amount >= position.amount,
            ProofPlayError::InvalidPayoutState
        );
        Ok(position.amount)
    }

    pub fn record_refund(&mut self, position: &mut Position, amount: u64) -> Result<()> {
        self.remaining_pool_amount = self
            .remaining_pool_amount
            .checked_sub(amount)
            .ok_or(ProofPlayError::InvalidPayoutState)?;
        position.refunded = true;
        if self.remaining_pool_amount == 0 {
            self.state = PoolState::Closed;
        }
        Ok(())
    }
}

#[account]
#[derive(Debug, InitSpace)]
pub struct SettlementRecord {
    pub pool: Pubkey,
    pub settlement_config: Pubkey,
    pub condition_commitment: [u8; 32],
    pub compiler_version: u16,
    pub txline_program: Pubkey,
    pub daily_scores_root: Pubkey,
    pub proof_timestamp_ms: i64,
    pub observed_sequence: u64,
    pub event_stat_root: [u8; 32],
    pub stat_keys: [u32; MAX_SETTLEMENT_STATS],
    pub stat_values: [i32; MAX_SETTLEMENT_STATS],
    pub stat_periods: [i32; MAX_SETTLEMENT_STATS],
    pub stat_count: u8,
    pub predicate_result: bool,
    pub winning_side: PoolSide,
    pub settled_at: i64,
    pub bump: u8,
}

pub struct SettlementRecordInput<'a> {
    pub pool: Pubkey,
    pub settlement_config: Pubkey,
    pub config: &'a SettlementConfig,
    pub daily_scores_root: Pubkey,
    pub payload: &'a StatValidationInputV3,
    pub observed_sequence: u64,
    pub predicate_result: bool,
    pub settled_at: i64,
    pub bump: u8,
}

impl SettlementRecord {
    pub fn initialize(&mut self, input: SettlementRecordInput<'_>) -> Result<()> {
        require!(input.observed_sequence > 0, ProofPlayError::InvalidSequence);
        let stat_count: u8 = input
            .payload
            .leaves
            .len()
            .try_into()
            .map_err(|_| ProofPlayError::SettlementStatMismatch)?;
        let mut stat_keys = [0_u32; MAX_SETTLEMENT_STATS];
        let mut stat_values = [0_i32; MAX_SETTLEMENT_STATS];
        let mut stat_periods = [0_i32; MAX_SETTLEMENT_STATS];
        for (index, leaf) in input.payload.leaves.iter().enumerate() {
            stat_keys[index] = leaf.stat.key;
            stat_values[index] = leaf.stat.value;
            stat_periods[index] = leaf.stat.period;
        }

        self.pool = input.pool;
        self.settlement_config = input.settlement_config;
        self.condition_commitment = input.config.condition_commitment;
        self.compiler_version = input.config.compiler_version;
        self.txline_program = TXLINE_PROGRAM_ID;
        self.daily_scores_root = input.daily_scores_root;
        self.proof_timestamp_ms = input.payload.ts;
        self.observed_sequence = input.observed_sequence;
        self.event_stat_root = input.payload.event_stat_root;
        self.stat_keys = stat_keys;
        self.stat_values = stat_values;
        self.stat_periods = stat_periods;
        self.stat_count = stat_count;
        self.predicate_result = input.predicate_result;
        self.winning_side = if input.predicate_result {
            PoolSide::Yes
        } else {
            PoolSide::No
        };
        self.settled_at = input.settled_at;
        self.bump = input.bump;
        Ok(())
    }
}

#[account]
#[derive(Debug, InitSpace)]
pub struct Position {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub side: PoolSide,
    pub amount: u64,
    pub claimed: bool,
    pub refunded: bool,
    pub bump: u8,
}

impl Position {
    pub fn add_stake(
        &mut self,
        pool: Pubkey,
        owner: Pubkey,
        side: PoolSide,
        amount: u64,
        bump: u8,
    ) -> Result<()> {
        if self.owner == Pubkey::default() {
            self.pool = pool;
            self.owner = owner;
            self.side = side;
            self.amount = 0;
            self.claimed = false;
            self.refunded = false;
            self.bump = bump;
        } else {
            require!(
                self.pool == pool && self.owner == owner && self.side == side,
                ProofPlayError::PositionMismatch
            );
            require!(!self.claimed, ProofPlayError::AlreadyClaimed);
            require!(!self.refunded, ProofPlayError::AlreadyRefunded);
        }
        let next_amount = self
            .amount
            .checked_add(amount)
            .ok_or(ProofPlayError::MathOverflow)?;
        self.amount = next_amount;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::txline::{
        BinaryExpression, Comparison, ProofNode, ScoreStat, ScoresBatchSummary, ScoresUpdateStats,
        StatLeaf, StatPredicate, TraderPredicate,
    };
    use anchor_lang::error::{Error, ERROR_CODE_OFFSET};

    const NOW: i64 = 1_700_000_000;

    fn blank_pool() -> Pool {
        Pool {
            creator: Pubkey::default(),
            fixture_id: 0,
            pool_id: 0,
            token_mint: Pubkey::default(),
            condition_commitment: [0; 32],
            compiler_version: 0,
            cutoff_unix_seconds: 0,
            refund_after_unix_seconds: 0,
            created_at: 0,
            state: PoolState::Open,
            winning_side: None,
            yes_amount: 0,
            no_amount: 0,
            remaining_pool_amount: 0,
            remaining_winning_stake: 0,
            settled_sequence: 0,
            demo_mode: false,
            bump: 0,
        }
    }

    fn params(demo_mode: bool) -> CreatePoolParams {
        CreatePoolParams {
            pool_id: 7,
            fixture_id: 18_241_006,
            condition_commitment: [9; 32],
            compiler_version: 1,
            cutoff_unix_seconds: NOW + 60,
            refund_after_unix_seconds: NOW + 60 + MIN_SETTLEMENT_GRACE_SECONDS,
            demo_mode,
        }
    }

    fn initialized_pool(demo_mode: bool) -> Pool {
        let mut pool = blank_pool();
        pool.initialize(
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            &params(demo_mode),
            NOW,
            254,
        )
        .unwrap();
        pool
    }

    fn settlement_strategy() -> NDimensionalStrategy {
        NDimensionalStrategy {
            geometric_targets: vec![],
            distance_predicate: None,
            discrete_predicates: vec![
                StatPredicate::Binary {
                    index_a: 1,
                    index_b: 0,
                    op: BinaryExpression::Subtract,
                    predicate: TraderPredicate {
                        threshold: 0,
                        comparison: Comparison::GreaterThan,
                    },
                },
                StatPredicate::Binary {
                    index_a: 2,
                    index_b: 3,
                    op: BinaryExpression::Add,
                    predicate: TraderPredicate {
                        threshold: 8,
                        comparison: Comparison::LessThan,
                    },
                },
            ],
        }
    }

    fn settlement_params() -> SettlementConfigParams {
        SettlementConfigParams {
            stat_keys: vec![1, 2, 7, 8],
            strategy: settlement_strategy(),
        }
    }

    fn blank_settlement_config() -> SettlementConfig {
        SettlementConfig {
            pool: Pubkey::default(),
            condition_commitment: [0; 32],
            compiler_version: 0,
            stat_keys: vec![],
            strategy: NDimensionalStrategy {
                geometric_targets: vec![],
                distance_predicate: None,
                discrete_predicates: vec![],
            },
            bump: 0,
        }
    }

    fn settlement_payload(fixture_id: i64) -> StatValidationInputV3 {
        const PROOF_TIMESTAMP: i64 = 1_784_150_064_772;
        StatValidationInputV3 {
            ts: PROOF_TIMESTAMP,
            fixture_summary: ScoresBatchSummary {
                fixture_id,
                update_stats: ScoresUpdateStats {
                    update_count: 1,
                    min_timestamp: PROOF_TIMESTAMP,
                    max_timestamp: PROOF_TIMESTAMP,
                },
                events_sub_tree_root: [2; 32],
            },
            fixture_proof: vec![ProofNode {
                hash: [3; 32],
                is_right_sibling: true,
            }],
            main_tree_proof: vec![ProofNode {
                hash: [4; 32],
                is_right_sibling: false,
            }],
            event_stat_root: [5; 32],
            leaves: [(1, 1), (2, 2), (7, 1), (8, 6)]
                .into_iter()
                .map(|(key, value)| StatLeaf {
                    stat: ScoreStat {
                        key,
                        value,
                        period: FINAL_MATCH_PERIOD,
                    },
                    stat_proof: vec![],
                })
                .collect(),
            multiproof_hashes: vec![],
            leaf_indices: vec![32, 33, 36, 37],
        }
    }

    fn position(pool: Pubkey, owner: Pubkey, side: PoolSide, amount: u64) -> Position {
        Position {
            pool,
            owner,
            side,
            amount,
            claimed: false,
            refunded: false,
            bump: 253,
        }
    }

    fn assert_error<T>(result: Result<T>, expected: ProofPlayError) {
        let result = match result {
            Ok(_) => panic!("expected an error"),
            Err(error) => error,
        };
        let Error::AnchorError(error) = result else {
            panic!("expected Anchor error")
        };
        assert_eq!(error.error_code_number, ERROR_CODE_OFFSET + expected as u32);
    }

    #[test]
    fn immutable_settlement_config_binds_the_pool_strategy_and_final_payload() {
        let pool_key = Pubkey::new_unique();
        let pool = initialized_pool(false);
        let params = settlement_params();
        let mut config = blank_settlement_config();
        config
            .initialize(
                pool_key,
                pool.condition_commitment,
                pool.compiler_version,
                &params,
                252,
            )
            .unwrap();
        let payload = settlement_payload(pool.fixture_id);
        config
            .validate_payload(pool_key, &pool, &payload, &params.strategy)
            .unwrap();

        let mut altered_strategy = params.strategy.clone();
        let StatPredicate::Binary { predicate, .. } = &mut altered_strategy.discrete_predicates[1]
        else {
            panic!("expected binary predicate")
        };
        predicate.threshold = 9;
        assert_error(
            config.validate_payload(pool_key, &pool, &payload, &altered_strategy),
            ProofPlayError::SettlementStrategyMismatch,
        );

        let mut altered_fixture = payload.clone();
        altered_fixture.fixture_summary.fixture_id += 1;
        assert_error(
            config.validate_payload(pool_key, &pool, &altered_fixture, &params.strategy),
            ProofPlayError::SettlementFixtureMismatch,
        );

        let mut non_final = payload.clone();
        non_final.leaves[0].stat.period = 0;
        assert_error(
            config.validate_payload(pool_key, &pool, &non_final, &params.strategy),
            ProofPlayError::NonFinalSettlementProof,
        );
    }

    #[test]
    fn settlement_config_rejects_missing_duplicate_and_out_of_range_coverage() {
        let pool_key = Pubkey::new_unique();
        let pool = initialized_pool(false);

        let mut duplicate_keys = settlement_params();
        duplicate_keys.stat_keys = vec![1, 2, 2, 8];
        assert_error(
            blank_settlement_config().initialize(
                pool_key,
                pool.condition_commitment,
                pool.compiler_version,
                &duplicate_keys,
                1,
            ),
            ProofPlayError::InvalidSettlementConfig,
        );

        let mut missing_coverage = settlement_params();
        missing_coverage.strategy.discrete_predicates.pop();
        assert_error(
            blank_settlement_config().initialize(
                pool_key,
                pool.condition_commitment,
                pool.compiler_version,
                &missing_coverage,
                1,
            ),
            ProofPlayError::InvalidSettlementCoverage,
        );

        let mut out_of_range = settlement_params();
        let StatPredicate::Binary { index_b, .. } =
            &mut out_of_range.strategy.discrete_predicates[1]
        else {
            panic!("expected binary predicate")
        };
        *index_b = 4;
        assert_error(
            blank_settlement_config().initialize(
                pool_key,
                pool.condition_commitment,
                pool.compiler_version,
                &out_of_range,
                1,
            ),
            ProofPlayError::SettlementIndexOutOfBounds,
        );
    }

    #[test]
    fn initializes_the_complete_immutable_pool_contract() {
        let creator = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let params = params(true);
        let mut pool = blank_pool();
        pool.initialize(creator, mint, &params, NOW, 42).unwrap();

        assert_eq!(pool.creator, creator);
        assert_eq!(pool.token_mint, mint);
        assert_eq!(pool.fixture_id, params.fixture_id);
        assert_eq!(pool.pool_id, params.pool_id);
        assert_eq!(pool.condition_commitment, params.condition_commitment);
        assert_eq!(pool.compiler_version, 1);
        assert_eq!(pool.created_at, NOW);
        assert_eq!(pool.state, PoolState::Open);
        assert_eq!(pool.remaining_pool_amount, 0);
        assert!(pool.demo_mode);
        assert_eq!(pool.bump, 42);
    }

    #[test]
    fn rejects_invalid_creation_boundaries() {
        let creator = Pubkey::new_unique();
        let mint = Pubkey::new_unique();

        let mut invalid = params(false);
        invalid.fixture_id = 0;
        assert_error(
            blank_pool().initialize(creator, mint, &invalid, NOW, 1),
            ProofPlayError::InvalidFixtureId,
        );
        invalid = params(false);
        invalid.compiler_version = 0;
        assert_error(
            blank_pool().initialize(creator, mint, &invalid, NOW, 1),
            ProofPlayError::InvalidCompilerVersion,
        );
        invalid = params(false);
        invalid.condition_commitment = [0; 32];
        assert_error(
            blank_pool().initialize(creator, mint, &invalid, NOW, 1),
            ProofPlayError::InvalidConditionCommitment,
        );
        invalid = params(false);
        invalid.cutoff_unix_seconds = NOW;
        assert_error(
            blank_pool().initialize(creator, mint, &invalid, NOW, 1),
            ProofPlayError::InvalidCutoff,
        );
        invalid = params(false);
        invalid.refund_after_unix_seconds =
            invalid.cutoff_unix_seconds + MIN_SETTLEMENT_GRACE_SECONDS - 1;
        assert_error(
            blank_pool().initialize(creator, mint, &invalid, NOW, 1),
            ProofPlayError::InvalidRefundTime,
        );
    }

    #[test]
    fn aggregates_stakes_and_rejects_zero_late_or_overflowing_deposits() {
        let mut pool = initialized_pool(false);
        pool.add_stake(PoolSide::Yes, 100, NOW).unwrap();
        pool.add_stake(PoolSide::Yes, 25, NOW + 1).unwrap();
        pool.add_stake(PoolSide::No, 80, NOW + 2).unwrap();
        assert_eq!(pool.yes_amount, 125);
        assert_eq!(pool.no_amount, 80);
        assert_eq!(pool.remaining_pool_amount, 205);

        assert_error(
            pool.add_stake(PoolSide::Yes, 0, NOW),
            ProofPlayError::InvalidAmount,
        );
        assert_error(
            pool.add_stake(PoolSide::Yes, 1, pool.cutoff_unix_seconds),
            ProofPlayError::CutoffPassed,
        );

        let mut overflow = initialized_pool(false);
        overflow.yes_amount = u64::MAX;
        overflow.remaining_pool_amount = u64::MAX;
        assert_error(
            overflow.add_stake(PoolSide::Yes, 1, NOW),
            ProofPlayError::MathOverflow,
        );
        assert_eq!(overflow.yes_amount, u64::MAX);
        assert_eq!(overflow.remaining_pool_amount, u64::MAX);
    }

    #[test]
    fn position_aggregates_only_for_the_same_pool_owner_and_side() {
        let pool = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut position = Position {
            pool: Pubkey::default(),
            owner: Pubkey::default(),
            side: PoolSide::Yes,
            amount: 0,
            claimed: false,
            refunded: false,
            bump: 0,
        };
        position
            .add_stake(pool, owner, PoolSide::Yes, 20, 9)
            .unwrap();
        position
            .add_stake(pool, owner, PoolSide::Yes, 30, 9)
            .unwrap();
        assert_eq!(position.amount, 50);
        assert_eq!(position.bump, 9);

        assert_error(
            position.add_stake(pool, owner, PoolSide::No, 1, 9),
            ProofPlayError::PositionMismatch,
        );
        assert_error(
            position.add_stake(pool, Pubkey::new_unique(), PoolSide::Yes, 1, 9),
            ProofPlayError::PositionMismatch,
        );
    }

    #[test]
    fn locking_is_permissionless_only_after_cutoff_and_happens_once() {
        let mut pool = initialized_pool(false);
        assert_error(
            pool.lock(pool.cutoff_unix_seconds - 1),
            ProofPlayError::CutoffNotReached,
        );
        pool.lock(pool.cutoff_unix_seconds).unwrap();
        assert_eq!(pool.state, PoolState::Locked);
        assert_error(
            pool.lock(pool.cutoff_unix_seconds + 1),
            ProofPlayError::PoolNotOpen,
        );
    }

    #[test]
    fn production_pool_rejects_the_demo_outcome_hook() {
        let mut pool = initialized_pool(false);
        pool.lock(pool.cutoff_unix_seconds).unwrap();
        assert_error(
            pool.record_demo_outcome(PoolSide::Yes, 962),
            ProofPlayError::UnverifiedSettlementDisabled,
        );
        assert_eq!(pool.state, PoolState::Locked);
    }

    #[test]
    fn demo_outcome_records_winner_once_and_zero_winner_stake_refunds() {
        let mut pool = initialized_pool(true);
        pool.add_stake(PoolSide::Yes, 100, NOW).unwrap();
        pool.lock(pool.cutoff_unix_seconds).unwrap();
        pool.record_demo_outcome(PoolSide::Yes, 962).unwrap();
        assert_eq!(pool.state, PoolState::SettledYes);
        assert_eq!(pool.winning_side, Some(PoolSide::Yes));
        assert_eq!(pool.remaining_winning_stake, 100);
        assert_eq!(pool.settled_sequence, 962);
        assert_error(
            pool.record_demo_outcome(PoolSide::No, 963),
            ProofPlayError::PoolNotLocked,
        );

        let mut no_winner = initialized_pool(true);
        no_winner.add_stake(PoolSide::Yes, 50, NOW).unwrap();
        no_winner.lock(no_winner.cutoff_unix_seconds).unwrap();
        no_winner.record_demo_outcome(PoolSide::No, 962).unwrap();
        assert_eq!(no_winner.state, PoolState::Cancelled);
        assert_eq!(no_winner.remaining_pool_amount, 50);
    }

    #[test]
    fn claim_rounding_conserves_every_base_unit_and_final_claim_gets_remainder() {
        let pool_key = Pubkey::new_unique();
        let first_owner = Pubkey::new_unique();
        let second_owner = Pubkey::new_unique();
        let mut pool = initialized_pool(true);
        pool.yes_amount = 3;
        pool.no_amount = 7;
        pool.remaining_pool_amount = 10;
        pool.lock(pool.cutoff_unix_seconds).unwrap();
        pool.record_demo_outcome(PoolSide::Yes, 962).unwrap();

        let mut first = position(pool_key, first_owner, PoolSide::Yes, 1);
        let mut second = position(pool_key, second_owner, PoolSide::Yes, 2);
        let first_payout = pool.claim_amount(&first).unwrap();
        assert_eq!(first_payout, 3);
        pool.record_claim(&mut first, first_payout).unwrap();
        assert_eq!(pool.remaining_pool_amount, 7);
        assert_eq!(pool.remaining_winning_stake, 2);

        let second_payout = pool.claim_amount(&second).unwrap();
        assert_eq!(second_payout, 7);
        pool.record_claim(&mut second, second_payout).unwrap();
        assert_eq!(first_payout + second_payout, 10);
        assert_eq!(pool.remaining_pool_amount, 0);
        assert_eq!(pool.remaining_winning_stake, 0);
        assert_eq!(pool.state, PoolState::Closed);
        assert!(first.claimed && second.claimed);
    }

    #[test]
    fn losing_duplicate_and_inconsistent_claims_fail_closed() {
        let pool_key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut pool = initialized_pool(true);
        pool.yes_amount = 5;
        pool.no_amount = 5;
        pool.remaining_pool_amount = 10;
        pool.lock(pool.cutoff_unix_seconds).unwrap();
        pool.record_demo_outcome(PoolSide::Yes, 962).unwrap();

        let loser = position(pool_key, owner, PoolSide::No, 5);
        assert_error(
            pool.claim_amount(&loser),
            ProofPlayError::NotWinningPosition,
        );
        let mut winner = position(pool_key, owner, PoolSide::Yes, 5);
        winner.claimed = true;
        assert_error(pool.claim_amount(&winner), ProofPlayError::AlreadyClaimed);
        winner.claimed = false;
        pool.remaining_pool_amount = 4;
        assert_error(
            pool.claim_amount(&winner),
            ProofPlayError::InvalidPayoutState,
        );
    }

    #[test]
    fn cancellation_requires_creator_or_expiry_and_refunds_once() {
        let pool_key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut pool = initialized_pool(false);
        let creator = pool.creator;
        pool.add_stake(PoolSide::No, 75, NOW).unwrap();
        assert_error(
            pool.cancel(Pubkey::new_unique(), NOW),
            ProofPlayError::UnauthorizedCancellation,
        );
        pool.cancel(creator, NOW).unwrap();
        assert_eq!(pool.state, PoolState::Cancelled);

        let mut position = position(pool_key, owner, PoolSide::No, 75);
        let amount = pool.refund_amount(&position).unwrap();
        assert_eq!(amount, 75);
        pool.record_refund(&mut position, amount).unwrap();
        assert!(position.refunded);
        assert_eq!(pool.state, PoolState::Closed);
        assert_eq!(pool.remaining_pool_amount, 0);
        assert_error(
            pool.refund_amount(&position),
            ProofPlayError::RefundNotAvailable,
        );

        let mut expired = initialized_pool(false);
        expired.add_stake(PoolSide::Yes, 1, NOW).unwrap();
        expired
            .cancel(Pubkey::new_unique(), expired.refund_after_unix_seconds)
            .unwrap();
        assert_eq!(expired.state, PoolState::Cancelled);
    }

    #[test]
    fn empty_cancelled_or_resolved_pool_closes_without_a_dust_path() {
        let mut empty = initialized_pool(false);
        empty.cancel(empty.creator, NOW).unwrap();
        assert_eq!(empty.state, PoolState::Closed);

        let mut resolved = initialized_pool(true);
        resolved.add_stake(PoolSide::Yes, 1, NOW).unwrap();
        resolved.lock(resolved.cutoff_unix_seconds).unwrap();
        resolved.record_demo_outcome(PoolSide::Yes, 1).unwrap();
        assert_error(
            resolved.cancel(resolved.creator, resolved.refund_after_unix_seconds),
            ProofPlayError::PoolAlreadyResolved,
        );
    }
}
