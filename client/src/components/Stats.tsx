import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Progress } from "./ui/progress";

type StatProps = {
  user: {
    character: {
      stats: {
        wellness: number;
        social: number;
        growth: number;
        achievement: number;
      };
    };
  };
};

export function Stats({ user }: StatProps) {
  const { stats } = user.character;

  const getStatColor = (value: number) => {
    if (value >= 8) return "bg-green-500";
    if (value >= 5) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <Card className="bg-black/30">
      <CardHeader>
        <CardTitle>Character Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(stats).map(([stat, value]) => (
          <div key={stat}>
            <div className="flex justify-between mb-2">
              <span className="capitalize">{stat}</span>
              <span>{value * 10}%</span>
            </div>
            <Progress
              value={value * 10}
              className={`h-2 ${getStatColor(value)}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
