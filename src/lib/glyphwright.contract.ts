// Glyphwright <-> GenLayer Studionet bridge.
//
// All on-chain interaction lives here. The rest of the app talks to the
// contract through the typed helpers exported below.
//
// Identity model
// --------------
// Players connect with MetaMask. genlayer-js handles the GenLayer
// MetaMask Snap behind the scenes so MetaMask can sign Intelligent
// Contract calls against Studionet's `gen_*` JSON-RPC. We build a
// client per connected EVM address; the address is the player's
// identity and is also the contract `gl.message.sender_address`.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, type TransactionHash, type GenLayerTransaction } from "genlayer-js/types";
import type { Address as ViemAddress } from "viem";
import {
  getWalletMode,
  setWalletMode,
  ensureBurner,
  tryLoadBurner,
  clearBurner,
} from "./burner";
export type { WalletMode } from "./burner";
export { getWalletMode, setWalletMode } from "./burner";

// ---------- Retry helpers --------------------------------------------------

const READ_RETRY_DELAY_MS = 400;
const LEADER_RECEIPT_POLL_INTERVAL_MS = 2000;
const LEADER_RECEIPT_MAX_POLLS = 15;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function readContractWithRetry<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn();
  } catch {
    await sleep(READ_RETRY_DELAY_MS);
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }
}

async function waitForLeaderReceipt(
  client: ReturnType<typeof getClient>,
  hash: TransactionHash,
): Promise<GenLayerTransaction> {
  for (let i = 0; i < LEADER_RECEIPT_MAX_POLLS; i++) {
    const tx = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: 1,
      interval: 1000,
    });
    const leaderResult = (tx as GenLayerTransaction)?.consensus_data?.leader_receipt?.[0]?.result;
    if (leaderResult) return tx as GenLayerTransaction;
    await sleep(LEADER_RECEIPT_POLL_INTERVAL_MS);
  }
  return client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 1,
    interval: 1000,
  }) as Promise<GenLayerTransaction>;
}

// ---------- Contract address ----------------------------------------------

const CONTRACT_ADDR_KEY = "glyphwright:contract:address";

// Deployed on GenLayer Studionet. Set via VITE_GLYPHWRIGHT_CONTRACT or
// falls back to this hardcoded address from the last known deployment.
const FALLBACK_CONTRACT = "0x74C5fc65b9c553Eb40137f17cE483e4f9c7d16f5";

const ENV_ADDR =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_GLYPHWRIGHT_CONTRACT) ||
  FALLBACK_CONTRACT;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getContractAddress(): ViemAddress | null {
  if (ENV_ADDR && /^0x[0-9a-fA-F]{40}$/.test(ENV_ADDR)) {
    return ENV_ADDR as ViemAddress;
  }
  if (!isBrowser()) return null;
  const v = localStorage.getItem(CONTRACT_ADDR_KEY);
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as ViemAddress) : null;
}

export function setContractAddress(addr: string): void {
  if (!isBrowser()) return;
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return;
  localStorage.setItem(CONTRACT_ADDR_KEY, addr);
}

class ContractNotConfiguredError extends Error {
  constructor() {
    super(
      "Glyphwright contract address not set. Deploy contracts/glyphwright.py to GenLayer Studionet, then set VITE_GLYPHWRIGHT_CONTRACT.",
    );
    this.name = "ContractNotConfiguredError";
  }
}

function requireContractAddress(): ViemAddress {
  const a = getContractAddress();
  if (!a) throw new ContractNotConfiguredError();
  return a;
}

// ---------- Wallet connection (MetaMask) ----------------------------------

const ADDR_STORAGE = "glyphwright:wallet:address";

type Eth = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
};

declare global {
  interface Window {
    ethereum?: Eth;
  }
}

export class WalletNotConnectedError extends Error {
  constructor() {
    super("Wallet not connected. Click 'Connect Wallet' in the header.");
    this.name = "WalletNotConnectedError";
  }
}

export class NoWalletError extends Error {
  constructor() {
    super("MetaMask is recommended for the best Glyphwright experience.");
    this.name = "NoWalletError";
  }
}

export async function connectBurnerWallet(): Promise<ViemAddress> {
  const addr = ensureBurner();
  saveStoredAddress(addr);
  return addr;
}

export function isBurnerMode(): boolean {
  return getWalletMode() === "burner";
}

export function loadStoredAddress(): ViemAddress | null {
  if (!isBrowser()) return null;
  const v = localStorage.getItem(ADDR_STORAGE);
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as ViemAddress) : null;
}

