# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json
from datetime import datetime, timezone



# ---------- Constants --------------------------------------------------------

VALIDATORS = [
    (
        "Pyromancer Ignis",
        "a fire-obsessed archmage who evaluates bold, aggressive, destructive "
        "spells highly and rates passive or healing magic lower",
    ),
    (
        "Verdant Sage Liora",
        "a nature druid who values harmony, healing, growth and elemental "
        "balance, and rates cruel or wasteful spells lower",
    ),
    (
        "Voidcaller Nyx",
        "a shadow sorcerer who values cunning, illusion, fear and forbidden "
        "knowledge, and rates generic spells with no twist lower",
    ),
    (
        "Runesmith Borr",
        "a dwarven runesmith who evaluates spells by craft: clear intent, "
        "logical mechanics; rates vague or contradictory spells lower",
    ),
    (
        "Oracle Sephielle",
        "a celestial oracle who weighs narrative beauty, originality and how "
        "memorable the spell would be in legend; generic spells rate lower",
    ),
]

ELEMENTS = ["fire", "water", "earth", "air", "shadow",
            "light", "arcane", "nature", "void"]
RARITIES = ["common", "uncommon", "rare", "epic", "legendary"]

MAX_INTENT_LEN = 400
MAX_SPELL_NAME_LEN = 60
MAX_INCANTATION_LEN = 80
MAX_DESCRIPTION_LEN = 300
MAX_REASONING_LEN = 220

# ---------- V2 Constants -----------------------------------------------------

# Forge tier configuration
FORGE_TIERS = {
    "standard": {
        "cost_wei": 1_000_000_000_000_000_000,  # 1 GEN
        "power_min": 60,
        "power_max": 75,
        "rarity_weights": {
            "common": 60,
            "uncommon": 30,
            "rare": 10,
            "epic": 0,
            "legendary": 0,
        },
    },
    "epic": {
        "cost_wei": 2_500_000_000_000_000_000,  # 2.5 GEN
        "power_min": 76,
        "power_max": 89,
        "rarity_weights": {
            "common": 0,
            "uncommon": 40,
            "rare": 40,
            "epic": 20,
            "legendary": 0,
        },
    },
    "legendary": {
        "cost_wei": 5_000_000_000_000_000_000,  # 5 GEN
        "power_min": 90,
        "power_max": 99,
        "rarity_weights": {
            "common": 0,
            "uncommon": 0,
            "rare": 30,
            "epic": 40,
            "legendary": 30,
        },
    },
}

# Element advantage wheel: each element beats the next 3 elements in the cycle
ELEMENT_CYCLE = ["fire", "water", "earth", "air", "shadow", "light", "arcane", "nature", "void"]
ELEMENT_ADVANTAGE = {}
for i, elem in enumerate(ELEMENT_CYCLE):
    ELEMENT_ADVANTAGE[elem] = [
        ELEMENT_CYCLE[(i + 1) % 9],
        ELEMENT_CYCLE[(i + 2) % 9],
        ELEMENT_CYCLE[(i + 3) % 9],
    ]

# Battle configuration
PLATFORM_FEE_BP = 500  # 5%
MAX_STARS = 5
ARENA_TIMEOUT_SECONDS = 86400  # 24 hours
BATTLE_EXPIRY_SECONDS = 604800  # 7 days for active battles


# ---------- Events -----------------------------------------------------------

class ArenaCreatedEvent(gl.Event):
    def __init__(self, arena_id: str, creator: Address, stake_wei: int, /, **blob): ...


class BattleResolvedEvent(gl.Event):
    def __init__(self, arena_id: str, winner: Address, /, **blob): ...


class WithdrawalEvent(gl.Event):
    def __init__(self, addr: Address, amount: int, /, **blob): ...


class FeesWithdrawnEvent(gl.Event):
    def __init__(self, addr: Address, amount: int, /, **blob): ...


# ---------- Helper Functions -------------------------------------------------

