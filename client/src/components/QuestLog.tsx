import * as React from "react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";
import { storage } from "../lib/storage";
import type { Quest } from "../lib/storage";
import { useStorage } from "../lib/storage-context";

export function QuestLog() {
  const { user } = useStorage();
  const [quests, setQuests] = useState<Quest[]>(() => storage.getQuests());

  const completeQuest = async (questId: string) => {
    storage.completeQuest(questId);
    setQuests(storage.getQuests());
  };

  const categoryColors = {
    Personal: "text-blue-400",
    Professional: "text-green-400",
    Social: "text-purple-400",
    Health: "text-red-400",
  };

  const getQuestDifficulty = (quest: Quest) => {
    const statReqs = quest.statRequirements || {};
    const characterStats = user?.character?.stats || {};
    let totalDiff = 0;
    let reqCount = 0;

    Object.entries(statReqs).forEach(([stat, req]) => {
      const charStat = characterStats[stat as keyof typeof characterStats] || 0;
      if (req) {
        totalDiff += Math.max(0, req - charStat);
        reqCount++;
      }
    });

    return reqCount > 0 ? totalDiff / reqCount : 0;
  };

  const renderStatRequirements = (quest: Quest) => {
    if (!quest.statRequirements) return null;
    const characterStats = user?.character?.stats || {};

    return (
      <div className="mt-2 space-y-1">
        {Object.entries(quest.statRequirements).map(([stat, requirement]) => {
          const characterStat = characterStats[stat as keyof typeof characterStats] || 0;
          const meetsRequirement = characterStat >= (requirement || 0);
          
          return (
            <div key={stat} className="flex items-center text-xs gap-2">
              <span className={`capitalize ${meetsRequirement ? 'text-green-400' : 'text-red-400'}`}>
                {stat}
              </span>
              <Progress 
                value={(characterStat / (requirement || 1)) * 100} 
                className={`h-1 w-20 ${meetsRequirement ? 'bg-green-400' : 'bg-red-400'}`}
              />
              <span>{characterStat}/{requirement}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderRewards = (quest: Quest) => {
    if (!quest.statRewards) return null;

    return (
      <div className="mt-2">
        <p className="text-xs text-purple-300">Rewards:</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(quest.statRewards).map(([stat, reward]) => (
            <span key={stat} className="text-xs text-green-400">
              +{reward} {stat}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="h-[400px] bg-black/30">
      <CardHeader>
        <CardTitle>Quest Log</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-4">
            {quests?.filter(q => q.status === "active").map((quest) => (
              <Card 
                key={quest.id} 
                className={`bg-black/20 border-purple-500/50 ${
                  quest.metadata?.recommended ? 'ring-2 ring-purple-500' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={quest.status === "completed"}
                      onCheckedChange={() => completeQuest(quest.id)}
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold">{quest.title}</h4>
                        {quest.metadata?.recommended && (
                          <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">{quest.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs ${categoryColors[quest.category as keyof typeof categoryColors]}`}>
                          {quest.category}
                        </span>
                        {quest.difficulty && (
                          <span className="text-xs text-yellow-400">
                            Difficulty: {quest.difficulty}
                          </span>
                        )}
                      </div>
                      {renderStatRequirements(quest)}
                      {renderRewards(quest)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