function saveStoredAddress(addr: ViemAddress | null): void {
  if (!isBrowser()) return;
  if (addr) localStorage.setItem(ADDR_STORAGE, addr);
  else localStorage.removeItem(ADDR_STORAGE);
}

let cachedClient: ReturnType<typeof createClient> | null = null;
let cachedFor: ViemAddress | null = null;
let connectedOnce = false;

function getProvider(): Eth | null {
  if (typeof window === "undefined" || !window.ethereum) return null;
  return window.ethereum;
}

function buildClient(addr: ViemAddress, provider?: Eth) {
  if (cachedClient && cachedFor === addr && connectedOnce) return cachedClient;
  cachedClient = createClient({
    chain: studionet,
    account: addr,
    ...(provider ? { provider } : {}),
  });
  cachedFor = addr;
  return cachedClient;
}

function getClient(addr?: ViemAddress | null): ReturnType<typeof createClient> {
  const target = addr ?? loadStoredAddress();
  if (!target) throw new WalletNotConnectedError();
  return cachedClient && cachedFor === target
    ? cachedClient
    : buildClient(target, getProvider() ?? undefined);
}

/** Reset state when the user disconnects or switches accounts. */
export function clearWalletState(): void {
  cachedClient = null;
  cachedFor = null;
  connectedOnce = false;
  saveStoredAddress(null);
}

export function disconnectBurner(): void {
  clearWalletState();
  clearBurner();
}

/** Prompt EIP-1193 wallet for accounts. Works with MetaMask, Rabby,
 *  Coinbase, Brave, and any other EIP-1193 compatible wallet. */
export async function connectWallet(): Promise<ViemAddress> {
  if (!isBrowser()) throw new NoWalletError();

  if (getWalletMode() === "burner") {
    return connectBurnerWallet();
  }

  const provider = getProvider();
  if (!provider) throw new NoWalletError();

  const accs = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const addr = accs?.[0];
  if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error("No account returned from wallet.");
  }
  saveStoredAddress(addr as ViemAddress);
  buildClient(addr as ViemAddress, provider);
  return addr as ViemAddress;
}

/** Ensure the network is correct and (for MetaMask) install Snap.
 *  Non-MetaMask wallets (Rabby, Coinbase, etc.) use the standard
 *  EIP-1193 provider for signing — no Snap needed. */
async function ensureConnected(addr: ViemAddress): Promise<void> {
  if (connectedOnce && cachedFor === addr) return;

  if (getWalletMode() === "burner") {
    const burner = tryLoadBurner();
    if (!burner) throw new Error("burner account not found");
    const account = createAccount(burner.privKey);
    cachedClient = createClient({ chain: studionet, account });
    cachedFor = account.address.toLowerCase() as ViemAddress;
    connectedOnce = true;
    saveStoredAddress(account.address.toLowerCase() as ViemAddress);
    return;
  }

  const provider = getProvider();
  if (!provider) throw new WalletNotConnectedError();

  // EIP-1193 wallet — try Snap install for MetaMask, but don't block
  // if it fails (non-MetaMask wallet still works via standard provider).
  try {
    await (buildClient(addr, provider) as unknown as {
      connect: (network: string) => Promise<void>;
    }).connect("studionet");
  } catch {
    // Non-MetaMask wallet — standard eth_sendTransaction handles signing
  }
  connectedOnce = true;
}

// ---------- Domain types --------------------------------------------------

export type Vote = {
  validator: string;
  power: number;
  mana_cost: number;
  element: string;
  rarity: string;
  reasoning: string;
};

export type Consensus = {
  power: number;
  mana_cost: number;
  element: string;
  rarity: string;
  approval: number; // always 100
  verdict: "FORGED"; // always FORGED
  tier: string;
};

export type ForgeResult = {
  spell_id: string;
  owner: string;
  forged_at: number;
  tier: string;
  intent: string;
  spellName: string;
  incantation: string;
  description: string;
  votes: Vote[];
  consensus: Consensus;
};

export type Spell = {
  id: string;
  owner: string;
  forged_at: number;
  tier: string;
  spellName: string;
  incantation: string;
  description: string;
  intent: string;
  votes: Vote[];
  consensus: Consensus;
  stars: number;
  wins: number;
  losses: number;
};

export type Listing = {
  id: string;
  spell_id: string;
  seller: string;
  /** Price in wei (1 GEN = 1e18 wei). */
  price: bigint;
  listed_at: number;
  spell: Spell;
};

