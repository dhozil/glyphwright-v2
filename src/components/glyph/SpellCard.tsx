import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Spell, Vote } from "@/lib/glyphwright.contract";
import { ELEMENT_HUE, RARITY_RING } from "./constants";
import { StarRating } from "./StarRating";
import { cn } from "@/lib/utils";
import { Shield, Zap, Brain } from "lucide-react";

export function Stat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent: string;
}) {
  return (
    <div className="group">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground transition-colors group-hover:text-foreground/80">
        {label}
      </div>
      <div className={cn("mt-1 font-serif text-3xl font-bold transition-all duration-300 group-hover:scale-105", accent)}>
        {value}
        {suffix ?? ""}
      </div>
      <Progress value={value} className="mt-2 h-1 transition-all duration-500 group-hover:h-1.5" />
    </div>
  );
}

export function VoteCard({ vote }: { vote: Vote }) {
  return (
    <Card className={cn(
      "p-4 bg-card/70 border-border transition-all duration-300",
      "hover:bg-card/80 hover:border-border/80 hover:shadow-lg"
    )}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <Brain className="w-4 h-4 text-primary" />
        </div>
        <div className="font-serif font-semibold">{vote.validator}</div>
      </div>
      
      <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-primary" />
          <span>PWR {vote.power}</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-sky-400" />
          <span>MANA {vote.mana_cost}</span>
        </div>
        <span className="capitalize px-1.5 py-0.5 rounded bg-secondary/50">{vote.element}</span>
        <span className="capitalize px-1.5 py-0.5 rounded bg-secondary/50">{vote.rarity}</span>
      </div>
      
      <p className="mt-3 text-sm text-foreground/80 italic leading-relaxed">"{vote.reasoning}"</p>
    </Card>
  );
}

const TIER_BADGES = {
  standard: { 
    label: "Standard", 
    className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/50",
    glow: "hover:shadow-[0_0_10px_rgba(113,113,122,0.3)]"
  },
  epic: { 
    label: "Epic", 
    className: "bg-purple-500/20 text-purple-300 border-purple-500/50",
    glow: "hover:shadow-[0_0_10px_rgba(168,85,247,0.3)]"
  },
  legendary: { 
    label: "Legendary", 
    className: "bg-amber-500/20 text-amber-300 border-amber-500/50",
    glow: "hover:shadow-[0_0_10px_rgba(245,158,11,0.3)]"
  },
};

export function GrimoireCard({
  spell,
  action,
}: {
  spell: Spell;
  action?: React.ReactNode;
}) {
  const ring = RARITY_RING[spell.consensus.rarity] ?? RARITY_RING.common;
  const hue = ELEMENT_HUE[spell.consensus.element] ?? ELEMENT_HUE.arcane;
  const tierBadge = TIER_BADGES[spell.tier as keyof typeof TIER_BADGES] ?? TIER_BADGES.standard;

  return (
    <Card className={cn(
      `p-4 bg-gradient-to-br ${hue} border-border ring-1 ${ring}`,
      "transition-all duration-300 hover:scale-[1.02] hover:shadow-xl",
      "group cursor-pointer"
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-serif font-semibold truncate transition-colors group-hover:text-foreground">
          {spell.spellName}
        </div>
        <div className="flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={cn(
              "transition-all duration-300",
              tierBadge.className,
              tierBadge.glow
            )}
          >
            {tierBadge.label}
          </Badge>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
            {spell.consensus.element} · {spell.consensus.rarity}
          </span>
        </div>
      </div>
      
      <p className="mt-2 text-xs italic text-foreground/70 line-clamp-2 transition-colors group-hover:text-foreground/90">
        "{spell.incantation}"
      </p>
      
      <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Shield className="w-3 h-3 text-primary" />
          <span>PWR {spell.consensus.power}</span>
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3 text-sky-400" />
          <span>MANA {spell.consensus.mana_cost}</span>
        </div>
      </div>
      
      <div className="mt-3 flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-3">
          {spell.stars > 0 && (
            <div className="flex items-center gap-1">
              <StarRating stars={spell.stars} size="sm" animated={false} />
              <span className="text-[10px] text-amber-400 font-medium">★</span>
            </div>
          )}
          {spell.wins > 0 && (
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-emerald-400">{spell.wins}W</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-destructive">{spell.losses}L</span>
            </div>
          )}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {spell.id} · {new Date(spell.forged_at * 1000).toLocaleDateString()}
        </div>
      </div>
      
      {action ? <div className="mt-3 pt-3 border-t border-border">{action}</div> : null}
    </Card>
  );
}
