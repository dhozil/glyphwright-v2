# Glyphwright V2 - Implementation Plan

## Overview
Upgrade Glyphwright to V2 with:
1. **Paid Forge System** with 3 tiers (Standard, Epic, Legendary)
2. **Battle PvP System** with flexible staking and AI consensus
3. **Spell Star Rating System** based on battle wins

---

## 1. Smart Contract V2 Changes

### 1.1 New Storage Fields

```python
class Glyphwright(gl.Contract):
    # Existing storage
    spells: TreeMap[str, str]
    grimoire: TreeMap[str, str]
    listings: TreeMap[str, str]
    spell_to_listing: TreeMap[str, str]
    last_forge: TreeMap[str, str]
    next_spell_id: bigint
    next_listing_id: bigint
    
    # NEW V2 storage
    arenas: TreeMap[str, str]           # arena_id -> JSON arena data
    next_arena_id: bigint
    spell_wins: TreeMap[str, bigint]    # spell_id -> win count
    spell_losses: TreeMap[str, bigint]  # spell_id -> loss count
    platform_fee_bp: bigint             # 500 = 5%
```

### 1.2 Forge Tier System

#### Tier Configuration
```python
FORGE_TIERS = {
    "standard": {
        "cost_wei": 100000000000000000,  # 0.1 GEN
        "rarity_weights": {
            "common": 60,
            "uncommon": 30,
            "rare": 10,
            "epic": 0,
            "legendary": 0,
        },
        "approval_threshold_bp": 6000,  # 60%
    },
    "epic": {
        "cost_wei": 1000000000000000000,  # 1 GEN
        "rarity_weights": {
            "common": 0,
            "uncommon": 40,
            "rare": 40,
            "epic": 20,
            "legendary": 0,
        },
        "approval_threshold_bp": 5000,  # 50%
    },
    "legendary": {
        "cost_wei": 5000000000000000000,  # 5 GEN
        "rarity_weights": {
            "common": 0,
            "uncommon": 0,
            "rare": 30,
            "epic": 40,
            "legendary": 30,
        },
        "approval_threshold_bp": 4000,  # 40%
    },
}
```

#### New forge_spell Function
```python
@gl.public.write.payable
def forge_spell(self, intent: str, tier: str) -> str:
    # Validate tier
    if tier not in FORGE_TIERS:
        raise gl.vm.UserError("invalid tier: must be standard, epic, or legendary")
    
    # Validate payment
    required = FORGE_TIERS[tier]["cost_wei"]
    if int(gl.message.value) < required:
        raise gl.vm.UserError(f"insufficient payment: need {required} wei")
    
    # ... rest of forge logic with tier-specific gacha
```

### 1.3 Element Advantage System (Wheel of Elements)

```python
# 9-element wheel: each element beats the next 3 elements
ELEMENT_ADVANTAGE = {
    "fire": ["nature", "earth", "air"],
    "water": ["fire", "earth", "void"],
    "earth": ["air", "fire", "light"],
    "air": ["water", "nature", "shadow"],
    "shadow": ["light", "arcane", "void"],
    "light": ["dark", "arcane", "nature"],  # Note: shadow = dark
    "arcane": ["fire", "water", "earth"],
    "nature": ["water", "earth", "air"],
    "void": ["fire", "air", "shadow"],
}
```

### 1.4 Battle PvP System

#### Arena Data Structure
```python
@allow_storage
@dataclass
class Arena:
    id: str
    creator: str
    creator_spell_id: str
    stake_wei: u256
    status: str  # "waiting", "active", "completed"
    challenger: str
    challenger_spell_id: str
    winner: str
    created_at: int
    resolved_at: int
```

#### Battle Resolution Logic
```python
def _calculate_battle_score(spell: dict, opponent_element: str) -> int:
    """Calculate battle score based on spell stats and element advantage."""
    base_score = spell["consensus"]["power"]
    
    # Element advantage bonus (30% power boost)
    spell_element = spell["consensus"]["element"]
    if spell_element in ELEMENT_ADVANTAGE:
        if opponent_element in ELEMENT_ADVANTAGE[spell_element]:
            base_score = int(base_score * 1.3)
    
    # Star rating bonus (10% per star)
    spell_id = spell["id"]
    wins = int(self.spell_wins.get(spell_id, "0"))
    stars = min(wins, 5)
    base_score = int(base_score * (1 + stars * 0.1))
    
    return base_score
```

