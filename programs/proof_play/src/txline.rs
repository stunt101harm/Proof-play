use anchor_lang::{
    prelude::*,
    solana_program::{
        instruction::{AccountMeta, Instruction},
        program::{get_return_data, invoke},
    },
};

use crate::errors::ProofPlayError;

pub const TXLINE_PROGRAM_ID: Pubkey = pubkey!("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
pub const VALIDATE_STAT_V3_DISCRIMINATOR: [u8; 8] = [150, 37, 155, 89, 141, 190, 77, 203];
pub const FINAL_MATCH_PERIOD: i32 = 100;
pub const MAX_SETTLEMENT_STATS: usize = 4;
pub const MILLISECONDS_PER_DAY: i64 = 86_400_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
pub enum Comparison {
    GreaterThan,
    LessThan,
    EqualTo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
pub enum BinaryExpression {
    Add,
    Subtract,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
pub struct TraderPredicate {
    pub threshold: i32,
    pub comparison: Comparison,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, InitSpace, PartialEq)]
pub struct GeometricTarget {
    pub stat_index: u8,
    pub prediction: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, InitSpace, PartialEq)]
pub enum StatPredicate {
    Single {
        index: u8,
        predicate: TraderPredicate,
    },
    Binary {
        index_a: u8,
        index_b: u8,
        op: BinaryExpression,
        predicate: TraderPredicate,
    },
}

impl StatPredicate {
    pub fn indexes(&self) -> ([usize; 2], usize) {
        match self {
            Self::Single { index, .. } => ([usize::from(*index), 0], 1),
            Self::Binary {
                index_a, index_b, ..
            } => ([usize::from(*index_a), usize::from(*index_b)], 2),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, InitSpace, PartialEq)]
pub struct NDimensionalStrategy {
    #[max_len(0)]
    pub geometric_targets: Vec<GeometricTarget>,
    pub distance_predicate: Option<TraderPredicate>,
    #[max_len(4)]
    pub discrete_predicates: Vec<StatPredicate>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct StatLeaf {
    pub stat: ScoreStat,
    pub stat_proof: Vec<ProofNode>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Eq, PartialEq)]
pub struct StatValidationInputV3 {
    pub ts: i64,
    pub fixture_summary: ScoresBatchSummary,
    pub fixture_proof: Vec<ProofNode>,
    pub main_tree_proof: Vec<ProofNode>,
    pub event_stat_root: [u8; 32],
    pub leaves: Vec<StatLeaf>,
    pub multiproof_hashes: Vec<ProofNode>,
    pub leaf_indices: Vec<u32>,
}

pub fn daily_scores_root_address(timestamp_ms: i64) -> Result<Pubkey> {
    require!(timestamp_ms >= 0, ProofPlayError::InvalidProofTimestamp);
    let epoch_day: u16 = (timestamp_ms / MILLISECONDS_PER_DAY)
        .try_into()
        .map_err(|_| ProofPlayError::InvalidProofTimestamp)?;
    Ok(Pubkey::find_program_address(
        &[b"daily_scores_roots", &epoch_day.to_le_bytes()],
        &TXLINE_PROGRAM_ID,
    )
    .0)
}

pub fn validate_stat_v3<'info>(
    txline_program: &AccountInfo<'info>,
    daily_scores_root: &AccountInfo<'info>,
    payload: &StatValidationInputV3,
    strategy: &NDimensionalStrategy,
) -> Result<bool> {
    let mut data = Vec::new();
    data.extend_from_slice(&VALIDATE_STAT_V3_DISCRIMINATOR);
    payload
        .serialize(&mut data)
        .map_err(|_| ProofPlayError::TxlinePayloadSerializationFailed)?;
    strategy
        .serialize(&mut data)
        .map_err(|_| ProofPlayError::TxlinePayloadSerializationFailed)?;

    invoke(
        &Instruction {
            program_id: TXLINE_PROGRAM_ID,
            accounts: vec![AccountMeta::new_readonly(daily_scores_root.key(), false)],
            data,
        },
        &[daily_scores_root.clone(), txline_program.clone()],
    )?;

    let (returning_program, return_data) =
        get_return_data().ok_or(ProofPlayError::MissingTxlineReturnData)?;
    require_keys_eq!(
        returning_program,
        TXLINE_PROGRAM_ID,
        ProofPlayError::InvalidTxlineReturnData
    );
    require!(
        return_data.as_slice() == [0] || return_data.as_slice() == [1],
        ProofPlayError::InvalidTxlineReturnData
    );
    Ok(return_data[0] == 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_the_documented_daily_scores_root() {
        assert_eq!(
            daily_scores_root_address(1_784_150_064_772).unwrap(),
            pubkey!("HJ6nSVkUs4VG9JQ5sEUq3VbmyUSBf76ePXUCATLtRYTX")
        );
    }

    #[test]
    fn rejects_timestamps_outside_the_u16_epoch_day_range() {
        assert!(daily_scores_root_address(-1).is_err());
        assert!(daily_scores_root_address(i64::MAX).is_err());
    }
}
