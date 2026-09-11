import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  stars: number;
  maxStars?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

const sizeClasses = {
  sm: "w-3 h-3",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

const sizeSpacing = {
  sm: "gap-0.5",
  md: "gap-1",
  lg: "gap-1.5",
};

export function StarRating({ 
  stars, 
  maxStars = 5, 
  size = "md", 
  showLabel,
  animated = true 
}: StarRatingProps) {
  return (
    <div className={cn("flex items-center", sizeSpacing[size])}>
      {Array.from({ length: maxStars }, (_, i) => {
        const isFilled = i < stars;
        const delay = animated ? i * 50 : 0;
        
        return (
          <div
            key={i}
            className={cn(
              "relative transition-transform duration-200",
              animated && "hover:scale-125"
            )}
            style={{ animationDelay: `${delay}ms` }}
          >
            <Star
              className={cn(
                sizeClasses[size],
                "transition-all duration-300",
                isFilled
                  ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]"
                  : "fill-none text-muted-foreground/30",
                animated && isFilled && "animate-in zoom-in-95"
              )}
              style={{ animationDelay: `${delay}ms` }}
            />
            
            {/* Sparkle effect for filled stars */}
            {isFilled && animated && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-1 h-1 bg-amber-200 rounded-full opacity-75 animate-ping" 
                     style={{ animationDelay: `${delay + 200}ms`, animationDuration: "1s" }} />
              </div>
            )}
          </div>
        );
      })}
      
      {showLabel && (
        <span className={cn(
          "ml-2 text-xs text-muted-foreground transition-opacity duration-300",
          stars > 0 ? "opacity-100" : "opacity-50"
        )}>
          {stars}/{maxStars}
        </span>
      )}
    </div>
  );
}

// Animated star burst effect for when a spell wins
export function StarBurst({ count }: { count: number }) {
  if (count === 0) return null;
  
  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Background glow */}
      <div className={cn(
        "absolute w-8 h-8 rounded-full animate-pulse",
        count >= 5 ? "bg-amber-400/30" : count >= 3 ? "bg-amber-400/20" : "bg-amber-400/10"
      )} />
      
      {/* Stars */}
      <div className="relative flex items-center gap-0.5">
        {Array.from({ length: count }, (_, i) => (
          <Star
            key={i}
            className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
            style={{
              animation: `bounceIn 0.4s ease-out ${i * 0.1}s both`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