#### Battle Resolution Function
```python
def _resolve_battle(self, arena_id: str) -> None:
    """Resolve battle using AI consensus."""
    arena_json = self.arenas.get(arena_id, "")
    arena = json.loads(arena_json)
    
    creator_spell = json.loads(self.spells.get(arena["creator_spell_id"], "{}"))
    challenger_spell = json.loads(self.spells.get(arena["challenger_spell_id"], "{}"))
    
    # AI judges the battle
    prompt = f"""Judge this spell duel between twoGlyphwright spells:
    
    Spell A (Creator): {creator_spell['spellName']}
    - Element: {creator_spell['consensus']['element']}
    - Power: {creator_spell['consensus']['power']}
    - Mana: {creator_spell['consensus']['mana_cost']}
    - Incantation: "{creator_spell['incantation']}"
    
    Spell B (Challenger): {challenger_spell['spellName']}
    - Element: {challenger_spell['consensus']['element']}
    - Power: {challenger_spell['consensus']['power']}
    - Mana: {challenger_spell['consensus']['mana_cost']}
    - Incantation: "{challenger_spell['incantation']}"
    
    Consider:
    1. Raw power comparison
    2. Element advantage (wheel system)
    3. Mana efficiency
    4. Narrative quality of incantations
    
    Return JSON: {{"winner": "A" or "B", "reasoning": "...", "score_a": int, "score_b": int}}
    """
    
    # Use prompt_comparative for consensus
    def judge():
        return gl.nondet.exec_prompt(prompt, response_format="json")
    
    raw = gl.eq_principle.prompt_comparative(
        judge,
        "Both outputs must agree on the winner (A or B) and provide similar scores within 20% tolerance."
    )
    
    result = json.loads(raw)
    winner = result.get("winner", "A")
    
    # Update win/loss counts
    if winner == "A":
        winner_id = arena["creator_spell_id"]
        loser_id = arena["challenger_spell_id"]
    else:
        winner_id = arena["challenger_spell_id"]
        loser_id = arena["creator_spell_id"]
    
    self.spell_wins[winner_id] = str(int(self.spell_wins.get(winner_id, "0")) + 1)
    self.spell_losses[loser_id] = str(int(self.spell_losses.get(loser_id, "0")) + 1)
    
    # Distribute prize
    stake = int(arena["stake_wei"])
    fee = (stake * int(self.platform_fee_bp)) // 10000
    prize = stake * 2 - fee  # Total pot minus fee
    
    arena["winner"] = winner_id
    arena["status"] = "completed"
    arena["resolved_at"] = _now_ts()
    self.arenas[arena_id] = json.dumps(arena)
    
    # Transfer prize to winner
    _Recipient(Address(arena["winner"])).emit_transfer(value=u256(prize))
```

### 1.5 Star Rating System

```python
@gl.public.view
def get_spell_stats(self, spell_id: str) -> str:
    """Get spell win/loss record and star rating."""
    wins = int(self.spell_wins.get(spell_id, "0"))
    losses = int(self.spell_losses.get(spell_id, "0"))
    stars = min(wins, 5)
    
    return json.dumps({
        "spell_id": spell_id,
        "wins": wins,
        "losses": losses,
        "stars": stars,
        "win_rate": round(wins / max(wins + losses, 1) * 100, 1),
    })
```

---

## 2. Frontend V2 Changes

### 2.1 New Pages

| Route | File | Purpose |
|-------|------|---------|
| `/battle` | `_app.battle.tsx` | Battle arena: create, join, view active battles |
| `/battle/:id` | `_app.battle.$id.tsx` | Individual battle view with live status |

### 2.2 Updated Components

#### Forge Tier Selector
```tsx
// New component: TierSelector.tsx
const tiers = [
  { id: "standard", name: "Standard", cost: "0.1 GEN", color: "zinc" },
  { id: "epic", name: "Epic", cost: "1 GEN", color: "purple" },
  { id: "legendary", name: "Legendary", cost: "5 GEN", color: "amber" },
];
```

#### Battle Arena Card
```tsx
// New component: ArenaCard.tsx
interface Arena {
  id: string;
  creator: string;
  creator_spell: Spell;
  stake: bigint;
  status: "waiting" | "active" | "completed";
  winner?: string;
}
```

#### Star Rating Display
```tsx
// Updated SpellCard.tsx
function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} filled={i <= stars} className="text-amber-400" />
      ))}
    </div>
  );
}
```

### 2.3 Updated Pages

#### Forge Page (`/play`)
- Add tier selector before intent input
- Show tier-specific pricing and gacha rates
- Display tier badge on forged spell

#### Grimoire Page (`/grimoire`)
- Add star rating to spell cards
- Show win/loss record
- Filter by star rating

#### Market Page (`/market`)
- Show star rating and win record
- Price suggestions based on stars

---

## 3. Implementation Order

### Phase 1: Smart Contract V2
1. [ ] Add new storage fields (arenas, spell_wins, spell_losses, platform_fee_bp)
2. [ ] Implement forge tier system with gacha weights
3. [ ] Implement element advantage wheel
4. [ ] Implement battle arena creation and joining
5. [ ] Implement battle resolution with AI consensus
6. [ ] Implement star rating tracking

### Phase 2: Frontend V2
1. [ ] Create TierSelector component
2. [ ] Update Forge page with tier selection
3. [ ] Create ArenaCard component
4. [ ] Create Battle page (`/battle`)
5. [ ] Update SpellCard with star ratings
6. [ ] Update Grimoire page with win/loss stats
7. [ ] Update Market page with star-based pricing

### Phase 3: Testing & Polish
1. [ ] Test forge tiers with different payments
2. [ ] Test battle creation and resolution
3. [ ] Test element advantage calculations
4. [ ] Test star rating updates
5. [ ] Polish UI animations and transitions

---

## 4. Game Balance Notes

### Forge Tier Balance
- **Standard**: Low cost, high rejection rate, mostly common spells
- **Epic**: Medium cost, medium rejection rate, uncommon-rare spells
- **Legendary**: High cost, low rejection rate, rare-legendary spells

### Battle Balance
- Element advantage: 30% power boost (significant but not overwhelming)
- Star bonus: 10% per star (max 50% bonus for 5-star spells)
- Platform fee: 5% (low enough to encourage play)

### Economy
- Players can earn GEN by:
  - Winning battles (95% of opponent's stake)
  - Selling high-star spells on market
- GEN sinks:
  - Forge fees
  - Battle stakes
  - Platform fees
