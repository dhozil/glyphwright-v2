# Glyphwright — GenLayer Intelligent Contracts

This directory holds the on-chain game logic.

| File | Purpose |
|---|---|
| `glyphwright_v2.py` | Forge tiers, battle PvP, star ratings, element wheel, balance system |

---

## V2 Public Methods

### Reads (free)
| Method | Returns |
|---|---|
| `get_spell(spell_id)` | Full spell dict (name, incantation, power, element, rarity, stars, owner) |
| `get_spells_by_owner(owner)` | List of all spells owned by wallet |
| `get_active_listings()` | All marketplace listings |
| `get_listing(listing_id)` | Single listing dict |
| `get_active_arenas()` | All non-settled battle arenas with full spell data |
| `get_player_arenas(player)` | Arenas where player has a spell (with spell data + stars) |
| `get_arena(arena_id)` | Single arena dict |
| `contract_balance()` | Total contract balance in wei |
| `get_balance(addr)` | Player's on-chain deposit balance in wei |
| `get_spell_wins(spell_id)` | Number of battle wins for a spell |
| `get_spell_losses(spell_id)` | Number of battle losses for a spell |

### Writes (consensus)
| Method | Description |
|---|---|
| `deposit()` | Deposit GEN into contract balance (payable) |
| `withdraw(amount)` | Withdraw from on-chain balance to wallet |
| `forge_spell(intent, tier)` | Forge a spell in chosen tier (standard/epic/legendary). Payable — costs tier fee. Uses `run_nondet_unsafe` for LLM generation. All spells always FORGED. |
| `create_arena(spell_id, stake)` | Create a PvP battle arena (deducts stake from balance) |
| `join_arena(arena_id, spell_id)` | Join an existing arena with a spell (deducts stake from balance) |
| `resolve_battle(arena_id)` | AI-judged battle: 6-criteria score-based winner, 5% fee to owner |
| `list_spell(spell_id, price)` | List spell for sale in GEN |
| `delist_spell(listing_id)` | Remove listing |
| `buy_listing(listing_id)` | Buy spell — atomic ownership transfer + payment |
| `set_spell_stars(spell_id, stars)` | Rate a spell 1-5 stars |
| `withdraw_fees()` | Owner-only: withdraw accumulated platform fees |

---

## V2 Design Decisions

### All spells always FORGED
No approval threshold — gacha rarity determines quality via tier-based probability weights:
- **Standard (1 GEN)**: common 60%, uncommon 30%, rare 10%, PWR 60-75
- **Epic (2.5 GEN)**: uncommon 40%, rare 40%, epic 20%, PWR 76-89
- **Legendary (5 GEN)**: rare 30%, epic 40%, legendary 30%, PWR 90-99

### Battle winner = total score
Six weighted criteria determine the winner (NOT AI verdict alone):
- Raw Power: 30%
- Element Advantage: 20% (wheel of 9 elements, each beats next 3)
- Mana Efficiency: 15%
- Star Rating: 15%
- Rarity Bonus: 10%
- Narrative Quality: 10%

### Balance system
All battle stakes and marketplace payments use a deposit/withdraw balance model:
- `deposit()` — payable, adds to player's on-chain balance
- `withdraw(amount)` — transfers from balance to wallet
- Arena creation/joining deducts from balance, not `gl.message.value`
- Marketplace still uses direct `gl.message.value` for simplicity

### Storage
- JSON dict (no `allow_storage` / `dataclass` — not supported in pinned runner)
- `TreeMap[str, str]` for spells, listings, arenas, balances, spell_wins, spell_losses
- `TreeMap[str, bigint]` for numeric maps (requires `int` assignment, not `str`)

### Events
- `ArenaCreatedEvent(arena_id, creator, stake_wei)`
- `BattleResolvedEvent(arena_id, winner)`
- `WithdrawalEvent(addr, amount)`
- `FeesWithdrawnEvent(addr, amount)`

---

## Deploy

```bash
# Studionet (chainId 61999 / 0xF23F, https://studio.genlayer.com)
genlayer network studionet
genlayer deploy --contract contracts/glyphwright_v2.py
```

Take the returned contract address and expose it to the frontend:

```bash
# .env
VITE_GLYPHWRIGHT_CONTRACT=0x74C5fc65b9c553Eb40137f17cE483e4f9c7d16f5
```

---

## Integration Tests

Run the full test suite:

```bash
cd tests/integration
python -m pytest test_glyphwright_v2.py -v
```

13 tests covering: BalanceSystem, ForgeStandard, ForgeEpic, ForgeLegendary, ArenaCreateJoin, ViewMethods, OwnerGuards, BattleLifecycle.
