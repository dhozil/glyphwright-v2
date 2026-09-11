# Glyphwright V2

> Forge spells in plain language. Paid forge tiers determine quality. Battle your spells head-to-head in PvP arenas with flexible stakes. All powered by **GenLayer** Optimistic Democracy.

Glyphwright is an arcane crafting game built on top of [GenLayer](https://genlayer.com)'s Intelligent Contracts — smart contracts that call LLMs natively. A council of 5 validator personas judges power, mana, element, rarity, and narrative quality. **All spells are always FORGED** — gacha rarity determines quality via tier-based probability weights.

---

## Features

- **Three forge tiers** — Standard (1 GEN, PWR 60-75), Epic (2.5 GEN, PWR 76-89), Legendary (5 GEN, PWR 90-99)
- **Gacha rarity** — each tier has weighted rarity pools (Legendary tier can drop rare/epic/legendary spells)
- **Element wheel** — 9-element cycle with deterministic advantage system (each element beats the next 3)
- **Battle PvP** — challenge other players' spells in arenas with flexible GEN stakes; 5% platform fee, draw = refund
- **Star ratings** — rate spells up to 5 stars after battles; contributes to battle scoring
- **6-criteria battle scoring** — Raw Power (30%), Element Advantage (20%), Mana Efficiency (15%), Star Rating (15%), Rarity Bonus (10%), Narrative Quality (10%)
- **5-validator AI council** — distinct personas judge spells via `run_nondet_unsafe` with custom validators
- **MetaMask + GenLayer Snap** — connect with MetaMask; the GenLayer Snap signs Intelligent Contract calls
- **On-chain grimoire** — every player's collection is keyed to their wallet address
- **Native GEN marketplace** — list spells for sale in GEN, buy other players' glyphs
- **On-chain deposits** — deposit GEN into contract balance; withdraw freely without waiting for battle resolution
- **Balance system** — `deposit()` / `withdraw()` / `contract_balance()` for WagerDuel consistency

---

## Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | **Landing** | Hero, feature overview, CTA to enter the game |
| `/play` | **The Forge** | Select tier, write intent, forge spell — gacha rarity determines quality |
| `/grimoire` | **Your Grimoire** | View your collected spells, rate stars, list on market |
| `/market` | **Glyph Market** | Browse all listings, buy spells with native GEN |
| `/battle` | **Battle Arenas** | Create/join PvP arenas, view battle history, filter by status |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start v1 (React 19, SSR-capable, file-based routing) |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 + semantic tokens in `src/styles.css` |
| Smart contract | GenLayer Intelligent Contract — Python (`contracts/glyphwright_v2.py`) |
| Consensus | `run_nondet_unsafe` with custom validators — identity + vote equivalence principles |
| SDK | [`genlayer-js`](https://github.com/genlayerlabs/genlayer-js) — Studionet client + MetaMask Snap |
| Wallet | MetaMask via GenLayer Snap (`client.connect("studionet")`) |
| Currency | Native GEN — deposits, stakes, and payments in wei (1 GEN = 1e18 wei) |
| Storage | Contract state (JSON dict — no `allow_storage` / dataclass) |

---

## Project Structure

```
contracts/
├── glyphwright.py              # V1 GenLayer Intelligent Contract (legacy)
└── glyphwright_v2.py           # V2 GenLayer Intelligent Contract (forge tiers, battles, star ratings)

public/
└── favicon.svg                 # Arcane glyph favicon

src/
├── components/
│   ├── glyph/
│   │   ├── AppHeader.tsx        # Sticky header: nav, MetaMask connect, GEN balance
│   │   ├── SpellCard.tsx        # Spell display with rarity ring, star rating
│   │   ├── ArenaCard.tsx        # Battle arena card with element gradient, scores, reasoning
│   │   ├── StarRating.tsx       # Star rating display (1-5 stars)
│   │   ├── TierSelector.tsx     # Forge tier selection (Standard/Epic/Legendary)
│   │   └── constants.ts         # Element hues, rarity rings, example intents
│   └── ui/                      # shadcn primitives
├── lib/
│   ├── glyphwright.contract.ts  # genlayer-js wrapper — every read/write goes through here
│   ├── genlayer-chain.ts        # Studionet chain config + helpers
│   ├── wallet.tsx               # useWallet() — MetaMask connection + deposit/withdraw
│   ├── glyphwright.functions.ts # Type re-exports for backward-compat imports
│   ├── grimoire.ts              # Type re-exports for backward-compat imports
│   └── marketplace.ts           # Type re-exports for backward-compat imports
├── routes/
│   ├── __root.tsx               # Shell, providers, error boundaries, favicon
│   ├── index.tsx                # Landing page
│   ├── _app.tsx                 # Layout for in-game pages (header + Outlet)
│   ├── _app.play.tsx            # The Forge — tier selection + forge_spell
│   ├── _app.grimoire.tsx        # Reads get_spells_by_owner; lists spells via list_spell
│   ├── _app.market.tsx          # Reads get_active_listings; buy / delist writes
│   └── _app.battle.tsx          # Battle arenas — create, join, view history
└── styles.css                   # Arcane design tokens (oklch)
```

---

## GenLayer Integration

The contract runs on **GenLayer Studionet** (chainId `0xF23F` / 61999).

### Deployment

**Current address: `0x2FCC25047a0D44A62457E2f13cffb004Ec6035c2`**

```bash
# .env
VITE_GLYPHWRIGHT_CONTRACT=0x2FCC25047a0D44A62457E2f13cffb004Ec6035c2
```

Deploy with the GenLayer CLI:

```bash
genlayer network studionet
genlayer deploy --contract contracts/glyphwright_v2.py
```

### Wallet model

1. User clicks **Connect Wallet** → MetaMask popup
2. `client.connect("studionet")` installs the GenLayer Snap and switches chain
3. Every `forge_spell`, `create_arena`, `join_arena`, `list_spell` is signed by MetaMask

### Currency

- Players deposit GEN via `deposit()` into contract balance
- Battle stakes are deducted from on-chain balance
- Marketplace uses `gl.message.value` for direct payments
- Platform fee: 5% on battle wins (draw = full refund)

---

## Running Locally

```bash
bun install
# Optional: pre-set the contract address
#   VITE_GLYPHWRIGHT_CONTRACT=0x...
bun dev
```

Open [http://localhost:8080](http://localhost:8080):

1. Click **Connect Wallet** in the header — MetaMask will prompt, install the GenLayer Snap, and switch to Studionet
2. Make sure the connected account has Studionet GEN — use the Studio faucet if it doesn't
3. Head to `/play`, select a tier, and forge your first spell

---

## Roadmap

- **Seasonal leaderboards** — most-forged, rarest spell, biggest sale
- **Spell fusion** — combine two grimoire spells into a new hybrid
- **Testnet deployment** — deploy to Bradbury/Asimov for real ETH withdrawals
- **AI-generated spell sigils** — image generation gated by rarity

---

## License

MIT — fork it, remix it, forge stranger spells.