export type Arena = {
  id: string;
  creator: string;
  creator_spell_id: string;
  creator_spell?: Spell;
  stake_wei: bigint;
  status: "waiting" | "active" | "completed" | "expired" | "cancelled";
  challenger: string;
  challenger_spell_id: string;
  challenger_spell?: Spell;
  winner: string;
  score_a?: number;
  score_b?: number;
  reasoning?: string;
  element_advantage?: string;
  created_at: number;
  resolved_at: number;
  settled: boolean;
};

export type ForgeTier = "standard" | "epic" | "legendary";

export type ForgeTierConfig = {
  name: string;
  cost_wei: bigint;
  cost_gen: string;
  rarity_weights: Record<string, number>;
};

export type SpellStats = {
  spell_id: string;
  wins: number;
  losses: number;
  stars: number;
  win_rate: number;
};

// ---------- Result coercion -----------------------------------------------

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const num = (x: unknown, fallback = 0): number => {
  if (typeof x === "number") return x;
  if (typeof x === "bigint") return Number(x);
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
};

const str = (x: unknown, fallback = ""): string =>
  typeof x === "string" ? x : fallback;

const bool = (x: unknown): boolean => Boolean(x);

/** Extract and double-decode the leader receipt result into a ForgeResult. */
function decodeLeaderReceipt(tx: GenLayerTransaction): ForgeResult | null {
  const leaderResult = tx?.consensus_data?.leader_receipt?.[0]?.result;

  let rawJson: string | undefined;
  if (typeof leaderResult === "string") {
    rawJson = leaderResult;
  } else if (leaderResult && typeof leaderResult === "object") {
    if ("payload" in leaderResult) {
      const p = (leaderResult as { payload: unknown }).payload;
      if (typeof p === "string") rawJson = p;
      else if (p && typeof p === "object" && "readable" in p)
        rawJson = (p as { readable: string }).readable;
    } else if ("readable" in leaderResult) {
      rawJson = (leaderResult as { readable: string }).readable;
    }
  }

  if (rawJson) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawJson);
      if (typeof decoded === "string") decoded = JSON.parse(decoded);
    } catch {
      decoded = null;
    }
    return coerceForgeResult(isRecord(decoded) ? decoded : null);
  }
  return null;
}

function coerceVote(raw: unknown): Vote {
  const r = isRecord(raw) ? raw : {};
  return {
    validator: str(r.validator),
    power: num(r.power),
    mana_cost: num(r.mana_cost),
    element: str(r.element),
    rarity: str(r.rarity),
    reasoning: str(r.reasoning),
  };
}

function coerceConsensus(raw: unknown): Consensus {
  const r = isRecord(raw) ? raw : {};
  return {
    power: num(r.power),
    mana_cost: num(r.mana_cost),
    element: str(r.element, "arcane"),
    rarity: str(r.rarity, "common"),
    approval: num(r.approval, 100),
    verdict: "FORGED",
    tier: str(r.tier, "standard"),
  };
}

function coerceForgeResult(raw: unknown): ForgeResult | null {
  if (!isRecord(raw) || !raw.consensus) return null;
  const votes = Array.isArray(raw.votes) ? raw.votes.map(coerceVote) : [];
  return {
    spell_id: str(raw.spell_id),
    owner: str(raw.owner),
    forged_at: num(raw.forged_at),
    tier: str(raw.tier, "standard"),
    intent: str(raw.intent),
    spellName: str(raw.spellName),
    incantation: str(raw.incantation),
    description: str(raw.description),
    votes,
    consensus: coerceConsensus(raw.consensus),
  };
}

function coerceSpell(raw: unknown): Spell | null {
  if (!isRecord(raw) || !raw.id) return null;
  const votes = Array.isArray(raw.votes) ? raw.votes.map(coerceVote) : [];
  return {
    id: str(raw.id),
    owner: str(raw.owner),
    forged_at: num(raw.forged_at),
    tier: str(raw.tier, "standard"),
    spellName: str(raw.spellName),
    incantation: str(raw.incantation),
    description: str(raw.description),
    intent: str(raw.intent),
    votes,
    consensus: coerceConsensus(raw.consensus),
    stars: num(raw.stars),
    wins: num(raw.wins),
    losses: num(raw.losses),
  };
}

