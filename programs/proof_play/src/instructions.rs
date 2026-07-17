use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::{
    errors::ProofPlayError,
    events::{
        DemoOutcomeRecorded, PayoutClaimed, PoolCancelled, PoolClosed, PoolCreated, PoolJoined,
        PoolLocked, PositionRefunded,
    },
    state::{CreatePoolParams, Pool, PoolSide, PoolState, Position},
};

pub fn create_pool(context: Context<CreatePool>, params: CreatePoolParams) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    context.accounts.pool.initialize(
        context.accounts.creator.key(),
        context.accounts.token_mint.key(),
        &params,
        now,
        context.bumps.pool,
    )?;

    emit!(PoolCreated {
        pool: context.accounts.pool.key(),
        creator: context.accounts.creator.key(),
        fixture_id: params.fixture_id,
        pool_id: params.pool_id,
        token_mint: context.accounts.token_mint.key(),
        cutoff_unix_seconds: params.cutoff_unix_seconds,
        refund_after_unix_seconds: params.refund_after_unix_seconds,
        compiler_version: params.compiler_version,
        condition_commitment: params.condition_commitment,
        demo_mode: params.demo_mode,
    });
    Ok(())
}

pub fn join_pool(context: Context<JoinPool>, side: PoolSide, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(amount > 0, ProofPlayError::InvalidAmount);

    token::transfer_checked(
        CpiContext::new(
            context.accounts.token_program.to_account_info(),
            TransferChecked {
                from: context.accounts.participant_tokens.to_account_info(),
                mint: context.accounts.token_mint.to_account_info(),
                to: context.accounts.vault.to_account_info(),
                authority: context.accounts.participant.to_account_info(),
            },
        ),
        amount,
        context.accounts.token_mint.decimals,
    )?;

    context.accounts.pool.add_stake(side, amount, now)?;
    context.accounts.position.add_stake(
        context.accounts.pool.key(),
        context.accounts.participant.key(),
        side,
        amount,
        context.bumps.position,
    )?;

    emit!(PoolJoined {
        pool: context.accounts.pool.key(),
        owner: context.accounts.participant.key(),
        side,
        amount,
        position_amount: context.accounts.position.amount,
        yes_amount: context.accounts.pool.yes_amount,
        no_amount: context.accounts.pool.no_amount,
    });
    Ok(())
}

pub fn lock_pool(context: Context<LockPool>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    context.accounts.pool.lock(now)?;
    emit!(PoolLocked {
        pool: context.accounts.pool.key(),
        locked_at: now,
    });
    Ok(())
}

pub fn record_demo_outcome(
    context: Context<RecordDemoOutcome>,
    winning_side: PoolSide,
    sequence: u64,
) -> Result<()> {
    require!(
        context.accounts.vault.amount >= context.accounts.pool.remaining_pool_amount,
        ProofPlayError::VaultBalanceMismatch
    );
    context
        .accounts
        .pool
        .record_demo_outcome(winning_side, sequence)?;

    emit!(DemoOutcomeRecorded {
        pool: context.accounts.pool.key(),
        winning_side,
        sequence,
        resulting_state: context.accounts.pool.state,
        remaining_pool_amount: context.accounts.pool.remaining_pool_amount,
        remaining_winning_stake: context.accounts.pool.remaining_winning_stake,
    });
    Ok(())
}

pub fn cancel_pool(context: Context<CancelPool>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        context.accounts.vault.amount >= context.accounts.pool.remaining_pool_amount,
        ProofPlayError::VaultBalanceMismatch
    );
    context
        .accounts
        .pool
        .cancel(context.accounts.authority.key(), now)?;

    emit!(PoolCancelled {
        pool: context.accounts.pool.key(),
        authority: context.accounts.authority.key(),
        cancelled_at: now,
        remaining_pool_amount: context.accounts.pool.remaining_pool_amount,
    });
    if context.accounts.pool.state == PoolState::Closed {
        emit!(PoolClosed {
            pool: context.accounts.pool.key(),
            final_state: PoolState::Cancelled,
            closed_at: now,
        });
    }
    Ok(())
}

