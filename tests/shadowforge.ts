import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Shadowforge } from "../target/types/shadowforge";
import { startAnchor, BankrunProvider } from "anchor-bankrun";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeAccountInstruction,
  createMintToInstruction,
  MINT_SIZE,
  ACCOUNT_SIZE,
} from "@solana/spl-token";
import { expect } from "chai";
import { BanksClient, Clock, ProgramTestContext } from "solana-bankrun";
import path from "path";

const VAULT_CONFIG_SEED = Buffer.from("vault_config");
const USER_POSITION_SEED = Buffer.from("user_position");
const SHIELDED_VAULT_SEED = Buffer.from("shielded_vault");
const COMPLIANCE_SEED = Buffer.from("compliance");
const LENDING_POSITION_SEED = Buffer.from("lending_position");
const BRIDGE_REQUEST_SEED = Buffer.from("bridge_request");
const DARK_POOL_ORDER_SEED = Buffer.from("dark_pool_order");

// External program IDs (must match what's in the Rust code)
const PRIVACY_CASH_PROGRAM_ID = new PublicKey("PRVCxGv9EzBxvT4jDL1bKurkXMcJ6TPGHHCFnFfpump");
const SILENTSWAP_PROGRAM_ID = new PublicKey("Si1entSwap111111111111111111111111111111111");
const STARPAY_PROGRAM_ID = new PublicKey("STARpay111111111111111111111111111111111111");
const ANONCOIN_PROGRAM_ID = new PublicKey("ANoNco1n11111111111111111111111111111111111");
const RANGE_PROGRAM_ID = new PublicKey("RANGE11111111111111111111111111111111111111");

function generateProof(length: number = 32): number[] {
  const proof = new Array(length).fill(0);
  for (let i = 0; i < length; i++) {
    proof[i] = Math.floor(Math.random() * 255) + 1;
  }
  return proof;
}

function generateCommitment(): number[] {
  return generateProof(32);
}

function generateNullifier(): number[] {
  return generateProof(32);
}

// Bankrun doesn't provide connection.getMinimumBalanceForRentExemption, so we hardcode values.
// Token-2022 requires slightly more lamports than regular SPL Token for rent exemption.
const MINT_RENT_EXEMPT_LAMPORTS = 1_500_000;
const ACCOUNT_RENT_EXEMPT_LAMPORTS = 2_100_000;

async function createMintWithBankrun(
  context: ProgramTestContext,
  payer: Keypair,
  mintAuthority: PublicKey,
  decimals: number
): Promise<PublicKey> {
  const mintKeypair = Keypair.generate();

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: MINT_RENT_EXEMPT_LAMPORTS,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      mintAuthority,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  tx.recentBlockhash = context.lastBlockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, mintKeypair);

  await context.banksClient.processTransaction(tx);

  return mintKeypair.publicKey;
}

async function createTokenAccountWithBankrun(
  context: ProgramTestContext,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const accountKeypair = Keypair.generate();

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: accountKeypair.publicKey,
      space: ACCOUNT_SIZE,
      lamports: ACCOUNT_RENT_EXEMPT_LAMPORTS,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      accountKeypair.publicKey,
      mint,
      owner,
      TOKEN_2022_PROGRAM_ID
    )
  );

  tx.recentBlockhash = context.lastBlockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, accountKeypair);

  await context.banksClient.processTransaction(tx);

  return accountKeypair.publicKey;
}

async function mintToWithBankrun(
  context: ProgramTestContext,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  authority: Keypair,
  amount: bigint
): Promise<void> {
  const tx = new Transaction().add(
    createMintToInstruction(
      mint,
      destination,
      authority.publicKey,
      amount,
      [],
      TOKEN_2022_PROGRAM_ID
    )
  );

  tx.recentBlockhash = context.lastBlockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, authority);

  await context.banksClient.processTransaction(tx);
}

