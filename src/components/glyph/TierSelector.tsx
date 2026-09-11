import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkles, Zap, Crown } from "lucide-react";

export type ForgeTier = "standard" | "epic" | "legendary";

interface TierOption {
  id: ForgeTier;
  name: string;
  cost: string;
  description: string;
  rarityBoost: string;
  color: string;
  borderColor: string;
  glowColor: string;
  hoverGlow: string;
  icon: React.ReactNode;
  gradient: string;
}

const TIERS: TierOption[] = [
  {
    id: "standard",
    name: "Standard",
    cost: "1 GEN",
    description: "Basic forge with common spells",
    rarityBoost: "Common 60% · Uncommon 30% · Rare 10%",
    color: "text-zinc-300",
    borderColor: "border-zinc-500/50",
    glowColor: "",
    hoverGlow: "hover:shadow-[0_0_15px_rgba(113,113,122,0.3)]",
    icon: <Sparkles className="w-5 h-5" />,
    gradient: "from-zinc-500/20 to-zinc-600/10",
  },
  {
    id: "epic",
    name: "Epic",
    cost: "2.5 GEN",
    description: "Enhanced forge with better odds",
    rarityBoost: "Uncommon 40% · Rare 40% · Epic 20%",
    color: "text-purple-300",
    borderColor: "border-purple-500/50",
    glowColor: "shadow-[0_0_20px_rgba(168,85,247,0.3)]",
    hoverGlow: "hover:shadow-[0_0_25px_rgba(168,85,247,0.4)]",
    icon: <Zap className="w-5 h-5" />,
    gradient: "from-purple-500/20 to-purple-600/10",
  },
  {
    id: "legendary",
    name: "Legendary",
    cost: "5 GEN",
    description: "Premium forge for legendary spells",
    rarityBoost: "Rare 30% · Epic 40% · Legendary 30%",
    color: "text-amber-300",
    borderColor: "border-amber-500/50",
    glowColor: "shadow-[0_0_30px_rgba(245,158,11,0.4)]",
    hoverGlow: "hover:shadow-[0_0_40px_rgba(245,158,11,0.5)]",
    icon: <Crown className="w-5 h-5" />,
    gradient: "from-amber-500/20 to-orange-600/10",
  },
];

interface TierSelectorProps {
  selected: ForgeTier;
  onSelect: (tier: ForgeTier) => void;
  disabled?: boolean;
}

export function TierSelector({ selected, onSelect, disabled }: TierSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="text-sm uppercase tracking-widest text-primary/80">
        Select Forge Tier
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((tier) => {
          const isSelected = selected === tier.id;
          return (
            <Card
              key={tier.id}
              className={cn(
                "relative p-4 cursor-pointer transition-all duration-300 ease-out",
                "border-2 overflow-hidden",
                tier.borderColor,
                isSelected
                  ? "ring-2 ring-primary bg-primary/10 scale-[1.02]"
                  : cn("bg-card/50 hover:bg-card/80 hover:scale-[1.01]", tier.hoverGlow),
                tier.glowColor,
                disabled && "opacity-50 cursor-not-allowed hover:scale-100"
              )}
              onClick={() => !disabled && onSelect(tier.id)}
            >
              {/* Background gradient */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-50 transition-opacity duration-300",
                tier.gradient,
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-50"
              )} />

              {/* Content */}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("transition-transform duration-300", isSelected && "scale-110", tier.color)}>
                      {tier.icon}
                    </span>
                    <h3 className={cn("font-serif font-bold text-lg transition-colors duration-300", tier.color)}>
                      {tier.name}
                    </h3>
                  </div>
                  {isSelected && (
                    <Badge 
                      variant="default" 
                      className="bg-primary text-primary-foreground animate-in zoom-in-95 duration-200"
                    >
                      Selected
                    </Badge>
                  )}
                </div>

                <p className={cn(
                  "text-2xl font-bold mb-2 transition-all duration-300",
                  isSelected ? "text-foreground" : "text-foreground/80"
                )}>
                  {tier.cost}
                </p>

                <p className="text-xs text-muted-foreground mb-3">{tier.description}</p>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rarity:</span>
                    <span className="text-foreground/80">{tier.rarityBoost}</span>
                  </div>
                </div>

                {/* Selected indicator line */}
                {isSelected && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary animate-in slide-in-from-left duration-300" />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
