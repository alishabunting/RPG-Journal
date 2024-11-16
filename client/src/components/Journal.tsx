import { useState } from "react";
import useSWR, { mutate } from "swr";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { useToast } from "../hooks/use-toast";

export function Journal() {
  const [entry, setEntry] = useState("");
  const { data: journals } = useSWR("/api/journals");
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!entry.trim()) return;
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: entry }),
      });
      
      if (!res.ok) throw new Error("Failed to save journal");
      
      setEntry("");
      mutate("/api/journals");
      toast({
        title: "Journal Entry Saved",
        description: "A new quest has been generated!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save journal entry",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <Card className="bg-black/30">
        <CardHeader>
          <CardTitle>Today's Chronicle</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Write about your day's adventures..."
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className="min-h-[200px] bg-transparent"
          />
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Recording..." : "Record Journey"}
          </Button>
        </CardFooter>
      </Card>

      <div className="space-y-4">
        {journals?.map((journal: any) => (
          <Card key={journal.id} className="bg-black/30">
            <CardHeader>
              <CardTitle className="text-sm text-purple-400">
                {new Date(journal.createdAt).toLocaleDateString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{journal.content}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