function coerceListing(raw: unknown): Listing | null {
  if (!isRecord(raw) || !raw.id) return null;
  const sp = coerceSpell(raw.spell);
  if (!sp) return null;
  let price: bigint;
  try {
    price = typeof raw.price === "bigint" ? raw.price : BigInt(String(raw.price ?? 0));
  } catch {
    price = 0n;
  }
  return {
    id: str(raw.id),
    spell_id: str(raw.spell_id),
    seller: str(raw.seller),
    price,
    listed_at: num(raw.listed_at),
    spell: sp,
  };
}

// ---------- Public read methods (free, no signing) ------------------------
//
// Reads work without a connected wallet — we lazily build a read-only
// client when needed.

let readonlyClient: ReturnType<typeof createClient> | null = null;
function getReadonlyClient() {
  if (readonlyClient) return readonlyClient;
  readonlyClient = createClient({ chain: studionet });
  return readonlyClient;
}

export async function balanceOf(addr: string): Promise<bigint> {
  // Native GEN balance lives on the chain layer, not on the IC. We read
  // it via the standard EVM `eth_getBalance` exposed through genlayer-js
  // (which is just a viem client under the hood for read ops).
  const client = getReadonlyClient();
  // viem's getBalance is part of PublicActions and is preserved on the
  // GenLayerClient.
  const bal = await (client as unknown as {
    getBalance: (args: { address: string }) => Promise<bigint>;
  }).getBalance({ address: addr });
  return bal;
}

// Helper: contract methods now return JSON strings (PatchworkTruth-style),
// so every read goes through this little parse step.
function parseJsonOrNull<T = unknown>(raw: unknown): T | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getSpellsByOwner(addr: string): Promise<Spell[]> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_spells_by_owner",
      args: [addr],
    }),
    "[]",
  );
  const arr = parseJsonOrNull<unknown[]>(r);
  if (!Array.isArray(arr)) return [];
  return arr.map(coerceSpell).filter((s): s is Spell => s !== null);
}

export async function getActiveListings(): Promise<Listing[]> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_active_listings",
      args: [],
    }),
    "[]",
  );
  const arr = parseJsonOrNull<unknown[]>(r);
  if (!Array.isArray(arr)) return [];
  return arr.map(coerceListing).filter((l): l is Listing => l !== null);
}

export async function getLastForge(addr: string): Promise<ForgeResult | null> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_last_forge",
      args: [addr],
    }),
    "",
  );
  const obj = parseJsonOrNull(r);
  return coerceForgeResult(obj);
}

// ---------- Public write methods (signed via MetaMask) --------------------

async function writeAndWait(
  functionName: string,
  args: unknown[],
  value: bigint = 0n,
): Promise<{ hash: TransactionHash; tx: GenLayerTransaction }> {
  const addr = loadStoredAddress();
  if (!addr) throw new WalletNotConnectedError();
  await ensureConnected(addr);
  const client = getClient(addr);

  const hash: TransactionHash = await client.writeContract({
    address: requireContractAddress(),
    functionName,
    args: args as never[],
    value,
  });
  // ACCEPTED is the standard UX choice — FINALIZED forces players to
  // sit through the appeal window for every action.
  const tx = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 2000,
  });
  // Poll for leader receipt — sometimes ACCEPTED arrives before consensus data is populated
  const fullTx = await waitForLeaderReceipt(client, hash);
  return { hash, tx: fullTx };
}

export async function forgeSpell(intent: string): Promise<ForgeResult> {
  const trimmed = intent.trim();
  if (trimmed.length < 5 || trimmed.length > 400) {
    throw new Error("intent must be 5..400 chars");
  }
  const { tx } = await writeAndWait("forge_spell", [trimmed]);

  const result = decodeLeaderReceipt(tx);
  if (result) return result;
  throw new Error(
    "Forge transaction was accepted but the return value is not available yet. Check your Grimoire in a moment.",
  );
}

export async function forgeSpellTier(
  intent: string,
  tier: string,
  value: bigint,
): Promise<ForgeResult> {
  const trimmed = intent.trim();
  if (trimmed.length < 5 || trimmed.length > 400) {
    throw new Error("intent must be 5..400 chars");
  }
  const { tx } = await writeAndWait("forge_spell_tier", [trimmed, tier], value);

  const result = decodeLeaderReceipt(tx);
  if (result) return result;
  throw new Error(
    "Forge transaction was accepted but the return value is not available yet. Check your Grimoire in a moment.",
  );
}

export async function listSpell(
  spellId: string,
  priceWei: bigint,
): Promise<void> {
  if (priceWei <= 0n) {
    throw new Error("price must be > 0");
  }
  await writeAndWait("list_spell", [spellId, priceWei]);
}

