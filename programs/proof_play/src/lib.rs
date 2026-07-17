use anchor_lang::prelude::*;

declare_id!("AJwjCjk9sb9SWMiuLWDCDgnL6zFEENgnULfkCYaU5Ar");

#[program]
pub mod proof_play {
    use super::*;

    pub fn initialize(_context: Context<Initialize>) -> Result<()> {
        msg!("ProofPlay program scaffold initialized");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
