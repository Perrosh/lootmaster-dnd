import { Item, CityStats } from "../types";

type GeminiAction =
  | "lookupItemOnWiki"
  | "lookupCityStats"
  | "generateCityMagicInventory";

async function callGeminiApi<T>(
  action: GeminiAction,
  payload: Record<string, unknown>
): Promise<T | null> {
  try {
    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        payload
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Errore API Gemini:", data);
      return null;
    }

    return data.result as T;
  } catch (error) {
    console.error("Chiamata API Gemini fallita:", error);
    return null;
  }
}

export async function lookupItemOnWiki(
  itemName: string
): Promise<Partial<Item>[] | null> {
  return await callGeminiApi<Partial<Item>[]>("lookupItemOnWiki", {
    itemName
  });
}

export async function lookupCityStats(
  cityName: string
): Promise<Partial<CityStats> | null> {
  return await callGeminiApi<Partial<CityStats>>("lookupCityStats", {
    cityName
  });
}

export async function generateCityMagicInventory(
  cityName: string,
  stats: CityStats,
  counts: { minor: number; medium: number; major: number }
): Promise<Partial<Item>[] | null> {
  return await callGeminiApi<Partial<Item>[]>("generateCityMagicInventory", {
    cityName,
    stats,
    counts
  });
}