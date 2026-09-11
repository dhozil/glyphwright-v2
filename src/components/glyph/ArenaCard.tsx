import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Arena, Spell } from "@/lib/glyphwright.contract";
import { formatGen } from "@/lib/glyphwright.contract";
import { ELEMENT_HUE, RARITY_RING } from "./constants";
import { StarRating } from "./StarRating";
import {
  Swords,
  Clock,
  Trophy,
  Coins,
  XCircle,
  Flame,
  Droplets,
  Leaf,
  Wind,
  Zap,
  Skull,
  Sun,
  Moon,
  Mountain,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ArenaCardProps {
  arena: Arena;
  currentAddress?: string;
  onJoin?: (arena: Arena) => void;
  isJoining?: boolean;
}

function getElementIcon(element: string) {
  const icons: Record<string, React.ReactNode> = {
    fire: <Flame className="w-3 h-3" />,
    water: <Droplets className="w-3 h-3" />,
    earth: <Mountain className="w-3 h-3" />,
    air: <Wind className="w-3 h-3" />,
    lightning: <Zap className="w-3 h-3" />,
    death: <Skull className="w-3 h-3" />,
    life: <Sun className="w-3 h-3" />,
    light: <Sun className="w-3 h-3" />,
    shadow: <Moon className="w-3 h-3" />,
  };
  return icons[element] || <Leaf className="w-3 h-3" />;
}

function getRarityColor(rarity: string) {
  switch (rarity) {
    case "common":
      return "text-zinc-400";
    case "uncommon":
      return "text-emerald-400";
    case "rare":
      return "text-blue-400";
    case "epic":
      return "text-purple-400";
    case "legendary":
      return "text-amber-400";
    default:
      return "text-zinc-400";
  }
}

function getScoreBar(score: number, maxScore: number = 100) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  let color = "bg-zinc-500";
  if (percentage >= 80) color = "bg-emerald-500";
  else if (percentage >= 60) color = "bg-blue-500";
  else if (percentage >= 40) color = "bg-amber-500";
  else color = "bg-red-500";
  return { percentage, color };
}

