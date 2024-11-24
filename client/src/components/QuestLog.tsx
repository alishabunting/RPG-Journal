import * as React from "react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
// Enhanced storyline progress visualization
const StorylineProgress = ({ progress }: { progress: number }) => (
  <motion.div className="relative w-full h-2 bg-purple-500/20 rounded-full overflow-hidden mt-2">
    <motion.div
      className="absolute top-0 left-0 h-full bg-purple-500"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />
    <motion.div
      className="absolute top-0 left-0 h-full bg-white/20"
      initial={{ x: '-100%' }}
      animate={{ x: '100%' }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: "linear"
      }}
    />
  </motion.div>
);
  const { user } = useStorage();
  const [quests, setQuests] = useState<Quest[]>(() => storage.getQuests());

  const [completingQuest, setCompletingQuest] = useState<string | null>(null);
  const [showReward, setShowReward] = useState(false);

  const completeQuest = async (questId: string) => {
    setCompletingQuest(questId);
    setShowReward(true);
    
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;

    // Animated completion sequence
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Update quest status
    storage.completeQuest(questId);
    
    // Show reward animations
    if (quest.statRewards) {
      // Let animations play out
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Update quest list
    setQuests(storage.getQuests());
    
    // Reset states after all animations
    setTimeout(() => {
      setCompletingQuest(null);
      setShowReward(false);
    }, 1200);
  };

const RewardAnimation = ({ reward, stat }: { reward: number; stat: string }) => (
  <motion.div
    className="absolute top-0 right-0 text-xs text-green-400"
    initial={{ opacity: 0, y: 0 }}
    animate={{
      opacity: [0, 1, 1, 0],
      y: -20,
    }}
    transition={{ duration: 1 }}
  >
    +{reward} {stat}
  </motion.div>
);
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
          const progress = (characterStat / (requirement || 1)) * 100;
          
          return (
            <motion.div key={stat} className="flex items-center text-xs gap-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
              <span className={`capitalize ${meetsRequirement ? 'text-green-400' : 'text-red-400'}`}>
                {stat}
              </span>
              <div className="relative w-20">
                <motion.div className="relative w-full h-1">
                  <Progress 
                    value={progress} 
                    className={`h-full ${meetsRequirement ? 'bg-green-400' : 'bg-red-400'}`}
                  />
                  {quest.id === completingQuest && (
                    <motion.div
                      className="absolute top-0 left-0 h-full bg-purple-500"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ 
                        width: '100%', 
                        opacity: [0, 1, 1, 0],
                      }}
                      transition={{ duration: 0.8, times: [0, 0.2, 0.8, 1] }}
                    />
                  )}
                </motion.div>
                <motion.div
                  className="absolute top-0 left-0 h-1 bg-purple-500/30"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </motion.div>
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
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <CardTitle>Quest Log</CardTitle>
        </motion.div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] pr-4">
          <div className="space-y-4">
            <AnimatePresence>
              {quests?.filter(q => q.status === "active").map((quest) => (
                <motion.div
                  key={quest.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                >
                  <Card 
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
                          <motion.div
                            className="flex justify-between items-start"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4 }}
                          >
                            <h4 className="font-semibold">{quest.title}</h4>
                            {quest.metadata?.recommended && (
                              <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">
                                Recommended
                              </span>
                            )}
                          </motion.div>
                          <p className="text-sm text-gray-400">{quest.description}</p>
                          <motion.div
                            className="flex items-center gap-2 mt-1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.4 }}
                          >
                            <span className={`text-xs ${categoryColors[quest.category as keyof typeof categoryColors]}`}>
                              {quest.category}
                            </span>
                            {quest.difficulty && (
                              <span className="text-xs text-yellow-400">
                                Difficulty: {quest.difficulty}
                              </span>
                            )}
                          </motion.div>
                          {renderStatRequirements(quest)}
                          <div className="relative">
                            {renderRewards(quest)}
                            {quest.id === completingQuest && showReward && quest.statRewards && (
                              <AnimatePresence>
                                {Object.entries(quest.statRewards).map(([stat, reward], index) => (
                                  <RewardAnimation key={`${quest.id}-${stat}`} reward={reward} stat={stat} />
                                ))}
                              </AnimatePresence>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
