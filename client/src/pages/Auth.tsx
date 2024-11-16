import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import { Input } from "../components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { useToast } from "../hooks/use-toast";
import useSWR from "swr";

const authSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(20, "Username must be less than 20 characters"),
});

export default function Auth() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { data: user, error } = useSWR('/api/auth/me');

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !error) {
      setLocation("/");
    }
  }, [user, error, setLocation]);

  const form = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      username: "",
    },
  });

  const handleAuthError = (error: any) => {
    let title = "Authentication Error";
    let description = "An unexpected error occurred. Please try again.";

    if (error.message === "Username already taken") {
      title = "Username Unavailable";
      description = "This username is already taken. Please choose another one.";
    } else if (error.message.includes("Network")) {
      title = "Connection Error";
      description = "Please check your internet connection and try again.";
    }

    toast({
      title,
      description,
      variant: "destructive",
    });
  };

  async function onSubmit(values: z.infer<typeof authSchema>) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, none: "none" }), // Add dummy password field
      });

      if (res.ok) {
        setLocation("/");
      } else {
        const data = await res.json();
        throw new Error(data.message || "Authentication failed");
      }
    } catch (error) {
      handleAuthError(error);
    } finally {
      setIsLoading(false);
    }
  }

  if (user && !error) {
    return null; // Don't render anything while redirecting
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-900 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-black/50 border-purple-500">
        <CardHeader>
          <CardTitle className="text-center text-2xl text-white">
            Begin Your Quest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white">Choose Your Username</FormLabel>
                    <FormControl>
                      <Input {...field} className="border-purple-500" placeholder="Enter username to start" />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700"
                disabled={isLoading}
              >
                {isLoading ? "Entering the Realm..." : "Begin Journey"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