export function ArenaCard({ arena, currentAddress, onJoin, isJoining }: ArenaCardProps) {
  const isCreator = currentAddress?.toLowerCase() === arena.creator.toLowerCase();
  const isWaiting = arena.status === "waiting";
  const isCompleted = arena.status === "completed";

  const creatorSpell = arena.creator_spell;
  const challengerSpell = arena.challenger_spell;

  // Find the winner spell
  const winnerSpell =
    arena.winner === creatorSpell?.id
      ? creatorSpell
      : arena.winner === challengerSpell?.id
      ? challengerSpell
      : null;

  const statusConfig = {
    waiting: {
      label: "Waiting",
      icon: <Clock className="w-3 h-3" />,
      className: "bg-amber-500/20 text-amber-300 border-amber-500/50",
      pulse: true,
    },
    active: {
      label: "Active",
      icon: <Swords className="w-3 h-3" />,
      className: "bg-purple-500/20 text-purple-300 border-purple-500/50",
      pulse: true,
    },
    completed: {
      label: "Completed",
      icon: <Trophy className="w-3 h-3" />,
      className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
      pulse: false,
    },
    expired: {
      label: "Expired",
      icon: <Clock className="w-3 h-3" />,
      className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/50",
      pulse: false,
    },
    cancelled: {
      label: "Cancelled",
      icon: <XCircle className="w-3 h-3" />,
      className: "bg-red-500/20 text-red-300 border-red-500/50",
      pulse: false,
    },
  };

  const status = statusConfig[arena.status] || statusConfig.waiting;

  const renderSpellDetails = (spell: Spell, label: string, isWinner: boolean) => {
    const hue = ELEMENT_HUE[spell.consensus.element as keyof typeof ELEMENT_HUE] ?? ELEMENT_HUE.arcane;
    const ring = RARITY_RING[spell.consensus.rarity as keyof typeof RARITY_RING] ?? RARITY_RING.common;
    const rarityColor = getRarityColor(spell.consensus.rarity);

    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {isWinner && (
            <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-[10px] px-1 py-0">
              WINNER
            </Badge>
          )}
        </div>
        <div
          className={cn(
            `p-3 rounded-lg bg-gradient-to-br ${hue} border-border ring-1 ${ring}`,
            "transition-all duration-300",
            isWinner && "ring-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
          )}
        >
          {/* Spell Name & Element */}
          <div className="flex items-center gap-2 mb-2">
            <div className="font-serif font-semibold text-sm truncate">
              {spell.spellName}
            </div>
          </div>

          {/* Element & Rarity */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <div className="flex items-center gap-1 capitalize">
              {getElementIcon(spell.consensus.element)}
              <span>{spell.consensus.element}</span>
            </div>
            <span className="text-border">·</span>
            <span className={cn("capitalize", rarityColor)}>
              {spell.consensus.rarity}
            </span>
          </div>

          {/* Power & Stars */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold">PWR {spell.consensus.power}</span>
            {spell.stars > 0 && (
              <StarRating stars={spell.stars} size="sm" animated={false} />
            )}
          </div>

          {/* Incantation */}
          <div className="text-[10px] text-muted-foreground/70 italic line-clamp-2 mb-1">
            "{spell.incantation}"
          </div>

          {/* Mana Cost */}
          <div className="flex items-center gap-1 text-[10px] text-primary/70">
            <span>Mana: {spell.consensus.mana_cost}</span>
          </div>
        </div>

        {/* Creator Address */}
        <div className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
          {label === "Creator"
            ? `${arena.creator.slice(0, 6)}...${arena.creator.slice(-4)}`
            : arena.challenger
            ? `${arena.challenger.slice(0, 6)}...${arena.challenger.slice(-4)}`
            : ""}
        </div>
      </div>
    );
  };

  return (
    <Card
      className={cn(
        "p-4 bg-card/70 border-border transition-all duration-300",
        "hover:bg-card/90 hover:border-border/80",
        isWaiting && !isCreator && "hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="font-mono text-xs text-muted-foreground">{arena.id}</div>
        <Badge
          variant="outline"
          className={cn(
            "flex items-center gap-1 transition-all duration-300",
            status.className
          )}
        >
          {status.icon}
          {status.label}
          {status.pulse && (
            <span className="relative flex h-2 w-2 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
            </span>
          )}
        </Badge>
      </div>

      {/* Battle Area */}
      <div className="flex items-center gap-3">
        {renderSpellDetails(
          creatorSpell ?? {
            id: arena.creator_spell_id,
            owner: arena.creator,
            forged_at: arena.created_at,
            tier: "standard",
            spellName: "Loading...",
            incantation: "",
            description: "",
            intent: "",
            votes: [],
            stars: 0,
            wins: 0,
            losses: 0,
            consensus: { element: "fire", rarity: "common", power: 0, mana_cost: 0, approval: 100, verdict: "FORGED", tier: "standard" },
          },
          "Creator",
          isCompleted && arena.winner === creatorSpell?.id
        )}

        {/* VS Badge */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "relative flex items-center justify-center w-12 h-12 rounded-full",
              "bg-gradient-to-br from-primary/20 to-accent/20",
              "border border-primary/30"
            )}
          >
            <span className="font-serif font-bold text-lg text-primary">VS</span>
            {isWaiting && (
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
            )}
          </div>

          {/* Stake amount */}
          <div className="flex items-center gap-1 text-xs">
            <Coins className="w-3 h-3 text-primary" />
            <span className="font-semibold text-primary">{formatGen(arena.stake_wei)}</span>
            <span className="text-muted-foreground">GEN</span>
          </div>
        </div>

        {challengerSpell
          ? renderSpellDetails(
              challengerSpell,
              "Challenger",
              isCompleted && arena.winner === challengerSpell.id
            )
          : (
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-2">Challenger</div>
                <div className="p-3 rounded-lg bg-background/30 text-xs text-muted-foreground italic">
                  {isWaiting ? "Waiting for challenger..." : "No challenger"}
                </div>
              </div>
            )}
      </div>

      {/* Score & Result Section */}
      {isCompleted && arena.score_a !== undefined && arena.score_b !== undefined && (
        <div className="mt-4 p-3 rounded-lg bg-background/30 border border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold">Battle Result</span>
          </div>

          {/* Score Bars */}
          <div className="space-y-2 mb-3">
            {/* Creator Score */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground truncate max-w-[120px]">
                  {creatorSpell?.spellName ?? "Creator"}
                </span>
                <span className="font-semibold">{arena.score_a}</span>
              </div>
              <div className="h-2 bg-background/50 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    getScoreBar(arena.score_a).color
                  )}
                  style={{ width: `${getScoreBar(arena.score_a).percentage}%` }}
                />
              </div>
            </div>

            {/* Challenger Score */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground truncate max-w-[120px]">
                  {challengerSpell?.spellName ?? "Challenger"}
                </span>
                <span className="font-semibold">{arena.score_b}</span>
              </div>
              <div className="h-2 bg-background/50 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    getScoreBar(arena.score_b).color
                  )}
                  style={{ width: `${getScoreBar(arena.score_b).percentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Element Advantage */}
          {arena.element_advantage && arena.element_advantage !== "none" && (
            <div className="flex items-center gap-1 text-xs text-primary mb-2">
              <Zap className="w-3 h-3" />
              <span>Element advantage: {arena.element_advantage}</span>
            </div>
          )}

          {/* Winner & Prize */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-400" />
              <div className="text-sm text-emerald-300 font-semibold">
                {winnerSpell?.spellName ?? "Draw"}
              </div>
            </div>
            {arena.winner && (
              <div className="text-xs text-emerald-400/70">
                Prize: {formatGen(arena.stake_wei * 2n - (arena.stake_wei * 5n / 100n))} GEN
              </div>
            )}
          </div>

          {/* Reasoning */}
          {arena.reasoning && (
            <div className="mt-2 p-2 rounded bg-background/30 text-[11px] text-muted-foreground/80 italic line-clamp-3">
              "{arena.reasoning}"
            </div>
          )}
        </div>
      )}

      {/* Join button for waiting arenas */}
      {isWaiting && !isCreator && onJoin && (
        <Button
          onClick={() => onJoin(arena)}
          disabled={isJoining}
          className={cn(
            "mt-3 w-full bg-primary text-primary-foreground",
            "transition-all duration-300",
            "hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]",
            "active:scale-[0.98]"
          )}
        >
          <Swords className="w-4 h-4 mr-2" />
          {isJoining ? "Joining..." : `Join Battle (${formatGen(arena.stake_wei)} GEN)`}
        </Button>
      )}

      {/* Expired arena claim button */}
      {isWaiting && isCreator && (
        <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="text-xs text-amber-300 text-center">
            If no one joins within 24h, you can claim back your stake.
          </div>
        </div>
      )}
    </Card>
  );
}