pub fn claim(context: Context<Claim>) -> Result<()> {
    let payout = context
        .accounts
        .pool
        .claim_amount(&context.accounts.position)?;
    require!(
        context.accounts.vault.amount >= payout
            && context.accounts.vault.amount >= context.accounts.pool.remaining_pool_amount,
        ProofPlayError::VaultBalanceMismatch
    );

    let creator = context.accounts.pool.creator;
    let pool_id_bytes = context.accounts.pool.pool_id.to_le_bytes();
    let bump = [context.accounts.pool.bump];
    let signer_seeds: &[&[u8]] = &[
        b"pool",
        creator.as_ref(),
        pool_id_bytes.as_ref(),
        bump.as_ref(),
    ];
    token::transfer_checked(
        CpiContext::new_with_signer(
            context.accounts.token_program.to_account_info(),
            TransferChecked {
                from: context.accounts.vault.to_account_info(),
                mint: context.accounts.token_mint.to_account_info(),
                to: context.accounts.destination_tokens.to_account_info(),
                authority: context.accounts.pool.to_account_info(),
            },
            &[signer_seeds],
        ),
        payout,
        context.accounts.token_mint.decimals,
    )?;

    let settled_state = context.accounts.pool.state;
    let stake = context.accounts.position.amount;
    let side = context.accounts.position.side;
    context
        .accounts
        .pool
        .record_claim(&mut context.accounts.position, payout)?;
    emit!(PayoutClaimed {
        pool: context.accounts.pool.key(),
        owner: context.accounts.owner.key(),
        side,
        stake,
        payout,
        remaining_pool_amount: context.accounts.pool.remaining_pool_amount,
        remaining_winning_stake: context.accounts.pool.remaining_winning_stake,
    });
    if context.accounts.pool.state == PoolState::Closed {
        emit!(PoolClosed {
            pool: context.accounts.pool.key(),
            final_state: settled_state,
            closed_at: Clock::get()?.unix_timestamp,
        });
    }
    Ok(())
}

pub fn refund(context: Context<Refund>) -> Result<()> {
    let amount = context
        .accounts
        .pool
        .refund_amount(&context.accounts.position)?;
    require!(
        context.accounts.vault.amount >= amount
            && context.accounts.vault.amount >= context.accounts.pool.remaining_pool_amount,
        ProofPlayError::VaultBalanceMismatch
    );

    let creator = context.accounts.pool.creator;
    let pool_id_bytes = context.accounts.pool.pool_id.to_le_bytes();
    let bump = [context.accounts.pool.bump];
    let signer_seeds: &[&[u8]] = &[
        b"pool",
        creator.as_ref(),
        pool_id_bytes.as_ref(),
        bump.as_ref(),
    ];
    token::transfer_checked(
        CpiContext::new_with_signer(
            context.accounts.token_program.to_account_info(),
            TransferChecked {
                from: context.accounts.vault.to_account_info(),
                mint: context.accounts.token_mint.to_account_info(),
                to: context.accounts.destination_tokens.to_account_info(),
                authority: context.accounts.pool.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        context.accounts.token_mint.decimals,
    )?;

    let side = context.accounts.position.side;
    context
        .accounts
        .pool
        .record_refund(&mut context.accounts.position, amount)?;
    emit!(PositionRefunded {
        pool: context.accounts.pool.key(),
        owner: context.accounts.owner.key(),
        side,
        amount,
        remaining_pool_amount: context.accounts.pool.remaining_pool_amount,
    });
    if context.accounts.pool.state == PoolState::Closed {
        emit!(PoolClosed {
            pool: context.accounts.pool.key(),
            final_state: PoolState::Cancelled,
            closed_at: Clock::get()?.unix_timestamp,
        });
    }
    Ok(())
}

#[derive(Accounts)]
#[instruction(params: CreatePoolParams)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", creator.key().as_ref(), &params.pool_id.to_le_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        init,
        payer = creator,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(side: PoolSide)]
pub struct JoinPool<'info> {
    #[account(mut)]
    pub participant: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump,
        has_one = token_mint @ ProofPlayError::TokenMintMismatch
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = participant_tokens.mint == token_mint.key() @ ProofPlayError::TokenMintMismatch,
        constraint = participant_tokens.owner == participant.key() @ ProofPlayError::TokenOwnerMismatch
    )]
    pub participant_tokens: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = participant,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", pool.key().as_ref(), participant.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LockPool<'info> {
    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
}

#[derive(Accounts)]
pub struct RecordDemoOutcome<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump,
        has_one = creator
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct CancelPool<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump,
        has_one = token_mint @ ProofPlayError::TokenMintMismatch
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = pool,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = destination_tokens.mint == token_mint.key() @ ProofPlayError::TokenMintMismatch,
        constraint = destination_tokens.owner == owner.key() @ ProofPlayError::TokenOwnerMismatch
    )]
    pub destination_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"pool", pool.creator.as_ref(), &pool.pool_id.to_le_bytes()],
        bump = pool.bump,
        has_one = token_mint @ ProofPlayError::TokenMintMismatch
    )]
    pub pool: Account<'info, Pool>,
    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), owner.key().as_ref()],
        bump = position.bump,
        has_one = pool,
        has_one = owner
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = pool
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = destination_tokens.mint == token_mint.key() @ ProofPlayError::TokenMintMismatch,
        constraint = destination_tokens.owner == owner.key() @ ProofPlayError::TokenOwnerMismatch
    )]
    pub destination_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}
