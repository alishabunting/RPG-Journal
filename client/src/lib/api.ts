import { toast } from "../hooks/use-toast";

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  try {
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`API Error: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    toast({
      title: "Error",
      description: (error as Error).message,
      variant: "destructive",
    });
    throw error;
  }
}
