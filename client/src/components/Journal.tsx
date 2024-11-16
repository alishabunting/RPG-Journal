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
import { Loader2 } from "lucide-react";

export function Journal() {
  const [entry, setEntry] = useState("");
  const { data: journals } = useSWR("/api/journals");
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!entry.trim()) {
      toast({
        title: "Empty Entry",
        description: "Please write something in your journal",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: entry }),
      });
      
      if (!res.ok) throw new Error("Failed to save journal");
      
      setEntry("");
      await mutate("/api/journals");
      await mutate("/api/quests"); // Refresh quests after new entry
      
      toast({
        title: "Journal Entry Saved",
        description: "Your thoughts have been recorded and new quests await!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save journal entry. Please try again.",
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
            className="min-h-[200px] bg-transparent resize-none"
            disabled={isSubmitting}
          />
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
              </>
            ) : (
              "Record Journey"
            )}
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
              {journal.tags && journal.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {journal.tags.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
