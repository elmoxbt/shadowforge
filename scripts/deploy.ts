import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Shadowforge } from "../target/types/shadowforge";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";

const VAULT_CONFIG_SEED = Buffer.from("vault_config");
const SHIELDED_VAULT_SEED = Buffer.from("shielded_vault");

async function loadKeypair(filepath: string): Promise<Keypair> {
  const secretKey = JSON.parse(fs.readFileSync(filepath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function deploy() {
  console.log("\nDeploying ShadowForge to devnet...");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(process.env.HOME!, ".config/solana/id.json");
  const admin = await loadKeypair(walletPath);
  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  const balance = await connection.getBalance(admin.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 1e9) {
    throw new Error("Insufficient balance. Need at least 1 SOL for deployment.");
  }

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(admin),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);

  const IDL = require("../target/idl/shadowforge.json");
  const programId = new PublicKey(IDL.address);
  const program = new Program<Shadowforge>(IDL, provider);

  console.log(`Program ID: ${programId.toBase58()}`);

  const treasury = Keypair.generate();
  console.log(`Treasury: ${treasury.publicKey.toBase58()}`);

  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [VAULT_CONFIG_SEED],
    programId
  );
  console.log(`Vault Config PDA: ${vaultConfigPda.toBase58()}`);

  console.log("\nCreating Token-2022 mints with vault_config as authority...");
  const shieldedMint = await createMint(
    connection,
    admin,
    vaultConfigPda, 
    null,
    9,
    Keypair.generate(),
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`Shielded Mint: ${shieldedMint.toBase58()}`);

  const secondaryMint = await createMint(
    connection,
    admin,
    admin.publicKey,
    null,
    9,
    Keypair.generate(),
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID
  );
  console.log(`Secondary Mint: ${secondaryMint.toBase58()}`);

  const [shieldedVaultAta] = PublicKey.findProgramAddressSync(
    [SHIELDED_VAULT_SEED, shieldedMint.toBuffer()],
    programId
  );
  console.log(`Shielded Vault ATA: ${shieldedVaultAta.toBase58()}`);

  const existingVault = await connection.getAccountInfo(vaultConfigPda);
  if (existingVault) {
    console.log("\nVault already initialized. Fetching existing config...");
    const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);

    const deploymentInfo = {
      programId: programId.toBase58(),
      vaultConfig: vaultConfigPda.toBase58(),
      shieldedMint: vaultConfig.shieldedMint.toBase58(),
      secondaryMint: vaultConfig.secondaryMint.toBase58(),
      treasury: vaultConfig.treasury.toBase58(),
      admin: vaultConfig.admin.toBase58(),
    };

    console.log("\nExisting Vault Configuration:");
    console.log(`  Admin: ${vaultConfig.admin.toBase58()}`);
    console.log(`  Treasury: ${vaultConfig.treasury.toBase58()}`);
    console.log(`  Shielded Mint: ${vaultConfig.shieldedMint.toBase58()}`);
    console.log(`  Deposit Fee: ${vaultConfig.depositFeeBps} bps`);
    console.log(`  Withdrawal Fee: ${vaultConfig.withdrawalFeeBps} bps`);
    console.log(`  Current Yield: ${vaultConfig.currentYieldBps} bps`);

    return deploymentInfo;
  }

  console.log("\nInitializing vault...");
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

  console.log("Vault initialized!");

  const vaultConfig = await program.account.vaultConfig.fetch(vaultConfigPda);
  console.log("\nVault Configuration:");
  console.log(`  Admin: ${vaultConfig.admin.toBase58()}`);
  console.log(`  Treasury: ${vaultConfig.treasury.toBase58()}`);
  console.log(`  Shielded Mint: ${vaultConfig.shieldedMint.toBase58()}`);
  console.log(`  Deposit Fee: ${vaultConfig.depositFeeBps} bps`);
  console.log(`  Withdrawal Fee: ${vaultConfig.withdrawalFeeBps} bps`);
  console.log(`  Current Yield: ${vaultConfig.currentYieldBps} bps`);
  console.log(`  Arcium: ${vaultConfig.arciumEnabled}`);
  console.log(`  ShadowWire: ${vaultConfig.shadowwireEnabled}`);
  console.log(`  Privacy Cash: ${vaultConfig.privacyCashEnabled}`);
  console.log(`  SilentSwap: ${vaultConfig.silentswapEnabled}`);
  console.log(`  Starpay: ${vaultConfig.starpayEnabled}`);
  console.log(`  Anoncoin: ${vaultConfig.anoncoinEnabled}`);
  console.log(`  Range: ${vaultConfig.rangeEnabled}`);

  const deploymentInfo = {
    programId: programId.toBase58(),
    vaultConfig: vaultConfigPda.toBase58(),
    shieldedMint: shieldedMint.toBase58(),
    secondaryMint: secondaryMint.toBase58(),
    shieldedVaultAta: shieldedVaultAta.toBase58(),
    treasury: treasury.publicKey.toBase58(),
    admin: admin.publicKey.toBase58(),
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "deployment-devnet.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to ${outputPath}`);

  return deploymentInfo;
}

deploy()
  .then((info) => {
    console.log("\nDeployment complete!");
    console.log(JSON.stringify(info, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nDeployment failed:");
    console.error(err);
    if (err.logs) {
      console.error("\nTransaction logs:");
      err.logs.forEach((log: string) => console.error(log));
    }
    process.exit(1);
  });
