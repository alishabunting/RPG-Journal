import useSWR from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Checkbox } from "./ui/checkbox";

type Quest = {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
};

export function QuestLog() {
  const { data: quests, mutate } = useSWR<Quest[]>("/api/quests");

  const completeQuest = async (questId: number) => {
    await fetch(`/api/quests/${questId}/complete`, { method: "POST" });
    mutate();
  };

  const categoryColors = {
    Personal: "text-blue-400",
    Professional: "text-green-400",
    Social: "text-purple-400",
    Health: "text-red-400",
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
              <Card key={quest.id} className="bg-black/20 border-purple-500/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Checkbox
                      checked={quest.status === "completed"}
                      onCheckedChange={() => completeQuest(quest.id)}
                    />
                    <div>
                      <h4 className="font-semibold">{quest.title}</h4>
                      <p className="text-sm text-gray-400">{quest.description}</p>
                      <span className={`text-xs ${categoryColors[quest.category as keyof typeof categoryColors]}`}>
                        {quest.category}
                      </span>
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