export async function delistSpell(listingId: string): Promise<void> {
  await writeAndWait("delist_spell", [listingId]);
}

export async function buyListing(
  listingId: string,
  priceWei: bigint,
): Promise<void> {
  await writeAndWait("buy_listing", [listingId], priceWei);
}

// ---------- V2 Battle Methods -----------------------------------------------

export async function createArena(
  spellId: string,
  stakeWei: bigint,
): Promise<string> {
  if (stakeWei <= 0n) {
    throw new Error("stake must be > 0");
  }
  const { tx } = await writeAndWait("create_arena", [spellId, stakeWei]);
  
  // Extract arena_id from transaction result
  const leaderResult = tx?.consensus_data?.leader_receipt?.[0]?.result;
  let arenaId = "";
  
  if (typeof leaderResult === "string") {
    arenaId = leaderResult;
  } else if (leaderResult && typeof leaderResult === "object") {
    if ("payload" in leaderResult) {
      const p = (leaderResult as { payload: unknown }).payload;
      if (typeof p === "string") arenaId = p;
      else if (p && typeof p === "object" && "readable" in p)
        arenaId = (p as { readable: string }).readable;
    } else if ("readable" in leaderResult) {
      arenaId = (leaderResult as { readable: string }).readable;
    }
  }
  
  if (!arenaId) {
    throw new Error("Arena created but ID not available. Check Battle page.");
  }
  return arenaId;
}

export async function joinArena(
  arenaId: string,
  spellId: string,
  stakeWei: bigint,
): Promise<void> {
  await writeAndWait("join_arena", [arenaId, spellId]);
}

export async function getAllArenas(): Promise<Arena[]> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_all_arenas",
      args: [],
    }),
    "[]",
  );
  const arr = parseJsonOrNull<unknown[]>(r);
  if (!Array.isArray(arr)) return [];
  return arr.map(coerceArena).filter((a): a is Arena => a !== null);
}

export async function getActiveArenas(): Promise<Arena[]> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_active_arenas",
      args: [],
    }),
    "[]",
  );
  const arr = parseJsonOrNull<unknown[]>(r);
  if (!Array.isArray(arr)) return [];
  return arr.map(coerceArena).filter((a): a is Arena => a !== null);
}

export async function getArena(arenaId: string): Promise<Arena | null> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_arena",
      args: [arenaId],
    }),
    "",
  );
  const obj = parseJsonOrNull(r);
  return coerceArena(obj);
}

export async function getPlayerArenas(playerAddr: string): Promise<Arena[]> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_player_arenas",
      args: [playerAddr],
    }),
    "[]",
  );
  const arr = parseJsonOrNull<unknown[]>(r);
  if (!Array.isArray(arr)) return [];
  return arr.map(coerceArena).filter((a): a is Arena => a !== null);
}

export async function getSpellStats(spellId: string): Promise<SpellStats | null> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_spell_stats",
      args: [spellId],
    }),
    "",
  );
  const obj = parseJsonOrNull(r);
  if (!isRecord(obj)) return null;
  return {
    spell_id: str(obj.spell_id),
    wins: num(obj.wins),
    losses: num(obj.losses),
    stars: num(obj.stars),
    win_rate: num(obj.win_rate),
  };
}

export async function getForgeTiers(): Promise<ForgeTierConfig[]> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_forge_tiers",
      args: [],
    }),
    "{}",
  );
  const obj = parseJsonOrNull<Record<string, unknown>>(r);
  if (!isRecord(obj)) return [];
  
  return Object.entries(obj).map(([name, config]) => {
    const c = isRecord(config) ? config : {};
    return {
      name,
      cost_wei: typeof c.cost_wei === "bigint" ? c.cost_wei : BigInt(String(c.cost_wei ?? 0)),
      cost_gen: String(c.cost_gen ?? "0"),
      rarity_weights: isRecord(c.rarity_weights) ? c.rarity_weights as Record<string, number> : {},
    };
  });
}

export async function claimExpiredArena(arenaId: string): Promise<void> {
  await writeAndWait("claim_expired_arena", [arenaId]);
}

export async function cancelArena(arenaId: string): Promise<void> {
  await writeAndWait("cancel_arena", [arenaId]);
}

export async function expireActiveBattle(arenaId: string): Promise<void> {
  await writeAndWait("expire_active_battle", [arenaId]);
}

export async function withdrawFees(): Promise<void> {
  await writeAndWait("withdraw_fees", []);
}

// ---------- Balance Methods -------------------------------------------------