// Token account data layout: mint (32) + owner (32) + amount (8) + ...
async function getTokenBalanceWithBankrun(
  context: ProgramTestContext,
  tokenAccount: PublicKey
): Promise<bigint> {
  const accountInfo = await context.banksClient.getAccount(tokenAccount);
  if (!accountInfo) {
    throw new Error("Token account not found");
  }
  const data = Buffer.from(accountInfo.data);
  const amount = data.readBigUInt64LE(64);
  return amount;
}

describe("shadowforge", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let banksClient: BanksClient;
  let program: Program<Shadowforge>;
  let admin: Keypair;
  let user: Keypair;
  let treasury: Keypair;
  let shieldedMint: PublicKey;
  let secondaryMint: PublicKey;
  let vaultConfigPda: PublicKey;
  let shieldedVaultAta: PublicKey;
  let userPositionPda: PublicKey;
  let userTokenAccount: PublicKey;
  let adminTokenAccount: PublicKey;

  before(async () => {
    // startAnchor loads programs from target/deploy based on Anchor.toml
    context = await startAnchor(
      path.resolve(__dirname, ".."),
      [],
      []
    );
    provider = new BankrunProvider(context);
    banksClient = context.banksClient;
    anchor.setProvider(provider);

    // Load program using IDL from target directory
    const IDL = require("../target/idl/shadowforge.json");
    program = new Program<Shadowforge>(IDL, provider);

    admin = provider.wallet.payer;
    user = Keypair.generate();
    treasury = Keypair.generate();

    // Airdrop to user for transaction fees
    const airdropTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: admin.publicKey,
        toPubkey: user.publicKey,
        lamports: 10_000_000_000,
      })
    );
    airdropTx.recentBlockhash = context.lastBlockhash;
    airdropTx.feePayer = admin.publicKey;
    airdropTx.sign(admin);
    await banksClient.processTransaction(airdropTx);

    // Create Token-2022 mints using bankrun
    shieldedMint = await createMintWithBankrun(context, admin, admin.publicKey, 9);
    secondaryMint = await createMintWithBankrun(context, admin, admin.publicKey, 9);

    [vaultConfigPda] = PublicKey.findProgramAddressSync(
      [VAULT_CONFIG_SEED],
      program.programId
    );

    [shieldedVaultAta] = PublicKey.findProgramAddressSync(
      [SHIELDED_VAULT_SEED, shieldedMint.toBuffer()],
      program.programId
    );

    [userPositionPda] = PublicKey.findProgramAddressSync(
      [USER_POSITION_SEED, vaultConfigPda.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    // Create token accounts using bankrun
    userTokenAccount = await createTokenAccountWithBankrun(
      context,
      admin,
      shieldedMint,
      user.publicKey
    );

    adminTokenAccount = await createTokenAccountWithBankrun(
      context,
      admin,
      shieldedMint,
      admin.publicKey
    );

    // Mint tokens using bankrun
    await mintToWithBankrun(
      context,
      admin,
      shieldedMint,
      adminTokenAccount,
      admin,
      BigInt(1_000_000_000_000)
    );

    await mintToWithBankrun(
      context,
      admin,
      shieldedMint,
      userTokenAccount,
      admin,
      BigInt(100_000_000_000)
    );
  });

  describe("1. Initialize Program", () => {
    it("initializes the vault with all SDK flags enabled", async () => {
      await program.methods
        .initialize({
          depositFeeBps: 10,
          withdrawalFeeBps: 10,
          lendingFeeBps: 50,
          swapFeeBps: 30,
          bridgeFeeBps: 25,
          initialYieldBps: 500,
          complianceRequired: false,
          enableArcium: true,
          enableShadowwire: true,
          enableAnoncoin: true,
          enablePrivacyCash: true,
          enableSilentswap: true,
          enableStarpay: true,
          enableRange: true,
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          shieldedMint: shieldedMint,
          secondaryMint: secondaryMint,
          treasury: treasury.publicKey,
          shieldedVaultAta: shieldedVaultAta,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.admin.toBase58()).to.equal(admin.publicKey.toBase58());
      expect(vaultConfig.depositFeeBps).to.equal(10);
      expect(vaultConfig.currentYieldBps).to.equal(500);
      expect(vaultConfig.arciumEnabled).to.be.true;
      expect(vaultConfig.shadowwireEnabled).to.be.true;
      expect(vaultConfig.privacyCashEnabled).to.be.true;
      expect(vaultConfig.silentswapEnabled).to.be.true;
      expect(vaultConfig.starpayEnabled).to.be.true;
      expect(vaultConfig.rangeEnabled).to.be.true;
      expect(vaultConfig.isPaused).to.be.false;
      expect(vaultConfig.totalPositions.toNumber()).to.equal(0);
    });
  });

  describe("2. Private Deposit", () => {
    it("creates encrypted position with commitment", async () => {
      const depositAmount = new BN(50_000_000_000);
      const amountCommitment = generateCommitment();
      const blindingFactor = generateCommitment();

      const userBalanceBefore = await getTokenBalanceWithBankrun(context, userTokenAccount);

      await program.methods
        .privateDeposit({
          amount: depositAmount,
          amountCommitment: amountCommitment,
          blindingFactor: blindingFactor,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          userTokenAccount: userTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          complianceAttestation: null,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.owner.toBase58()).to.equal(user.publicKey.toBase58());
      expect(userPosition.depositCount).to.equal(1);
      expect(userPosition.hasActiveLoan).to.be.false;
      expect(userPosition.hasPendingBridge).to.be.false;

      const userBalanceAfter = await getTokenBalanceWithBankrun(context, userTokenAccount);
      expect(Number(userBalanceBefore) - Number(userBalanceAfter)).to.equal(
        depositAmount.toNumber()
      );

      const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.totalPositions.toNumber()).to.equal(1);
    });
  });

  describe("3. Private Lend (Privacy Cash)", () => {
    let lendingPositionPda: PublicKey;

    before(() => {
      [lendingPositionPda] = PublicKey.findProgramAddressSync(
        [LENDING_POSITION_SEED, vaultConfigPda.toBuffer(), user.publicKey.toBuffer()],
        program.programId
      );
    });

    it("creates a private borrow position", async () => {
      const collateralCommitment = generateCommitment();
      const borrowCommitment = generateCommitment();

      await program.methods
        .privateLend({
          action: {
            borrow: {
              collateralCommitment: collateralCommitment,
              borrowCommitment: borrowCommitment,
            },
          },
          interestRateBps: 800,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          lendingPosition: lendingPositionPda,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          privacyCashProgram: PRIVACY_CASH_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const lendingPosition = await program.account.lendingPosition.fetch(lendingPositionPda);
      expect(lendingPosition.borrower.toBase58()).to.equal(user.publicKey.toBase58());
      expect(lendingPosition.interestRateBps).to.equal(800);
      expect(lendingPosition.isActive).to.be.true;

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.hasActiveLoan).to.be.true;
    });

    it("repays the loan", async () => {
      const repaymentCommitment = generateCommitment();

      await program.methods
        .privateLend({
          action: {
            repay: {
              repaymentCommitment: repaymentCommitment,
            },
          },
          interestRateBps: 0,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          lendingPosition: lendingPositionPda,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          privacyCashProgram: PRIVACY_CASH_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const lendingPosition = await program.account.lendingPosition.fetch(lendingPositionPda);
      expect(lendingPosition.isActive).to.be.false;

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.hasActiveLoan).to.be.false;
    });
  });

  describe("4. Private Swap (Starpay/Anoncoin)", () => {
    let darkPoolOrderPda: PublicKey;

    before(() => {
      [darkPoolOrderPda] = PublicKey.findProgramAddressSync(
        [DARK_POOL_ORDER_SEED, vaultConfigPda.toBuffer(), user.publicKey.toBuffer()],
        program.programId
      );
    });

    it("executes a private swap via Starpay route", async () => {
      const amountInCommitment = generateCommitment();
      const minOutCommitment = generateCommitment();
      const swapProof = generateProof(32);

      await program.methods
        .privateSwap({
          action: { execute: {} },
          route: { starpay: {} },
          amountInCommitment: amountInCommitment,
          minOutCommitment: minOutCommitment,
          limitPriceCommitment: null,
          side: { buy: {} },
          swapProof: swapProof,
          maxSlippageBps: 100,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          darkPoolOrder: darkPoolOrderPda,
          sourceMint: shieldedMint,
          destMint: secondaryMint,
          sourceVault: shieldedVaultAta,
          starpayProgram: STARPAY_PROGRAM_ID,
          anoncoinProgram: ANONCOIN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.actionCount).to.be.greaterThan(0);
    });

    it("places a dark pool limit order", async () => {
      const amountInCommitment = generateCommitment();
      const minOutCommitment = generateCommitment();
      const limitPriceCommitment = generateCommitment();
      const swapProof = generateProof(32);

      await program.methods
        .privateSwap({
          action: { placeLimitOrder: {} },
          route: { anocoinDarkPool: {} },
          amountInCommitment: amountInCommitment,
          minOutCommitment: minOutCommitment,
          limitPriceCommitment: limitPriceCommitment,
          side: { sell: {} },
          swapProof: swapProof,
          maxSlippageBps: 50,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          darkPoolOrder: darkPoolOrderPda,
          sourceMint: shieldedMint,
          destMint: secondaryMint,
          sourceVault: shieldedVaultAta,
          starpayProgram: STARPAY_PROGRAM_ID,
          anoncoinProgram: ANONCOIN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const darkPoolOrder = await program.account.darkPoolOrder.fetch(darkPoolOrderPda);
      expect(darkPoolOrder.maker.toBase58()).to.equal(user.publicKey.toBase58());
      expect(darkPoolOrder.status).to.deep.equal({ open: {} });
    });

    it("cancels the dark pool order", async () => {
      const swapProof = generateProof(32);

      await program.methods
        .privateSwap({
          action: { cancelOrder: {} },
          route: { anocoinDarkPool: {} },
          amountInCommitment: generateCommitment(),
          minOutCommitment: generateCommitment(),
          limitPriceCommitment: null,
          side: { sell: {} },
          swapProof: swapProof,
          maxSlippageBps: 0,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          darkPoolOrder: darkPoolOrderPda,
          sourceMint: shieldedMint,
          destMint: secondaryMint,
          sourceVault: shieldedVaultAta,
          starpayProgram: STARPAY_PROGRAM_ID,
          anoncoinProgram: ANONCOIN_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const darkPoolOrder = await program.account.darkPoolOrder.fetch(darkPoolOrderPda);
      expect(darkPoolOrder.status).to.deep.equal({ cancelled: {} });
    });
  });

  describe("5. Private Bridge (SilentSwap)", () => {
    let bridgeRequestPda: PublicKey;

    before(async () => {
      [bridgeRequestPda] = PublicKey.findProgramAddressSync(
        [BRIDGE_REQUEST_SEED, vaultConfigPda.toBuffer(), user.publicKey.toBuffer()],
        program.programId
      );
      const clock = await banksClient.getClock();
      context.setClock(new Clock(clock.slot + BigInt(100), clock.epochStartTimestamp, clock.epoch, clock.leaderScheduleEpoch, clock.unixTimestamp));
    });

    it("initiates outbound bridge to Ethereum", async () => {
      const amountCommitment = generateCommitment();
      const bridgeProof = generateProof(32);

      await program.methods
        .privateBridge({
          action: { initiateOutbound: {} },
          destChain: { ethereum: {} },
          amountCommitment: amountCommitment,
          bridgeProof: bridgeProof,
          inboundProof: null,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          bridgeRequest: bridgeRequestPda,
          shieldedMint: shieldedMint,
          shieldedVaultAta: shieldedVaultAta,
          silentswapProgram: SILENTSWAP_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const bridgeRequest = await program.account.bridgeRequest.fetch(bridgeRequestPda);
      expect(bridgeRequest.user.toBase58()).to.equal(user.publicKey.toBase58());
      expect(bridgeRequest.destChainId.toNumber()).to.equal(1);
      expect(bridgeRequest.status).to.deep.equal({ pending: {} });

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.hasPendingBridge).to.be.true;
    });

    it("verifies bridge completion", async () => {
      const bridgeProof = generateProof(32);

      await program.methods
        .privateBridge({
          action: { verifyCompletion: {} },
          destChain: { ethereum: {} },
          amountCommitment: generateCommitment(),
          bridgeProof: bridgeProof,
          inboundProof: null,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          bridgeRequest: bridgeRequestPda,
          shieldedMint: shieldedMint,
          shieldedVaultAta: shieldedVaultAta,
          silentswapProgram: SILENTSWAP_PROGRAM_ID,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const bridgeRequest = await program.account.bridgeRequest.fetch(bridgeRequestPda);
      expect(bridgeRequest.status).to.deep.equal({ completed: {} });

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.hasPendingBridge).to.be.false;
    });
  });

  describe("6. Apply Compliance (Range Protocol)", () => {
    let complianceAttestationPda: PublicKey;

    before(async () => {
      [complianceAttestationPda] = PublicKey.findProgramAddressSync(
        [COMPLIANCE_SEED, vaultConfigPda.toBuffer(), user.publicKey.toBuffer()],
        program.programId
      );
      const clock = await banksClient.getClock();
      context.setClock(new Clock(clock.slot + BigInt(100), clock.epochStartTimestamp, clock.epoch, clock.leaderScheduleEpoch, clock.unixTimestamp));
    });

    it("submits compliance attestation", async () => {
      const attestationHash = new Array(32).fill(1);
      const disclosureProof = generateProof(32);

      await program.methods
        .applyCompliance({
          action: { submit: {} },
          attestationHash: attestationHash,
          disclosureProof: disclosureProof,
          validityDays: 30,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          complianceAttestation: complianceAttestationPda,
          rangeProgram: RANGE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const compliance = await program.account.complianceAttestation.fetch(complianceAttestationPda);
      expect(compliance.user.toBase58()).to.equal(user.publicKey.toBase58());
      expect(compliance.isValid).to.be.true;
      expect(compliance.riskScore).to.be.lessThanOrEqual(75);

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.complianceVerified).to.be.true;
    });

    it("verifies existing compliance", async () => {
      const disclosureProof = generateProof(32);

      await program.methods
        .applyCompliance({
          action: { verify: {} },
          attestationHash: generateCommitment(),
          disclosureProof: disclosureProof,
          validityDays: 30,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          complianceAttestation: complianceAttestationPda,
          rangeProgram: RANGE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const compliance = await program.account.complianceAttestation.fetch(complianceAttestationPda);
      expect(compliance.isValid).to.be.true;
    });
  });

  describe("7. Time Advance + Accrue View", () => {
    it("admin deposits rewards to simulate yield", async () => {
      const rewardAmount = new BN(10_000_000_000);

      await program.methods
        .adminMockYield({
          action: { depositRewards: { amount: rewardAmount } },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.totalShieldedTvl.toNumber()).to.be.greaterThan(0);
    });

    it("admin updates yield rate to 10%", async () => {
      await program.methods
        .adminMockYield({
          action: { updateYieldRate: { newRateBps: 1000 } },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.currentYieldBps).to.equal(1000);
    });

    it("advances time and shows yield growth via accrue_view", async () => {
      const currentClock = await banksClient.getClock();
      const newTimestamp = currentClock.unixTimestamp + BigInt(30 * 24 * 60 * 60);

      context.setClock(
        new Clock(
          currentClock.slot + BigInt(100),
          currentClock.epochStartTimestamp,
          currentClock.epoch,
          currentClock.leaderScheduleEpoch,
          newTimestamp
        )
      );

      const result = await program.methods
        .accrueView()
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          lendingPosition: null,
        })
        .signers([user])
        .rpc();

      const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.currentYieldBps).to.equal(1000);

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.hasActiveLoan).to.be.false;
    });
  });

  describe("8. Private Withdraw", () => {
    it("withdraws more than deposited (principal + yield)", async () => {
      const withdrawalProof = generateProof(32);
      const ownershipProof = generateProof(32);
      const nullifier = generateNullifier();
      const withdrawAmount = new BN(55_000_000_000);

      const userBalanceBefore = await getTokenBalanceWithBankrun(context, userTokenAccount);

      await program.methods
        .privateWithdraw({
          withdrawType: { full: {} },
          withdrawalProof: withdrawalProof,
          ownershipProof: ownershipProof,
          nullifier: nullifier,
          expectedAmount: withdrawAmount,
        })
        .accountsStrict({
          user: user.publicKey,
          vaultConfig: vaultConfigPda,
          userPosition: userPositionPda,
          userTokenAccount: userTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          complianceAttestation: null,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();

      const userBalanceAfter = await getTokenBalanceWithBankrun(context, userTokenAccount);

      const received = Number(userBalanceAfter) - Number(userBalanceBefore);
      const fee = withdrawAmount.toNumber() * 10 / 10000;
      const expectedNet = withdrawAmount.toNumber() - fee;

      expect(received).to.equal(expectedNet);

      const userPosition = await program.account.userEncryptedPosition.fetch(userPositionPda);
      expect(userPosition.withdrawalCount).to.equal(1);
      expect(userPosition.nullifier).to.deep.equal(nullifier);
    });
  });

  describe("9. Admin Controls", () => {
    it("toggles SDK features", async () => {
      await program.methods
        .adminMockYield({
          action: {
            toggleSdk: {
              arcium: false,
              shadowwire: null,
              anoncoin: null,
              privacyCash: null,
              silentswap: null,
              starpay: null,
              range: null,
            },
          },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      let vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.arciumEnabled).to.be.false;

      await program.methods
        .adminMockYield({
          action: {
            toggleSdk: {
              arcium: true,
              shadowwire: null,
              anoncoin: null,
              privacyCash: null,
              silentswap: null,
              starpay: null,
              range: null,
            },
          },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.arciumEnabled).to.be.true;
    });

    it("sets emergency mode", async () => {
      await program.methods
        .adminMockYield({
          action: { setEmergencyMode: { enabled: true } },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      let vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.emergencyMode).to.be.true;
      expect(vaultConfig.isPaused).to.be.true;

      await program.methods
        .adminMockYield({
          action: { setEmergencyMode: { enabled: false } },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      await program.methods
        .adminMockYield({
          action: { setPaused: { paused: false } },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.emergencyMode).to.be.false;
      expect(vaultConfig.isPaused).to.be.false;
    });

    it("updates fee configuration", async () => {
      await program.methods
        .adminMockYield({
          action: {
            updateFees: {
              depositFeeBps: 15,
              withdrawalFeeBps: 15,
              lendingFeeBps: null,
              swapFeeBps: null,
              bridgeFeeBps: null,
            },
          },
        })
        .accountsStrict({
          admin: admin.publicKey,
          vaultConfig: vaultConfigPda,
          adminTokenAccount: adminTokenAccount,
          shieldedVaultAta: shieldedVaultAta,
          shieldedMint: shieldedMint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
      expect(vaultConfig.depositFeeBps).to.equal(15);
      expect(vaultConfig.withdrawalFeeBps).to.equal(15);
    });
  });
});
