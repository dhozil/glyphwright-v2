<p align="center">
  <img src="public/favicon.svg" alt="Glyphwright Logo" width="120" />
</p>

<h1 align="center">Glyphwright V2</h1>

<p align="center">
  <strong>Forge spells. Battle rivals. Earn GEN.</strong><br/>
  An arcane crafting game powered by <a href="https://genlayer.com">GenLayer</a> Intelligent Contracts
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#pages">Pages</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

## Features

| Feature | Description |
|---|---|
| **Three Forge Tiers** | Standard (1 GEN) · Epic (2.5 GEN) · Legendary (5 GEN) — each with unique power ranges and rarity pools |
| **Gacha Rarity** | Tier-based weighted probability — Legendary tier can drop rare, epic, or legendary spells |
| **Element Wheel** | 9-element cycle with deterministic advantage — each element beats the next 3 in the wheel |
| **Battle PvP** | Challenge rivals in arenas with flexible GEN stakes — 5% platform fee, draw = full refund |
| **Star Ratings** | Rate spells up to 5 stars — contributes to battle scoring |
| **6-Criteria Scoring** | Raw Power (30%) · Element Advantage (20%) · Mana Efficiency (15%) · Star Rating (15%) · Rarity Bonus (10%) · Narrative Quality (10%) |
| **AI Council** | 5 validator personas judge spells via `run_nondet_unsafe` with custom validators |
| **MetaMask + GenLayer Snap** | Connect with MetaMask — the GenLayer Snap signs Intelligent Contract calls |
| **On-Chain Grimoire** | Every player's collection is keyed to their wallet address |
| **GEN Marketplace** | List spells for sale in GEN, buy other players' glyphs, atomic ownership transfer |
| **Balance System** | `deposit()` / `withdraw()` / `contract_balance()` for WagerDuel consistency |

---

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | **Landing** | Hero, feature overview, CTA to enter the game |
| `/play` | **The Forge** | Select tier, write intent, forge spell — gacha rarity determines quality |
| `/grimoire` | **Your Grimoire** | View collected spells, rate stars, list on market |
| `/market` | **Glyph Market** | Browse all listings, buy spells with native GEN |
| `/battle` | **Battle Arenas** | Create/join PvP arenas, view battle history, filter by status |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start v1 (React 19, SSR-capable, file-based routing) |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 + semantic design tokens |
| Smart Contract | GenLayer Intelligent Contract — Python |
| Consensus | `run_nondet_unsafe` with custom validators — identity + vote equivalence principles |
| SDK | [`genlayer-js`](https://github.com/genlayerlabs/genlayer-js) — Studionet client + MetaMask Snap |
| Wallet | MetaMask via GenLayer Snap |
| Currency | Native GEN — deposits, stakes, and payments in wei (1 GEN = 1e18 wei) |
| Storage | Contract state (JSON dict — no `allow_storage` / dataclass) |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [MetaMask](https://metamask.io/) browser extension
- Studionet GEN tokens (use the [Studio faucet](https://studio.genlayer.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/dhozil/glyphwright-v2.git
cd glyphwright-v2

# Install dependencies
npm install --legacy-peer-deps

# Set the contract address (optional — FALLBACK_CONTRACT is used if not set)
echo "VITE_GLYPHWRIGHT_CONTRACT=0x74C5fc65b9c553Eb40137f17cE483e4f9c7d16f5" > .env

# Start development server
npm run dev
```

Open [http://localhost:8080](http://localhost:8080)

### Connect & Play

1. Click **Connect Wallet** in the header
2. MetaMask will prompt to install the GenLayer Snap and switch to Studionet
3. Ensure your account has Studionet GEN — use the Studio faucet if needed
4. Head to `/play`, select a tier, and forge your first spell

### Deployment

```bash
# Deploy to Studionet
genlayer deploy --contract contracts/glyphwright_v2.py

# Update .env with the new contract address
echo "VITE_GLYPHWRIGHT_CONTRACT=<your-contract-address>" > .env
```

---

## Project Structure

```
contracts/
└── glyphwright_v2.py           # Forge tiers, battles, star ratings

src/
├── components/glyph/
│   ├── AppHeader.tsx            # Nav, wallet, GEN balance
│   ├── SpellCard.tsx            # Spell display with rarity ring
│   ├── ArenaCard.tsx            # Battle arena with element gradient
│   ├── StarRating.tsx           # Star rating display
│   └── TierSelector.tsx         # Forge tier selection
├── lib/
│   ├── glyphwright.contract.ts  # GenLayer bridge (read/write)
│   ├── wallet.tsx               # Wallet context + deposit/withdraw
│   └── genlayer-chain.ts        # Studionet chain config
└── routes/
    ├── index.tsx                # Landing
    ├── _app.play.tsx            # The Forge
    ├── _app.grimoire.tsx        # Your Grimoire
    ├── _app.market.tsx          # Glyph Market
    └── _app.battle.tsx          # Battle Arenas
```

---

## Roadmap

- [ ] Seasonal leaderboards — most-forged, rarest spell, biggest sale
- [ ] Spell fusion — combine two grimoire spells into a new hybrid
- [ ] Testnet deployment — deploy to Bradbury/Asimov for real ETH withdrawals
- [ ] AI-generated spell sigils — image generation gated by rarity

---

## License

MIT — fork it, remix it, forge stranger spells.
