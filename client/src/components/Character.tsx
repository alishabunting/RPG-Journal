import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
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

const CLASSES = ["Warrior", "Mage", "Rogue", "Cleric"];
const AVATARS = [
  "/avatars/warrior.svg",
  "/avatars/mage.svg",
  "/avatars/rogue.svg",
  "/avatars/cleric.svg",
];

export function Character({ user }: { user: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [character, setCharacter] = useState(user.character);

  const handleSave = async () => {
    await fetch("/api/character", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(character),
    });
    setIsEditing(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-6">
        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogTrigger asChild>
            <Avatar className="w-24 h-24 cursor-pointer">
              <AvatarImage src={character.avatar} />
            </Avatar>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Customize Character</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Character Name"
                value={character.name}
                onChange={(e) =>
                  setCharacter({ ...character, name: e.target.value })
                }
              />
              <Select
                value={character.class}
                onValueChange={(value) =>
                  setCharacter({ ...character, class: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {CLASSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                {AVATARS.map((avatar) => (
                  <Avatar
                    key={avatar}
                    className="w-20 h-20 cursor-pointer"
                    onClick={() => setCharacter({ ...character, avatar })}
                  >
                    <AvatarImage src={avatar} />
                  </Avatar>
                ))}
              </div>
              <Button onClick={handleSave}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>

        <div>
          <h2 className="text-2xl font-bold">{character.name}</h2>
          <p className="text-purple-400">Level 1 {character.class}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {Object.entries(character.stats).map(([stat, value]) => (
          <Card key={stat}>
            <CardHeader>
              <CardTitle className="capitalize text-sm">{stat}</CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={value as number * 10} className="h-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
