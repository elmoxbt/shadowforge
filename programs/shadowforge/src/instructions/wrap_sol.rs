use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{Mint, TokenAccount, MintTo, mint_to};

use crate::state::*;

#[derive(Accounts)]
pub struct WrapSol<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_CONFIG_SEED],
        bump = vault_config.bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        mut,
        address = vault_config.shielded_mint,
    )]
    pub shielded_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = shielded_mint,
        token::authority = user,
        token::token_program = token_2022_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WrapSolParams {
    pub amount: u64,
}

pub fn handler(ctx: Context<WrapSol>, params: WrapSolParams) -> Result<()> {
    let user = &ctx.accounts.user;
    let vault_config = &ctx.accounts.vault_config;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: user.to_account_info(),
                to: vault_config.to_account_info(),
            },
        ),
        params.amount,
    )?;

    let seeds = &[VAULT_CONFIG_SEED, &[vault_config.bump]];
    let signer_seeds = &[&seeds[..]];

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.shielded_mint.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: vault_config.to_account_info(),
            },
            signer_seeds,
        ),
        params.amount,
    )?;

    msg!("Wrapped {} lamports to shielded tokens for {}", params.amount, user.key());

    Ok(())
}