export async function deposit(value: bigint): Promise<void> {
  if (value <= 0n) throw new Error("deposit must be > 0");
  await writeAndWait("deposit", [], value);
}

export async function withdraw(amount: bigint): Promise<void> {
  if (amount <= 0n) throw new Error("withdraw amount must be > 0");
  await writeAndWait("withdraw", [amount]);
}

export async function getContractBalance(addr: string): Promise<bigint> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_balance",
      args: [addr],
    }),
    "",
  );
  const obj = parseJsonOrNull(r);
  if (!isRecord(obj)) return 0n;
  try {
    return BigInt(String(obj.balance_wei ?? "0"));
  } catch {
    return 0n;
  }
}

export async function getAccumulatedFees(): Promise<{ fees_wei: string; fees_gen: number }> {
  const client = getReadonlyClient();
  const r = await readContractWithRetry(
    () => client.readContract({
      address: requireContractAddress(),
      functionName: "get_accumulated_fees",
      args: [],
    }),
    "",
  );
  const obj = parseJsonOrNull(r);
  if (!isRecord(obj)) return { fees_wei: "0", fees_gen: 0 };
  return {
    fees_wei: str(obj.fees_wei, "0"),
    fees_gen: num(obj.fees_gen),
  };
}

// ---------- V2 Coercion Helpers --------------------------------------------

function coerceArena(raw: unknown): Arena | null {
  if (!isRecord(raw) || !raw.id) return null;
  const creatorSpell = isRecord(raw.creator_spell) ? coerceSpell(raw.creator_spell) : undefined;
  const challengerSpell = isRecord(raw.challenger_spell) ? coerceSpell(raw.challenger_spell) : undefined;
  
  let stakeWei: bigint;
  try {
    stakeWei = typeof raw.stake_wei === "bigint" ? raw.stake_wei : BigInt(String(raw.stake_wei ?? 0));
  } catch {
    stakeWei = 0n;
  }
  
  return {
    id: str(raw.id),
    creator: str(raw.creator),
    creator_spell_id: str(raw.creator_spell_id),
    creator_spell: creatorSpell ?? undefined,
    stake_wei: stakeWei,
    status: raw.status === "active" ? "active" : raw.status === "completed" ? "completed" : raw.status === "expired" ? "expired" : raw.status === "cancelled" ? "cancelled" : "waiting",
    challenger: str(raw.challenger),
    challenger_spell_id: str(raw.challenger_spell_id),
    challenger_spell: challengerSpell ?? undefined,
    winner: str(raw.winner),
    score_a: typeof raw.score_a === "number" ? raw.score_a : undefined,
    score_b: typeof raw.score_b === "number" ? raw.score_b : undefined,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : undefined,
    element_advantage: typeof raw.element_advantage === "string" ? raw.element_advantage : undefined,
    created_at: num(raw.created_at),
    resolved_at: num(raw.resolved_at),
    settled: Boolean(raw.settled),
  };
}

// ---------- Misc ----------------------------------------------------------

export const GENLAYER_EXPLORER = "https://explorer-studio.genlayer.com";

export const studioExplorer = (txHash: string) =>
  `${GENLAYER_EXPLORER}/tx/${txHash}`;

/** Format wei as a short GEN string (e.g. 1500000000000000000n -> "1.5"). */
export function formatGen(wei: bigint, fractionDigits = 4): string {
  const ONE = 1_000_000_000_000_000_000n; // 1e18
  const whole = wei / ONE;
  const remainder = wei - whole * ONE;
  if (remainder === 0n) return whole.toString();
  // Build a fixed-point fraction string and trim trailing zeros.
  const raw = remainder.toString().padStart(18, "0");
  // Round the last digit for accurate display
  const roundPos = Math.min(fractionDigits + 1, 18);
  const roundDigit = Number(raw[roundPos] ?? "0");
  let fracStr = raw.slice(0, fractionDigits);
  if (roundDigit >= 5) {
    // Manual rounding carry
    const padded = (fracStr + "0".repeat(fractionDigits)).slice(0, fractionDigits);
    let val = Number(padded) + 1;
    if (val >= 10 ** fractionDigits) {
      return `${whole + 1n}`;
    }
    fracStr = val.toString().padStart(fractionDigits, "0");
  }
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed.length ? `${whole}.${trimmed}` : whole.toString();
}

/** Parse a "1.5" GEN string into wei. Returns null if invalid. */
export function parseGen(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  try {
    return BigInt(whole) * 1_000_000_000_000_000_000n + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}
