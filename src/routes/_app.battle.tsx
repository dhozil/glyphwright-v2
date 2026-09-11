import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  getActiveArenas,
  getPlayerArenas,
  getSpellsByOwner,
  createArena,
  joinArena,
  formatGen,
  parseGen,
  type Arena,
  type Spell,
} from "@/lib/glyphwright.contract";
import { useGlyphwrightAccount } from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArenaCard } from "@/components/glyph/ArenaCard";
import { toast } from "sonner";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Coins } from "lucide-react";

export const Route = createFileRoute("/_app/battle")({
  head: () => ({
    meta: [
      { title: "Battle Arena — Glyphwright" },
      {
        name: "description",
        content: "Challenge other players to spell duels and win GEN.",
      },
    ],
  }),
  component: BattlePage,
});

function BattlePage() {
  const acc = useGlyphwrightAccount();
  const queryClient = useQueryClient();

  // Filter state
  type FilterTab = "all" | "mine" | "active" | "completed";
  const [filter, setFilter] = useState<FilterTab>("all");

  // Fetch active arenas (waiting)
  const arenasQuery = useQuery({
    queryKey: ["activeArenas"],
    queryFn: getActiveArenas,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  // Fetch player's arenas (all statuses)
  const playerArenasQuery = useQuery({
    queryKey: ["playerArenas", acc.address],
    queryFn: () => getPlayerArenas(acc.address!),
    enabled: !!acc.address,
  });

  // Fetch player's spells
  const playerSpellsQuery = useQuery({
    queryKey: ["playerSpells", acc.address],
    queryFn: () => getSpellsByOwner(acc.address!),
    enabled: !!acc.address,
  });

  // Create arena mutation
  const [createStake, setCreateStake] = useState("0.1");
  const [selectedSpell, setSelectedSpell] = useState<string>("");

  const createArenaMutation = useMutation({
    mutationFn: async ({ spellId, stake }: { spellId: string; stake: string }) => {
      const stakeWei = parseGen(stake);
      if (!stakeWei) throw new Error("Invalid stake amount");
      return createArena(spellId, stakeWei);
    },
    onSuccess: () => {
      toast.success("Arena created! Waiting for a challenger...");
      queryClient.invalidateQueries({ queryKey: ["activeArenas"] });
      queryClient.invalidateQueries({ queryKey: ["playerArenas"] });
      setSelectedSpell("");
    },
    onError: (error) => {
      toast.error(`Failed to create arena: ${error.message}`);
    },
  });

  // Select Spell for Joining
  const [joinSpell, setJoinSpell] = useState<string>("");
  const joinArenaMutation = useMutation({
    mutationFn: async ({ arenaId, spellId, stake }: { arenaId: string; spellId: string; stake: bigint }) => {
      return joinArena(arenaId, spellId, stake);
    },
    onSuccess: () => {
      toast.success("Battle joined! Judges are evaluating...");
      queryClient.invalidateQueries({ queryKey: ["activeArenas"] });
      queryClient.invalidateQueries({ queryKey: ["playerArenas"] });
      setJoinSpell("");
    },
    onError: (error) => {
      toast.error(`Failed to join arena: ${error.message}`);
    },
  });

  const handleCreateArena = () => {
    if (!selectedSpell) {
      toast.error("Please select a spell");
      return;
    }
    if (createArenaMutation.isPending) return;
    createArenaMutation.mutate({ spellId: selectedSpell, stake: createStake });
  };

  const handleJoinArena = (arena: Arena) => {
    if (!joinSpell) {
      toast.error("Please select a spell to battle with");
      return;
    }
    if (joinArenaMutation.isPending) return;
    joinArenaMutation.mutate({
      arenaId: arena.id,
      spellId: joinSpell,
      stake: arena.stake_wei,
    });
  };

  const contractMissing = !acc.contractAddress;
  const walletDisconnected = !acc.address;
  const playerSpells = playerSpellsQuery.data ?? [];
  const activeArenas = arenasQuery.data ?? [];
  const playerArenas = playerArenasQuery.data ?? [];

  // Merge and deduplicate arenas: active + player's arenas
  const allArenas = useMemo(() => {
    const map = new Map<string, Arena>();
    for (const a of activeArenas) map.set(a.id, a);
    for (const a of playerArenas) map.set(a.id, a);
    return Array.from(map.values());
  }, [activeArenas, playerArenas]);

  // Filter based on tab
  const filteredArenas = useMemo(() => {
    switch (filter) {
      case "mine":
        return allArenas.filter(
          (a) => a.creator.toLowerCase() === (acc.address ?? "").toLowerCase()
        );
      case "active":
        return activeArenas;
      case "completed":
        return allArenas.filter((a) => a.status === "completed");
      default:
        return allArenas;
    }
  }, [filter, allArenas, activeArenas, acc.address]);

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "all", label: "All Arenas", count: allArenas.length },
    { id: "mine", label: "My Arenas", count: allArenas.filter((a) => a.creator.toLowerCase() === (acc.address ?? "").toLowerCase()).length },
    { id: "active", label: "Active", count: activeArenas.length },
    { id: "completed", label: "Completed", count: allArenas.filter((a) => a.status === "completed").length },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 pb-20 pt-8">
      <header className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-primary/80 mb-3">
          <span className="h-px w-8 bg-primary/60" />
          Battle Arena · PvP Duels
          <span className="h-px w-8 bg-primary/60" />
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-bold">Challenge a Rival</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Stake GEN and pit your spells against another player. AI judges determine
          the winner based on spell stats, element advantages, and star ratings.
        </p>
      </header>

      {walletDisconnected ? (
        <Card className="p-4 mb-6 bg-primary/10 border-primary/50 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold">Connect your wallet to battle.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Stake GEN and pit your spells against other players.
            </p>
          </div>
          <Button
            onClick={acc.connect}
            disabled={acc.connecting}
            className="bg-primary text-primary-foreground"
          >
            {acc.connecting ? "Connecting…" : "Connect Wallet"}
          </Button>
        </Card>
      ) : (
        <Card className="p-4 mb-6 border-border bg-card/80 backdrop-blur">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {/* Wallet Balance */}
              <div className="flex items-center gap-2.5 bg-blue-500/10 border border-blue-400/40 rounded-lg px-4 py-2.5">
                <Wallet className="w-5 h-5 text-blue-400" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground leading-none mb-1">Wallet</span>
                  <span className="text-lg font-bold text-blue-300">{acc.balance !== null ? formatGen(acc.balance) : "—"} <span className="text-sm text-muted-foreground font-normal">GEN</span></span>
                </div>
              </div>

              {/* On-chain Balance */}
              <div className="flex items-center gap-2.5 bg-purple-500/10 border border-purple-400/40 rounded-lg px-4 py-2.5">
                <Coins className="w-5 h-5 text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground leading-none mb-1">On-chain</span>
                  <span className="text-lg font-bold text-purple-300">{acc.contractBalance !== null ? formatGen(acc.contractBalance) : "—"} <span className="text-sm text-muted-foreground font-normal">GEN</span></span>
                </div>
              </div>
            </div>
            <BalanceActions />
          </div>
        </Card>
      )}

      {/* Create Arena Section */}
      <Card className="p-6 mb-8 border-border bg-card/80 backdrop-blur">
        <h2 className="font-serif text-xl font-bold mb-4">Create Battle Arena</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Select Your Spell
            </label>
            <Select value={selectedSpell} onValueChange={setSelectedSpell}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a spell" />
              </SelectTrigger>
              <SelectContent>
                {playerSpells.map((spell) => (
                  <SelectItem key={spell.id} value={spell.id}>
                    {spell.spellName} ({spell.consensus.element}) - PWR {spell.consensus.power}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">
              Stake Amount (GEN)
            </label>
            <Input
              type="number"
              value={createStake}
              onChange={(e) => setCreateStake(e.target.value)}
              min="0.01"
              step="0.1"
              placeholder="0.1"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={handleCreateArena}
              disabled={!selectedSpell || createArenaMutation.isPending}
              className="w-full bg-primary text-primary-foreground"
            >
              {createArenaMutation.isPending ? "Creating..." : "Create Arena"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Other players will see your arena and can join by staking the same amount.
          The winner takes 95% of the total pot (5% platform fee).
        </p>
      </Card>

      {/* Select Spell for Joining */}
          <Card className="p-4 mb-6 border-border bg-card/80">
        <div className="flex items-center gap-4">
          <label className="text-sm text-muted-foreground">
            Your battle spell:
          </label>
          <Select value={joinSpell} onValueChange={setJoinSpell}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choose a spell to battle" />
            </SelectTrigger>
            <SelectContent>
              {playerSpells.map((spell) => (
                <SelectItem key={spell.id} value={spell.id}>
                  {spell.spellName} (★{spell.stars}) - PWR {spell.consensus.power}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Arenas List */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-serif text-xl font-bold">Arenas</h2>
          <div className="flex rounded-md border border-border overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`cursor-pointer px-3 py-1.5 text-xs transition ${
                  filter === tab.id
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/50"
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1 text-[10px] opacity-60">({tab.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {filteredArenas.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              {filter === "active"
                ? "No active arenas. Be the first to create one!"
                : filter === "mine"
                ? "You haven't created or joined any arenas yet."
                : filter === "completed"
                ? "No completed arenas yet."
                : "No arenas found."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredArenas.map((arena) => (
              <ArenaCard
                key={arena.id}
                arena={arena}
                currentAddress={acc.address ?? undefined}
                onJoin={handleJoinArena}
                isJoining={joinArenaMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BalanceActions() {
  const acc = useGlyphwrightAccount();
  const [depositAmount, setDepositAmount] = useState("1");
  const [withdrawAmount, setWithdrawAmount] = useState("0.5");

  const depositMut = useMutation({
    mutationFn: async () => {
      const wei = parseGen(depositAmount);
      if (!wei || wei <= 0n) throw new Error("Invalid amount");
      await acc.deposit(wei);
    },
    onSuccess: () => {
      toast.success("Deposited to on-chain balance!");
      setDepositAmount("1");
    },
    onError: (e) => toast.error(`Deposit failed: ${(e as Error).message}`),
  });

  const withdrawMut = useMutation({
    mutationFn: async () => {
      const wei = parseGen(withdrawAmount);
      if (!wei || wei <= 0n) throw new Error("Invalid amount");
      await acc.withdraw(wei);
    },
    onSuccess: () => {
      toast.success("Withdrawn to wallet!");
      setWithdrawAmount("0.5");
    },
    onError: (e) => toast.error(`Withdraw failed: ${(e as Error).message}`),
  });

  return (
    <div className="flex items-stretch gap-3">
      {/* Deposit */}
      <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/40 rounded-lg px-3 py-2">
        <ArrowDownToLine className="w-4 h-4 text-emerald-400 shrink-0" />
        <Input
          type="number"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          className="w-24 h-8 text-sm font-medium border-emerald-400/40 focus-visible:ring-emerald-500/50"
          min="0.01"
          step="0.1"
          disabled={depositMut.isPending}
        />
        <span className="text-xs text-muted-foreground">GEN</span>
        <Button
          size="sm"
          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium"
          onClick={() => depositMut.mutate()}
          disabled={depositMut.isPending || !depositAmount}
        >
          {depositMut.isPending ? "…" : "Deposit"}
        </Button>
      </div>

      {/* Withdraw */}
      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-400/40 rounded-lg px-3 py-2">
        <ArrowUpFromLine className="w-4 h-4 text-amber-400 shrink-0" />
        <Input
          type="number"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          className="w-24 h-8 text-sm font-medium border-amber-400/40 focus-visible:ring-amber-500/50"
          min="0.01"
          step="0.1"
          disabled={withdrawMut.isPending}
        />
        <span className="text-xs text-muted-foreground">GEN</span>
        <Button
          size="sm"
          className="h-8 px-3 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium"
          onClick={() => withdrawMut.mutate()}
          disabled={withdrawMut.isPending || !withdrawAmount}
        >
          {withdrawMut.isPending ? "…" : "Withdraw"}
        </Button>
      </div>
    </div>
  );
}
