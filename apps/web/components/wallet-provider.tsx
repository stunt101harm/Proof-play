"use client";

import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { PublicEnv } from "@/lib/env";
import {
  PROOF_PLAY_DEVNET_GENESIS,
  explorerAddressUrl,
} from "@/lib/proof-play-program";

type WalletPublicKey = { toString(): string };

export type InjectedWalletProvider = {
  publicKey?: WalletPublicKey | null;
  isConnected?: boolean;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  network?: string;
  chain?: string;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{
    publicKey: WalletPublicKey;
  }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  on?(event: string, listener: (value?: WalletPublicKey) => void): void;
  removeListener?(
    event: string,
    listener: (value?: WalletPublicKey) => void,
  ): void;
};

declare global {
  interface Window {
    phantom?: { solana?: InjectedWalletProvider };
    solana?: InjectedWalletProvider;
    solflare?: InjectedWalletProvider;
    backpack?: InjectedWalletProvider;
  }
}

export type InstalledWallet = {
  id: "phantom" | "solflare" | "backpack" | "injected";
  name: string;
  provider: InjectedWalletProvider;
};

type WalletNetworkState = "checking" | "devnet" | "mismatch" | "error";

type WalletContextValue = {
  config: PublicEnv;
  connection: Connection;
  installedWallets: InstalledWallet[];
  selectedWallet: InstalledWallet | null;
  publicKey: PublicKey | null;
  networkState: WalletNetworkState;
  error: string | null;
  connecting: boolean;
  connect(wallet: InstalledWallet): Promise<void>;
  disconnect(): Promise<void>;
  estimateInstructions(instructions: TransactionInstruction[]): Promise<number>;
  sendInstructions(
    instructions: TransactionInstruction[],
    onPhase?: (phase: "awaitingSignature" | "confirming") => void,
  ): Promise<string>;
  requestSolAirdrop(): Promise<string>;
  refreshInstalledWallets(): void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

function detectInstalledWallets() {
  if (typeof window === "undefined") return [];
  const candidates: InstalledWallet[] = [];
  const seen = new Set<InjectedWalletProvider>();
  const add = (wallet: InstalledWallet | null) => {
    if (!wallet || seen.has(wallet.provider)) return;
    seen.add(wallet.provider);
    candidates.push(wallet);
  };
  const phantom =
    window.phantom?.solana ??
    (window.solana?.isPhantom ? window.solana : undefined);
  if (phantom?.isPhantom) {
    add({ id: "phantom", name: "Phantom", provider: phantom });
  }
  if (window.solflare) {
    add({ id: "solflare", name: "Solflare", provider: window.solflare });
  }
  if (window.backpack) {
    add({ id: "backpack", name: "Backpack", provider: window.backpack });
  }
  if (window.solana && !seen.has(window.solana)) {
    add({ id: "injected", name: "Browser wallet", provider: window.solana });
  }
  return candidates;
}

function providerNetworkMismatch(provider: InjectedWalletProvider) {
  const hint = `${provider.network ?? ""} ${provider.chain ?? ""}`
    .trim()
    .toLowerCase();
  return Boolean(hint && !hint.includes("devnet"));
}

export function walletErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 4001 || code === -32003) {
      return "The wallet rejected the transaction. Nothing was submitted.";
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient funds|0x1/i.test(message)) {
    return "The wallet needs more devnet SOL for fees or more demo tokens for this deposit.";
  }
  if (/blockhash|expired/i.test(message)) {
    return "The devnet blockhash expired before confirmation. Please retry.";
  }
  if (/user rejected|declined|cancelled by user/i.test(message)) {
    return "The wallet rejected the transaction. Nothing was submitted.";
  }
  if (/network|genesis|cluster/i.test(message)) {
    return "Network mismatch: ProofPlay transactions must use Solana devnet.";
  }
  return message || "The devnet transaction failed before confirmation.";
}

