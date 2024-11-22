import * as React from "react";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { storage } from "../lib/storage";
import type { Character as CharacterType } from "../lib/storage";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Progress } from "./ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

const CLASSES = ["Warrior", "Mage", "Rogue", "Cleric"] as const;
const AVATARS = [
  "/avatars/warrior.svg",
  "/avatars/mage.svg",
  "/avatars/rogue.svg",
  "/avatars/cleric.svg",
] as const;

const defaultCharacter: CharacterType = {
  name: 'New Adventurer',
  class: 'Warrior',
  avatar: '/avatars/warrior.svg',
  level: 1,
  xp: 0,
  stats: {
    strength: 1,
    dexterity: 1,
    constitution: 1,
    intelligence: 1,
    wisdom: 1,
    charisma: 1
  },
  achievements: []
};

interface CharacterProps {
  user?: {
    character?: CharacterType;
  };
}

export function Character({ user }: CharacterProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [character, setCharacter] = useState<CharacterType>(() => {
    const initialCharacter = user?.character ? { ...defaultCharacter, ...user.character } : { ...defaultCharacter };
    return initialCharacter;
  });

  const handleSave = () => {
    try {
      storage.updateCharacter(character);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving character:', error);
    }
  };

  React.useEffect(() => {
    if (user?.character) {
      const updatedCharacter = { ...defaultCharacter, ...user.character };
      setCharacter(updatedCharacter);
    }
  }, [user?.character]);

  return (
    <div className="p-6">
      <div className="flex items-center gap-6">
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Avatar className="w-24 h-24 cursor-pointer">
              <AvatarImage src={character.avatar} />
            </Avatar>
          </DialogTrigger>
          <DialogContent className="bg-black/90 border-purple-500">
            <DialogHeader>
              <DialogTitle className="text-white">Customize Character</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Character Name"
                value={character.name}
                onChange={(e) =>
                  setCharacter({ ...character, name: e.target.value })
                }
                className="bg-purple-900/50 border-purple-500 text-white placeholder:text-purple-300"
              />
              <Select
                value={character.class}
                onValueChange={(value) =>
                  setCharacter({ ...character, class: value })
                }
              >
                <SelectTrigger className="bg-purple-900/50 border-purple-500 text-white">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent className="bg-black/90 border-purple-500">
                  {CLASSES.map((c) => (
                    <SelectItem 
                      key={c} 
                      value={c}
                      className="text-white hover:bg-purple-900/50 focus:bg-purple-900/50"
                    >
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                {AVATARS.map((avatar) => (
                  <Avatar
                    key={avatar}
                    className="w-20 h-20 cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all"
                    onClick={() => setCharacter({ ...character, avatar })}
                  >
                    <AvatarImage src={avatar} />
                  </Avatar>
                ))}
              </div>
              <Button 
                onClick={handleSave}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold">{character.name}</h2>
          <p className="text-purple-400">Level {character.level} {character.class}</p>
          <div className="w-full">
            <div className="flex justify-between text-xs">
              <span>XP</span>
              <span>{character.xp}/1000</span>
            </div>
            <Progress value={(character.xp % 1000) / 10} className="h-1" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {Object.entries(character?.stats ?? {}).map(([stat, value]) => (
          <Card key={stat} className="bg-black/30 border-purple-500/50">
            <CardHeader className="pb-2">
              <CardTitle className="capitalize text-sm flex justify-between items-center">
                <span>{stat}</span>
                <span className="text-xs text-purple-400">{value}/10</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={(value as number) * 10} className="h-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {character?.achievements?.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Recent Achievements</h3>
          <div className="space-y-2">
            {character?.achievements?.slice(0, 3).map((achievement, index) => (
              <div key={index} className="bg-purple-500/10 rounded-lg p-3">
                <h4 className="font-medium text-purple-300">{achievement?.title}</h4>
                {achievement?.description && (
                  <p className="text-sm text-purple-200/70">{achievement.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