def _now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        first_nl = s.find("\n")
        if first_nl != -1:
            s = s[first_nl + 1:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def _to_dict(raw):
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        return json.loads(_strip_fences(raw))
    raise ValueError("LLM did not return dict or string")


def _clamp_in(value: str, allowed: list, fallback: str) -> str:
    return value if value in allowed else fallback


def _avg(xs: list) -> int:
    return sum(xs) // len(xs)


def _mode(xs: list) -> str:
    counts = {}
    for x in xs:
        counts[x] = counts.get(x, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _weighted_random(weights: dict, seed: int = 0) -> str:
    """Pick a key based on weights using deterministic selection."""
    items = list(weights.items())
    total = sum(w for _, w in items)
    if total == 0:
        return items[0][0] if items else "common"
    
    # Use a simple hash-based selection for determinism
    r = (seed * 9301 + 49297) % 233280
    r = r % total + 1
    
    cumulative = 0
    for key, weight in items:
        cumulative += weight
        if r <= cumulative:
            return key
    return items[-1][0]


def _parse_score(score_str) -> tuple:
    """Parse a score like '85:72' into (int, int). Returns (0, 0) on failure."""
    if not isinstance(score_str, str):
        return (0, 0)
    parts = score_str.strip().split(":")
    if len(parts) != 2:
        return (0, 0)
    try:
        return (int(parts[0].strip()), int(parts[1].strip()))
    except Exception:
        return (0, 0)


# ---------- Recipient Interface ----------------------------------------------

@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass


# ---------- Main Contract ----------------------------------------------------

class GlyphwrightV2(gl.Contract):
    # V1 storage
    spells: TreeMap[str, str]
    grimoire: TreeMap[str, str]
    listings: TreeMap[str, str]
    spell_to_listing: TreeMap[str, str]
    last_forge: TreeMap[str, str]
    next_spell_id: bigint
    next_listing_id: bigint

    # V2 storage
    arenas: TreeMap[str, str]
    next_arena_id: bigint
    spell_wins: TreeMap[str, bigint]
    spell_losses: TreeMap[str, bigint]
    platform_fee_bp: bigint
    
    # V2.1 storage - Security improvements
    owner: Address
    accumulated_fees: bigint  # Track accumulated platform fees
    balances: TreeMap[str, str]  # address -> balance in wei (on-chain balance system)

    def __init__(self):
        self.platform_fee_bp = PLATFORM_FEE_BP
        self.owner = gl.message.sender_address
        self.accumulated_fees = 0

    # ========== Admin Methods ================================================

    @gl.public.write
    def withdraw_fees(self) -> None:
        """Owner can withdraw accumulated platform fees."""
        sender = str(gl.message.sender_address).lower()
        if sender != str(self.owner).lower():
            raise gl.vm.UserError("only owner can withdraw fees")
        
        fees = int(self.accumulated_fees)
        if fees <= 0:
            raise gl.vm.UserError("no fees to withdraw")
        
        # Reset fees before transfer (reentrancy guard)
        self.accumulated_fees = 0
        
        _Recipient(Address(self.owner)).emit_transfer(value=u256(fees))
        FeesWithdrawnEvent(self.owner, fees).emit()

    @gl.public.view
    def get_accumulated_fees(self) -> str:
        """View accumulated platform fees."""
        fees = int(self.accumulated_fees)
        gen_whole = fees // 1000000000000000000
        gen_frac = fees % 1000000000000000000
        return json.dumps({
            "fees_wei": str(fees),
            "fees_gen": f"{gen_whole}.{gen_frac:018d}",
        })

    # ========== Balance Methods ==============================================

    @gl.public.write.payable
    def deposit(self) -> None:
        """Add GEN to caller's on-chain balance."""
        if gl.message.value <= 0:
            raise gl.vm.UserError("deposit must be greater than 0")
        sender = str(gl.message.sender_address).lower()
        current = int(self.balances.get(sender, "0"))
        self.balances[sender] = str(current + int(gl.message.value))

    @gl.public.write
    def withdraw(self, amount: int) -> None:
        """Withdraw GEN from caller's on-chain balance back to wallet."""
        if amount <= 0:
            raise gl.vm.UserError("withdraw amount must be greater than 0")
        sender = str(gl.message.sender_address).lower()
        current = int(self.balances.get(sender, "0"))
        if current < amount:
            raise gl.vm.UserError("insufficient balance")
        self.balances[sender] = str(current - amount)
        _Recipient(gl.message.sender_address).emit_transfer(value=u256(amount))
        WithdrawalEvent(gl.message.sender_address, amount).emit()

    @gl.public.view
    def get_balance(self, addr: str) -> str:
        """View a player's on-chain balance."""
        bal = int(self.balances.get(addr.lower(), "0"))
        gen_whole = bal // 1000000000000000000
        gen_frac = bal % 1000000000000000000
        return json.dumps({
            "balance_wei": str(bal),
            "balance_gen": f"{gen_whole}.{gen_frac:018d}",
        })

    # ========== V1 View Methods =============================================

    @gl.public.view
    def get_spell(self, spell_id: str) -> str:
        return self.spells.get(spell_id, "")

    @gl.public.view
    def get_spells_by_owner(self, owner: str) -> str:
        ids_json = self.grimoire.get(owner.lower(), "[]")
        try:
            ids = json.loads(ids_json)
        except Exception:
            ids = []
        out = []
        for sid in ids:
            sp = self.spells.get(sid, "")
            if sp:
                try:
                    spell_data = json.loads(sp)
                    # Attach star rating
                    wins = int(self.spell_wins.get(sid, "0"))
                    losses = int(self.spell_losses.get(sid, "0"))
                    spell_data["stars"] = min(wins, MAX_STARS)
                    spell_data["wins"] = wins
                    spell_data["losses"] = losses
                    out.append(spell_data)
                except Exception:
                    pass
        return json.dumps(out)

    @gl.public.view
    def get_active_listings(self) -> str:
        out = []
        for lid in self.listings:
            l_json = self.listings[lid]
            try:
                l = json.loads(l_json)
            except Exception:
                continue
            spell_id = l.get("spell_id", "")
            sp_json = self.spells.get(spell_id, "")
            if not sp_json:
                continue
            try:
                l["spell"] = json.loads(sp_json)
                # Attach star rating
                wins = int(self.spell_wins.get(spell_id, "0"))
                losses = int(self.spell_losses.get(spell_id, "0"))
                l["spell"]["stars"] = min(wins, MAX_STARS)
                l["spell"]["wins"] = wins
                l["spell"]["losses"] = losses
            except Exception:
                continue
            out.append(l)
        return json.dumps(out)

    @gl.public.view
    def get_listing(self, listing_id: str) -> str:
        l_json = self.listings.get(listing_id, "")
        if not l_json:
            return ""
        try:
            l = json.loads(l_json)
        except Exception:
            return ""
        spell_id = l.get("spell_id", "")
        sp_json = self.spells.get(spell_id, "")
        if sp_json:
            try:
                l["spell"] = json.loads(sp_json)
                # Attach star rating
                wins = int(self.spell_wins.get(spell_id, "0"))
                losses = int(self.spell_losses.get(spell_id, "0"))
                l["spell"]["stars"] = min(wins, MAX_STARS)
                l["spell"]["wins"] = wins
                l["spell"]["losses"] = losses
            except Exception:
                l["spell"] = {}
        else:
            l["spell"] = {}
        return json.dumps(l)

    @gl.public.view
    def get_last_forge(self, owner: str) -> str:
        return self.last_forge.get(owner.lower(), "")

    # ========== V2 View Methods =============================================

    @gl.public.view
    def get_spell_stats(self, spell_id: str) -> str:
        """Get spell win/loss record and star rating."""
        wins = int(self.spell_wins.get(spell_id, "0"))
        losses = int(self.spell_losses.get(spell_id, "0"))
        stars = min(wins, MAX_STARS)

        return json.dumps({
            "spell_id": spell_id,
            "wins": wins,
            "losses": losses,
            "stars": stars,
            "win_rate": (wins * 1000) // max(wins + losses, 1),  # x10 for 1 decimal
        })

    @gl.public.view
    def get_all_arenas(self) -> str:
        """Get all arenas regardless of status."""
        out = []
        for aid in self.arenas:
            a_json = self.arenas[aid]
            try:
                arena = json.loads(a_json)
            except Exception:
                continue
            # Attach creator spell data
            spell_id = arena.get("creator_spell_id", "")
            sp_json = self.spells.get(spell_id, "")
            if sp_json:
                try:
                    spell_data = json.loads(sp_json)
                    wins = int(self.spell_wins.get(spell_id, "0"))
                    spell_data["stars"] = min(wins, MAX_STARS)
                    arena["creator_spell"] = spell_data
                except Exception:
                    arena["creator_spell"] = {}
            # Attach challenger spell data
            challenger_spell_id = arena.get("challenger_spell_id", "")
            if challenger_spell_id:
                csp_json = self.spells.get(challenger_spell_id, "")
                if csp_json:
                    try:
                        spell_data = json.loads(csp_json)
                        wins = int(self.spell_wins.get(challenger_spell_id, "0"))
                        spell_data["stars"] = min(wins, MAX_STARS)
                        arena["challenger_spell"] = spell_data
                    except Exception:
                        arena["challenger_spell"] = {}
            out.append(arena)
        return json.dumps(out)

    @gl.public.view
    def get_active_arenas(self) -> str:
        """Get all arenas waiting for a challenger."""
        out = []
        for aid in self.arenas:
            a_json = self.arenas[aid]
            try:
                arena = json.loads(a_json)
            except Exception:
                continue
            if arena.get("status") == "waiting":
                # Attach creator spell data with full evidence
                spell_id = arena.get("creator_spell_id", "")
                sp_json = self.spells.get(spell_id, "")
                if sp_json:
                    try:
                        spell_data = json.loads(sp_json)
                        wins = int(self.spell_wins.get(spell_id, "0"))
                        spell_data["stars"] = min(wins, MAX_STARS)
                        # Attach full spell data as evidence
                        arena["creator_spell"] = spell_data
                    except Exception:
                        arena["creator_spell"] = {}
                out.append(arena)
        return json.dumps(out)

    @gl.public.view
    def get_arena(self, arena_id: str) -> str:
        """Get arena details with spell data."""
        a_json = self.arenas.get(arena_id, "")
        if not a_json:
            return ""
        try:
            arena = json.loads(a_json)
        except Exception:
            return ""

        # Attach full spell data as evidence for both sides
        for key in ["creator_spell_id", "challenger_spell_id"]:
            spell_id = arena.get(key, "")
            if spell_id:
                sp_json = self.spells.get(spell_id, "")
                if sp_json:
                    try:
                        spell_data = json.loads(sp_json)
                        wins = int(self.spell_wins.get(spell_id, "0"))
                        spell_data["stars"] = min(wins, MAX_STARS)
                        # Store full spell data as evidence
                        arena[key.replace("_id", "")] = spell_data
                    except Exception:
                        pass

        return json.dumps(arena)

    @gl.public.view
    def get_player_arenas(self, player: str) -> str:
        """Get all arenas for a player."""
        player = player.lower()
        out = []
        for aid in self.arenas:
            a_json = self.arenas[aid]
            try:
                arena = json.loads(a_json)
            except Exception:
                continue
            if (arena.get("creator", "").lower() == player or
                    arena.get("challenger", "").lower() == player):
                # Attach creator spell data with stars
                creator_spell_id = arena.get("creator_spell_id", "")
                creator_sp_json = self.spells.get(creator_spell_id, "")
                if creator_sp_json:
                    try:
                        spell_data = json.loads(creator_sp_json)
                        wins = int(self.spell_wins.get(creator_spell_id, "0"))
                        spell_data["stars"] = min(wins, MAX_STARS)
                        arena["creator_spell"] = spell_data
                    except Exception:
                        arena["creator_spell"] = {}
                # Attach challenger spell data with stars
                challenger_spell_id = arena.get("challenger_spell_id", "")
                if challenger_spell_id:
                    challenger_sp_json = self.spells.get(challenger_spell_id, "")
                    if challenger_sp_json:
                        try:
                            spell_data = json.loads(challenger_sp_json)
                            wins = int(self.spell_wins.get(challenger_spell_id, "0"))
                            spell_data["stars"] = min(wins, MAX_STARS)
                            arena["challenger_spell"] = spell_data
                        except Exception:
                            arena["challenger_spell"] = {}
                out.append(arena)
        return json.dumps(out)

    @gl.public.view
    def get_element_advantage(self, element: str) -> str:
        """Return which elements the given element beats."""
        advantages = ELEMENT_ADVANTAGE.get(element.lower(), [])
        return json.dumps({"element": element, "beats": advantages})

    # ========== V1 Write Methods ============================================

    @gl.public.write.payable
    def forge_spell(self, intent: str) -> str:
        """Forge a spell using the standard tier (backward compatible)."""
        return self._forge_spell_internal(intent, "standard")

    @gl.public.write.payable
    def forge_spell_tier(self, intent: str, tier: str) -> str:
        """Forge a spell with a specific tier (V2)."""
        return self._forge_spell_internal(intent, tier)

    def _forge_spell_internal(self, intent: str, tier: str) -> str:
        """Internal forge logic with tier support."""
        intent = (intent or "").strip()
        if not (5 <= len(intent) <= MAX_INTENT_LEN):
            raise gl.vm.UserError(
                f"intent must be 5..{MAX_INTENT_LEN} chars"
            )

        # Validate tier
        if tier not in FORGE_TIERS:
            raise gl.vm.UserError(
                f"invalid tier: must be one of {list(FORGE_TIERS.keys())}"
            )

        # Check payment for all tiers (including standard)
        tier_config = FORGE_TIERS[tier]
        required_wei = tier_config["cost_wei"]
        sent_wei = int(gl.message.value)

        if sent_wei < required_wei:
            raise gl.vm.UserError(
                f"insufficient payment: need {required_wei} wei for {tier} tier"
            )

        sender = str(gl.message.sender_address).lower()

        validators_block = "\n".join(
            f'  - {name}: {persona}' for name, persona in VALIDATORS
        )

        # Tier-specific prompt modifications
        tier_bonus = ""
        if tier == "standard":
            tier_bonus = f"\nThis is a STANDARD tier forge. Expected power range: {tier_config['power_min']}-{tier_config['power_max']}."
        elif tier == "epic":
            tier_bonus = f"\nThis is an EPIC tier forge. The spell should be more powerful and unique. Expected power range: {tier_config['power_min']}-{tier_config['power_max']}."
        elif tier == "legendary":
            tier_bonus = f"\nThis is a LEGENDARY tier forge. The spell should be exceptionally powerful, memorable, and worthy of legend. Expected power range: {tier_config['power_min']}-{tier_config['power_max']}."

        prompt = (
            f'You are the Glyphwright council forging a spell.\n'
            f'\nA player wants to craft this spell (Tier: {tier.upper()}):\n'
            f'  "{intent}"\n'
            f'{tier_bonus}\n'
            f'\nFirst, invent a memorable identity for this spell:\n'
            f'  - spellName: 2-4 words, evocative, NOT generic\n'
            f'  - incantation: 3-6 word latin/arcane phrase\n'
            f'  - description: 1-2 vivid sentences describing the cast\n'
            f'\nThen, have each of these 5 validators evaluate the spell\n'
            f'from THEIR perspective and assign stats:\n'
            f'{validators_block}\n'
            f'\nFor each validator return:\n'
            f'  - power: int {tier_config["power_min"]}-{tier_config["power_max"]}\n'
            f'  - mana_cost: int 1..100\n'
            f'  - element: one of {ELEMENTS}\n'
            f'  - rarity: one of {RARITIES}\n'
            f'  - reasoning: <= 220 chars, in that validator\'s voice\n'
            f'\nReturn ONLY valid JSON in this exact shape:\n'
            f'{{"spellName": str,\n'
            f' "incantation": str,\n'
            f' "description": str,\n'
            f' "votes": [\n'
            f'   {{"validator": "Pyromancer Ignis", "power": int, "mana_cost": int,\n'
            f'    "element": str, "rarity": str, "reasoning": str}},\n'
            f'   ... one entry per validator above, in the same order ...\n'
            f' ]\n'
            f'}}'
        )

        def leader_fn():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.calldata)
            except Exception:
                return False
            if not isinstance(data, dict):
                return False
            if not all(k in data for k in ("spellName", "incantation", "description", "votes")):
                return False
            votes = data.get("votes", [])
            if not isinstance(votes, list) or len(votes) < 3:
                return False
            for v in votes:
                if not isinstance(v, dict):
                    return False
                if not all(k in v for k in ("validator", "power", "element", "rarity")):
                    return False
                if v.get("element") not in ELEMENTS:
                    return False
                if v.get("rarity") not in RARITIES:
                    return False
            return True

        raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        d = _to_dict(raw)

        spell_name = str(d.get("spellName", ""))[:MAX_SPELL_NAME_LEN]
        incantation = str(d.get("incantation", ""))[:MAX_INCANTATION_LEN]
        description = str(d.get("description", ""))[:MAX_DESCRIPTION_LEN]

        raw_votes = d.get("votes", [])
        if not isinstance(raw_votes, list):
            raw_votes = []

        votes_data = []
        for i in range(len(VALIDATORS)):
            vname = VALIDATORS[i][0]
            v = raw_votes[i] if i < len(raw_votes) and isinstance(raw_votes[i], dict) else {}
            votes_data.append({
                "validator": vname,
                "power":     max(tier_config["power_min"], min(tier_config["power_max"], int(v.get("power", tier_config["power_min"]) or tier_config["power_min"]))),
                "mana_cost": max(1, min(100, int(v.get("mana_cost", 50) or 50))),
                "element":   _clamp_in(str(v.get("element", "arcane")), ELEMENTS, "arcane"),
                "rarity":    _clamp_in(str(v.get("rarity", "common")), RARITIES, "common"),
                "reasoning": str(v.get("reasoning", ""))[:MAX_REASONING_LEN],
            })

        # All spells are always FORGED — gacha rarity determines quality
        forged_at = _now_ts()
        seed = forged_at + int.from_bytes(sender.encode(), "big") % 1000000
        gacha_rarity = _weighted_random(tier_config["rarity_weights"], seed)
        for v in votes_data:
            v["rarity"] = gacha_rarity

        consensus = {
            "power":     _avg([v["power"] for v in votes_data]),
            "mana_cost": _avg([v["mana_cost"] for v in votes_data]),
            "element":   _mode([v["element"] for v in votes_data]),
            "rarity":    gacha_rarity,
            "approval":  100,
            "verdict":   "FORGED",
            "tier":      tier,
        }

        spell_id = "spell-" + str(int(self.next_spell_id))
        self.next_spell_id = self.next_spell_id + 1

        spell_obj = {
            "id":          spell_id,
            "owner":       sender,
            "forged_at":   forged_at,
            "tier":        tier,
            "spellName":   spell_name,
            "incantation": incantation,
            "description": description,
            "intent":      intent[:MAX_INTENT_LEN],
            "votes":       votes_data,
            "consensus":   consensus,
            "stars":       0,
            "wins":        0,
            "losses":      0,
        }
        self.spells[spell_id] = json.dumps(spell_obj)

        ids_json = self.grimoire.get(sender, "[]")
        try:
            ids = json.loads(ids_json)
        except Exception:
            ids = []
        ids.append(spell_id)
        self.grimoire[sender] = json.dumps(ids)

        attempt = {
            "spell_id":    spell_id,
            "owner":       sender,
            "forged_at":   forged_at,
            "tier":        tier,
            "intent":      intent[:MAX_INTENT_LEN],
            "spellName":   spell_name,
            "incantation": incantation,
            "description": description,
            "votes":       votes_data,
            "consensus":   consensus,
        }
        self.last_forge[sender] = json.dumps(attempt)

        return json.dumps(attempt)

    @gl.public.view
    def get_forge_tiers(self) -> str:
        """Return forge tier configuration for frontend display."""
        tiers = {}
        for tier_name, config in FORGE_TIERS.items():
            cost = config["cost_wei"]
            gen_whole = cost // 1000000000000000000
            gen_frac = cost % 1000000000000000000
            tiers[tier_name] = {
                "cost_wei": cost,
                "cost_gen": f"{gen_whole}.{gen_frac:018d}",
                "rarity_weights": config["rarity_weights"],
            }
        return json.dumps(tiers)

    # ========== V1 Marketplace Methods ======================================

    @gl.public.write
    def list_spell(self, spell_id: str, price: bigint) -> str:
        if int(price) <= 0:
            raise gl.vm.UserError("price must be > 0")
        sp_json = self.spells.get(spell_id, "")
        if not sp_json:
            raise gl.vm.UserError("spell not found")
        try:
            sp = json.loads(sp_json)
        except Exception:
            raise gl.vm.UserError("spell data corrupted")
        sender = str(gl.message.sender_address).lower()
        if str(sp.get("owner", "")).lower() != sender:
            raise gl.vm.UserError("only the owner may list this spell")
        if self.spell_to_listing.get(spell_id, ""):
            raise gl.vm.UserError("spell already listed")

        lid = "listing-" + str(int(self.next_listing_id))
        self.next_listing_id = self.next_listing_id + 1
        listing_obj = {
            "id":        lid,
            "spell_id":  spell_id,
            "seller":    sender,
            "price":     str(int(price)),
            "listed_at": _now_ts(),
        }
        self.listings[lid] = json.dumps(listing_obj)
        self.spell_to_listing[spell_id] = lid
        return lid

    @gl.public.write
    def delist_spell(self, listing_id: str) -> None:
        l_json = self.listings.get(listing_id, "")
        if not l_json:
            raise gl.vm.UserError("listing not found")
        try:
            l = json.loads(l_json)
        except Exception:
            raise gl.vm.UserError("listing data corrupted")
        sender = str(gl.message.sender_address).lower()
        if str(l.get("seller", "")).lower() != sender:
            raise gl.vm.UserError("only the seller may delist")
        spell_id = l.get("spell_id", "")
        if spell_id and self.spell_to_listing.get(spell_id, ""):
            del self.spell_to_listing[spell_id]
        del self.listings[listing_id]

    @gl.public.write.payable
    def buy_listing(self, listing_id: str) -> None:
        l_json = self.listings.get(listing_id, "")
        if not l_json:
            raise gl.vm.UserError("listing not found")
        try:
            l = json.loads(l_json)
        except Exception:
            raise gl.vm.UserError("listing data corrupted")

        buyer = str(gl.message.sender_address).lower()
        seller = str(l.get("seller", "")).lower()
        spell_id = l.get("spell_id", "")
        if buyer == seller:
            raise gl.vm.UserError("cannot buy your own listing")

        sp_json = self.spells.get(spell_id, "")
        if not sp_json:
            raise gl.vm.UserError("listed spell no longer exists")
        try:
            sp = json.loads(sp_json)
        except Exception:
            raise gl.vm.UserError("spell data corrupted")

        price = int(l.get("price", "0"))
        sent = int(gl.message.value)
        if sent < price:
            raise gl.vm.UserError(
                f"insufficient GEN: sent {sent} wei, need {price} wei"
            )

        seller_ids_json = self.grimoire.get(seller, "[]")
        try:
            seller_ids = json.loads(seller_ids_json)
        except Exception:
            seller_ids = []
        seller_ids = [s for s in seller_ids if s != spell_id]
        self.grimoire[seller] = json.dumps(seller_ids)

        buyer_ids_json = self.grimoire.get(buyer, "[]")
        try:
            buyer_ids = json.loads(buyer_ids_json)
        except Exception:
            buyer_ids = []
        buyer_ids.append(spell_id)
        self.grimoire[buyer] = json.dumps(buyer_ids)

        sp["owner"] = buyer
        self.spells[spell_id] = json.dumps(sp)

        if self.spell_to_listing.get(spell_id, ""):
            del self.spell_to_listing[spell_id]
        del self.listings[listing_id]

        _Recipient(Address(seller)).emit_transfer(value=u256(price))

        refund = sent - price
        if refund > 0:
            _Recipient(Address(buyer)).emit_transfer(value=u256(refund))

    # ========== V2 Battle Methods ===========================================

    @gl.public.write
    def create_arena(self, spell_id: str, stake_wei: int) -> str:
        """Create a battle arena with staked GEN from on-chain balance."""
        # Validate spell exists and is owned by caller
        sp_json = self.spells.get(spell_id, "")
        if not sp_json:
            raise gl.vm.UserError("spell not found")

        try:
            sp = json.loads(sp_json)
        except Exception:
            raise gl.vm.UserError("spell data corrupted")

        sender = str(gl.message.sender_address).lower()
        if sender == str(self.owner).lower():
            raise gl.vm.UserError("contract owner cannot create arenas")
        if str(sp.get("owner", "")).lower() != sender:
            raise gl.vm.UserError("only the spell owner may create an arena")

        # Check stake amount from balance
        if stake_wei <= 0:
            raise gl.vm.UserError("must stake GEN to create an arena")
        current_balance = int(self.balances.get(sender, "0"))
        if current_balance < stake_wei:
            raise gl.vm.UserError("insufficient balance")
        self.balances[sender] = str(current_balance - stake_wei)

        # Create arena
        arena_id = "arena-" + str(int(self.next_arena_id))
        self.next_arena_id = self.next_arena_id + 1

        arena = {
            "id": arena_id,
            "creator": sender,
            "creator_spell_id": spell_id,
            "stake_wei": str(stake_wei),
            "status": "waiting",
            "challenger": "",
            "challenger_spell_id": "",
            "winner": "",
            "created_at": _now_ts(),
            "resolved_at": 0,
            "settled": False,
        }

        self.arenas[arena_id] = json.dumps(arena)

        ArenaCreatedEvent(arena_id, gl.message.sender_address, stake_wei).emit()
        return arena_id

    @gl.public.write
    def join_arena(self, arena_id: str, spell_id: str) -> str:
        """Join an existing battle arena using on-chain balance."""
        # Validate arena exists and is waiting
        a_json = self.arenas.get(arena_id, "")
        if not a_json:
            raise gl.vm.UserError("arena not found")

        try:
            arena = json.loads(a_json)
        except Exception:
            raise gl.vm.UserError("arena data corrupted")

        if arena["status"] != "waiting":
            raise gl.vm.UserError("arena is not waiting for a challenger")

        sender = str(gl.message.sender_address).lower()
        if sender == str(self.owner).lower():
            raise gl.vm.UserError("contract owner cannot join arenas")
        if arena["creator"].lower() == sender:
            raise gl.vm.UserError("cannot battle yourself")

        # Validate spell exists and is owned by challenger
        sp_json = self.spells.get(spell_id, "")
        if not sp_json:
            raise gl.vm.UserError("spell not found")

        try:
            sp = json.loads(sp_json)
        except Exception:
            raise gl.vm.UserError("spell data corrupted")

        if str(sp.get("owner", "")).lower() != sender:
            raise gl.vm.UserError("only the spell owner may join an arena")

        # Check stake matches from balance
        required_stake = int(arena["stake_wei"])
        current_balance = int(self.balances.get(sender, "0"))
        if current_balance < required_stake:
            raise gl.vm.UserError(
                f"insufficient balance: need {required_stake} wei"
            )
        self.balances[sender] = str(current_balance - required_stake)

        # Update arena
        arena["challenger"] = sender
        arena["challenger_spell_id"] = spell_id
        arena["status"] = "active"
        self.arenas[arena_id] = json.dumps(arena)

        # Resolve the battle
        self._resolve_battle(arena_id)

        return arena_id

    def _resolve_battle(self, arena_id: str) -> None:
        """Resolve battle using AI consensus with full evidence fetching."""
        a_json = self.arenas.get(arena_id, "")
        arena = json.loads(a_json)

        # Fetch full spell data as evidence (contract-side fetching)
        creator_spell_json = self.spells.get(arena["creator_spell_id"], "{}")
        challenger_spell_json = self.spells.get(arena["challenger_spell_id"], "{}")
        
        creator_spell = json.loads(creator_spell_json)
        challenger_spell = json.loads(challenger_spell_json)

        # Get star ratings
        creator_stars = min(int(self.spell_wins.get(arena["creator_spell_id"], "0")), MAX_STARS)
        challenger_stars = min(int(self.spell_wins.get(arena["challenger_spell_id"], "0")), MAX_STARS)

        # Validate both spells exist (evidence validation)
        if not creator_spell.get("spellName") or not challenger_spell.get("spellName"):
            raise gl.vm.UserError("invalid spell evidence: missing spell data")

        # AI judges the battle with full evidence
        prompt = f"""Judge this spell duel between two Glyphwright spells.

EVIDENCE - Spell A (Creator - {arena['creator'][:8]}...):
- ID: {arena['creator_spell_id']}
- Name: {creator_spell.get('spellName', 'Unknown')}
- Element: {creator_spell.get('consensus', {}).get('element', 'arcane')}
- Power: {creator_spell.get('consensus', {}).get('power', 50)}
- Mana: {creator_spell.get('consensus', {}).get('mana_cost', 50)}
- Rarity: {creator_spell.get('consensus', {}).get('rarity', 'common')}
- Incantation: "{creator_spell.get('incantation', '')}"
- Description: "{creator_spell.get('description', '')}"
- Stars: {creator_stars}
- Wins: {creator_spell.get('wins', 0)}
- Losses: {creator_spell.get('losses', 0)}

EVIDENCE - Spell B (Challenger - {arena['challenger'][:8]}...):
- ID: {arena['challenger_spell_id']}
- Name: {challenger_spell.get('spellName', 'Unknown')}
- Element: {challenger_spell.get('consensus', {}).get('element', 'arcane')}
- Power: {challenger_spell.get('consensus', {}).get('power', 50)}
- Mana: {challenger_spell.get('consensus', {}).get('mana_cost', 50)}
- Rarity: {challenger_spell.get('consensus', {}).get('rarity', 'common')}
- Incantation: "{challenger_spell.get('incantation', '')}"
- Description: "{challenger_spell.get('description', '')}"
- Stars: {challenger_stars}
- Wins: {challenger_spell.get('wins', 0)}
- Losses: {challenger_spell.get('losses', 0)}

ELEMENT ADVANTAGE RULES (each element beats the next 3 in cycle):
fire > nature, earth, air
water > fire, earth, void
earth > air, fire, light
air > water, nature, shadow
shadow > light, arcane, void
light > shadow, arcane, nature
arcane > fire, water, earth
nature > water, earth, air
void > fire, air, shadow

SCORING CRITERIA:
1. Raw power comparison (30% weight)
2. Element advantage (20% weight) - 30% bonus if element beats opponent's
3. Mana efficiency (15% weight) - power/mana ratio
4. Star rating (15% weight) - 10% bonus per star
5. Rarity bonus (10% weight) - legendary > epic > rare > uncommon > common
6. Narrative quality (10% weight) - incantation and description quality

You MUST:
1. Verify the element advantage using the wheel rules above
2. Calculate scores for both spells using the criteria
3. Determine the winner based on total score
4. Provide detailed reasoning for your verdict

Return JSON: {{"winner": "A" or "B", "reasoning": "...", "score_a": int, "score_b": int, "element_advantage": "A" or "B" or "none"}}
"""

        def leader_fn():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            return json.dumps(result, sort_keys=True)

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.calldata)
            except Exception:
                return False
            if not isinstance(data, dict):
                return False
            if data.get("winner") not in ("A", "B"):
                return False
            if not isinstance(data.get("score_a"), int) or not isinstance(data.get("score_b"), int):
                return False
            return True

        raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        result = _to_dict(raw)
        winner = result.get("winner", "A")
        
        # Validate winner is valid
        if winner not in ["A", "B"]:
            winner = "A"

        # Deterministic score validation
        score_a = int(result.get("score_a", 0))
        score_b = int(result.get("score_b", 0))

        # Store scores and reasoning in arena
        arena["score_a"] = score_a
        arena["score_b"] = score_b
        arena["reasoning"] = result.get("reasoning", "")
        arena["element_advantage"] = result.get("element_advantage", "none")

        if score_a == score_b:
            # Draw - refund both, no winner
            stake = int(arena["stake_wei"])
            arena["winner"] = ""
            arena["status"] = "completed"
            arena["resolved_at"] = _now_ts()
            arena["settled"] = True
            self.arenas[arena_id] = json.dumps(arena)
            _Recipient(Address(arena["creator"])).emit_transfer(value=u256(stake))
            _Recipient(Address(arena["challenger"])).emit_transfer(value=u256(stake))
            BattleResolvedEvent(arena_id, Address(bytes(20)), score_a=score_a, score_b=score_b, fee=0, prize=stake).emit()
            return

        # Determine winner from scores
        if score_a > score_b:
            expected_winner = "A"
        else:
            expected_winner = "B"

        # If scores contradict the AI winner, trust the scores
        if winner != expected_winner:
            winner = expected_winner

        # Update win/loss counts
        if winner == "A":
            winner_id = arena["creator_spell_id"]
            loser_id = arena["challenger_spell_id"]
        else:
            winner_id = arena["challenger_spell_id"]
            loser_id = arena["creator_spell_id"]

        self.spell_wins[winner_id] = int(self.spell_wins.get(winner_id, "0")) + 1
        self.spell_losses[loser_id] = int(self.spell_losses.get(loser_id, "0")) + 1

        # Distribute prize with one-time settlement guard
        stake = int(arena["stake_wei"])
        fee = (stake * int(self.platform_fee_bp)) // 10000
        prize = stake * 2 - fee  # Total pot minus fee

        # Accumulate fees for owner withdrawal
        self.accumulated_fees = int(self.accumulated_fees) + fee

        # Resolve winner address from spell owner
        winner_spell_json = self.spells.get(winner_id, "{}")
        try:
            winner_spell = json.loads(winner_spell_json)
            winner_address = winner_spell.get("owner", "")
        except Exception:
            winner_address = ""

        arena["winner"] = winner_id
        arena["winner_address"] = winner_address
        arena["status"] = "completed"
        arena["resolved_at"] = _now_ts()
        arena["settled"] = True  # Mark as settled (one-time guard)
        self.arenas[arena_id] = json.dumps(arena)

        # Transfer prize to winner
        if winner_address:
            _Recipient(Address(winner_address)).emit_transfer(value=u256(prize))
        BattleResolvedEvent(
            arena_id, Address(winner_address) if winner_address else Address(bytes(20)), score_a=score_a, score_b=score_b, fee=fee, prize=prize
        ).emit()

    @gl.public.write
    def claim_expired_arena(self, arena_id: str) -> None:
        """Claim back stake if arena has been waiting too long (24 hours)."""
        a_json = self.arenas.get(arena_id, "")
        if not a_json:
            raise gl.vm.UserError("arena not found")

        try:
            arena = json.loads(a_json)
        except Exception:
            raise gl.vm.UserError("arena data corrupted")

        if arena["status"] != "waiting":
            raise gl.vm.UserError("arena is not waiting")

        sender = str(gl.message.sender_address).lower()
        if arena["creator"].lower() != sender:
            raise gl.vm.UserError("only the creator may claim")

        # Check 24 hour timeout
        created_at = arena["created_at"]
        now = _now_ts()
        if now - created_at < ARENA_TIMEOUT_SECONDS:
            raise gl.vm.UserError("arena has not expired yet (24h timeout)")

        # Refund stake
        stake = int(arena["stake_wei"])
        _Recipient(Address(sender)).emit_transfer(value=u256(stake))

        # Mark as expired
        arena["status"] = "expired"
        self.arenas[arena_id] = json.dumps(arena)

    @gl.public.write
    def cancel_arena(self, arena_id: str) -> None:
        """Creator can cancel arena if no challenger (before timeout)."""
        a_json = self.arenas.get(arena_id, "")
        if not a_json:
            raise gl.vm.UserError("arena not found")

        try:
            arena = json.loads(a_json)
        except Exception:
            raise gl.vm.UserError("arena data corrupted")

        if arena["status"] != "waiting":
            raise gl.vm.UserError("arena is not waiting")

        sender = str(gl.message.sender_address).lower()
        if arena["creator"].lower() != sender:
            raise gl.vm.UserError("only the creator may cancel")

        # Refund stake
        stake = int(arena["stake_wei"])
        _Recipient(Address(sender)).emit_transfer(value=u256(stake))

        # Mark as cancelled
        arena["status"] = "cancelled"
        self.arenas[arena_id] = json.dumps(arena)

    @gl.public.write
    def expire_active_battle(self, arena_id: str) -> None:
        """Expire active battle if unresolved after 7 days (timeout)."""
        a_json = self.arenas.get(arena_id, "")
        if not a_json:
            raise gl.vm.UserError("arena not found")

        try:
            arena = json.loads(a_json)
        except Exception:
            raise gl.vm.UserError("arena data corrupted")

        if arena["status"] != "active":
            raise gl.vm.UserError("arena is not active")

        # Check 7 day timeout
        created_at = arena["created_at"]
        now = _now_ts()
        if now - created_at < BATTLE_EXPIRY_SECONDS:
            raise gl.vm.UserError("battle has not expired yet (7 day timeout)")

        # Refund both parties (split stake)
        stake = int(arena["stake_wei"])
        
        # Refund creator
        _Recipient(Address(arena["creator"])).emit_transfer(value=u256(stake))
        
        # Refund challenger
        _Recipient(Address(arena["challenger"])).emit_transfer(value=u256(stake))

        # Mark as expired
        arena["status"] = "expired"
        self.arenas[arena_id] = json.dumps(arena)
