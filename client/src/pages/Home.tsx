import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Character } from "../components/Character";
import { Journal } from "../components/Journal";
import { QuestLog } from "../components/QuestLog";
import { Stats } from "../components/Stats";
import { Card } from "../components/ui/card";
import { storage } from "../lib/storage";
import type { User } from "../lib/storage";

export default function Home() {
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const currentUser = storage.getUser();
    if (!currentUser) {
      setLocation('/auth');
    } else {
      setUser(currentUser);
    }
  }, [setLocation]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-black text-white p-4">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="col-span-1 md:col-span-2 lg:col-span-3 bg-black/50 border-purple-500">
          <Character user={user} />
        </Card>
        
        <Card className="lg:col-span-2 bg-black/50 border-purple-500">
          <Journal />
        </Card>

        <Card className="bg-black/50 border-purple-500">
          <Stats user={user} />
        </Card>

        <Card className="md:col-span-2 lg:col-span-3 bg-black/50 border-purple-500">
          <QuestLog />
        </Card>
      </div>
    </div>
  );
}