export function WalletProvider({
  config,
  children,
}: {
  config: PublicEnv;
  children: ReactNode;
}) {
  const connection = useMemo(
    () => new Connection(config.solanaRpcUrl, "confirmed"),
    [config.solanaRpcUrl],
  );
  const [installedWallets, setInstalledWallets] = useState<InstalledWallet[]>(
    [],
  );
  const [selectedWallet, setSelectedWallet] = useState<InstalledWallet | null>(
    null,
  );
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [networkState, setNetworkState] =
    useState<WalletNetworkState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refreshInstalledWallets = useCallback(() => {
    setInstalledWallets(detectInstalledWallets());
  }, []);

  useEffect(() => {
    const timer = setTimeout(refreshInstalledWallets, 0);
    return () => clearTimeout(timer);
  }, [refreshInstalledWallets]);

  useEffect(() => {
    let active = true;
    void connection
      .getGenesisHash()
      .then((genesis) => {
        if (!active) return;
        setNetworkState(
          genesis === PROOF_PLAY_DEVNET_GENESIS ? "devnet" : "mismatch",
        );
      })
      .catch(() => {
        if (active) setNetworkState("error");
      });
    return () => {
      active = false;
    };
  }, [connection]);

  useEffect(() => {
    const provider = selectedWallet?.provider;
    if (!provider?.on) return;
    const handleAccount = (value?: WalletPublicKey) => {
      try {
        setPublicKey(value ? new PublicKey(value.toString()) : null);
      } catch {
        setPublicKey(null);
      }
    };
    const handleDisconnect = () => handleAccount();
    provider.on("accountChanged", handleAccount);
    provider.on("disconnect", handleDisconnect);
    return () => {
      provider.removeListener?.("accountChanged", handleAccount);
      provider.removeListener?.("disconnect", handleDisconnect);
    };
  }, [selectedWallet]);

  const connect = useCallback(
    async (wallet: InstalledWallet) => {
      setConnecting(true);
      setError(null);
      try {
        if (
          networkState !== "devnet" ||
          providerNetworkMismatch(wallet.provider)
        ) {
          throw new Error(
            "Wallet or RPC network does not match Solana devnet.",
          );
        }
        const result = await wallet.provider.connect();
        setSelectedWallet(wallet);
        setPublicKey(new PublicKey(result.publicKey.toString()));
      } catch (caught) {
        setError(walletErrorMessage(caught));
        throw caught;
      } finally {
        setConnecting(false);
      }
    },
    [networkState],
  );

  const disconnect = useCallback(async () => {
    try {
      await selectedWallet?.provider.disconnect();
    } finally {
      setSelectedWallet(null);
      setPublicKey(null);
      setError(null);
    }
  }, [selectedWallet]);

  const buildTransaction = useCallback(
    async (instructions: TransactionInstruction[]) => {
      if (!publicKey) throw new Error("Connect a wallet before continuing.");
      if (networkState !== "devnet") {
        throw new Error("ProofPlay transactions require Solana devnet.");
      }
      const latest = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      });
      transaction.add(...instructions);
      return { transaction, latest };
    },
    [connection, networkState, publicKey],
  );

  const estimateInstructions = useCallback(
    async (instructions: TransactionInstruction[]) => {
      const { transaction } = await buildTransaction(instructions);
      const fee = await connection.getFeeForMessage(
        transaction.compileMessage(),
        "confirmed",
      );
      if (fee.value === null) {
        throw new Error("Devnet could not estimate this transaction fee.");
      }
      return fee.value;
    },
    [buildTransaction, connection],
  );

  const sendInstructions = useCallback(
    async (
      instructions: TransactionInstruction[],
      onPhase?: (phase: "awaitingSignature" | "confirming") => void,
    ) => {
      if (!selectedWallet || !publicKey) {
        throw new Error("Connect a wallet before continuing.");
      }
      if (providerNetworkMismatch(selectedWallet.provider)) {
        throw new Error("The connected wallet is not configured for devnet.");
      }
      const { transaction, latest } = await buildTransaction(instructions);
      onPhase?.("awaitingSignature");
      const signed = await selectedWallet.provider.signTransaction(transaction);
      onPhase?.("confirming");
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
        {
          maxRetries: 3,
          skipPreflight: false,
        },
      );
      const confirmation = await connection.confirmTransaction(
        { signature, ...latest },
        "confirmed",
      );
      if (confirmation.value.err) {
        throw new Error(
          `Devnet rejected the transaction: ${JSON.stringify(confirmation.value.err)}`,
        );
      }
      return signature;
    },
    [buildTransaction, connection, publicKey, selectedWallet],
  );

  const requestSolAirdrop = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet before requesting SOL.");
    if (networkState !== "devnet") throw new Error("Airdrops require devnet.");
    const signature = await connection.requestAirdrop(
      publicKey,
      LAMPORTS_PER_SOL,
    );
    await connection.confirmTransaction(signature, "confirmed");
    return signature;
  }, [connection, networkState, publicKey]);

  return (
    <WalletContext.Provider
      value={{
        config,
        connection,
        installedWallets,
        selectedWallet,
        publicKey,
        networkState,
        error,
        connecting,
        connect,
        disconnect,
        estimateInstructions,
        sendInstructions,
        requestSolAirdrop,
        refreshInstalledWallets,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider.");
  return value;
}

export function WalletControl() {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = "proof-play-wallet-menu";
  const shortAddress = wallet.publicKey
    ? `${wallet.publicKey.toBase58().slice(0, 4)}…${wallet.publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div className="wallet-control">
      <button
        ref={triggerRef}
        className="wallet-control__trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
      >
        <span
          className="status-dot"
          data-state={
            wallet.networkState === "devnet"
              ? wallet.publicKey
                ? "connected"
                : "ready"
              : "error"
          }
          aria-hidden="true"
        />
        {shortAddress ?? "Connect wallet"}
      </button>
      {open ? (
        <div
          className="wallet-menu"
          id={menuId}
          role="dialog"
          aria-label="Wallet connection"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <div className="wallet-menu__network">
            <span>Network</span>
            <strong>
              {wallet.networkState === "devnet"
                ? "Solana devnet"
                : wallet.networkState === "checking"
                  ? "Checking devnet…"
                  : "Devnet unavailable"}
            </strong>
          </div>
          {wallet.publicKey ? (
            <>
              <a
                href={explorerAddressUrl(wallet.publicKey)}
                target="_blank"
                rel="noreferrer"
              >
                View wallet on Explorer ↗
              </a>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void wallet.disconnect();
                }}
              >
                Disconnect
              </button>
            </>
          ) : wallet.installedWallets.length ? (
            wallet.installedWallets.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                disabled={wallet.connecting || wallet.networkState !== "devnet"}
                onClick={() => {
                  void wallet
                    .connect(candidate)
                    .then(() => setOpen(false))
                    .catch(() => undefined);
                }}
              >
                Connect {candidate.name}
              </button>
            ))
          ) : (
            <div className="wallet-menu__empty">
              <strong>No supported wallet detected</strong>
              <span>Install Phantom, Solflare, or Backpack, then retry.</span>
              <button type="button" onClick={wallet.refreshInstalledWallets}>
                Check again
              </button>
            </div>
          )}
          {wallet.error ? <p role="alert">{wallet.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
