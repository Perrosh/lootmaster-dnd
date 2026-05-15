import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

function extractJsonText(response) {
  const text = response.text;

  if (!text) {
    return null;
  }

  return text.trim();
}

async function lookupItemOnWiki(itemName) {
  const prompt = `
Sei un assistente esperto di Pathfinder Prima Edizione (PF1e). 
L'utente vuole conoscere il prezzo di mercato in Monete d'Oro (gp/mo) dell'oggetto "${itemName}".

Consulta ESCLUSIVAMENTE regole e manuali di Pathfinder 1e, per esempio PRD, Golarion Wiki, Core Rulebook.
IGNORA oggetti di D&D 5e o Pathfinder 2e.

Restituisci un ARRAY di oggetti JSON, anche se c'è un solo risultato, con questi campi:
- name: nome dell'oggetto
- price: valore numerico in Monete d'Oro, usa decimali per frazioni, es. 0.5 per 5 monete d'argento
- weight: peso, stringa, es. "1 kg"
- category: una tra "Armi", "Armature", "Equipaggiamento", "Oggetti Magici", "Altro"
- description: breve descrizione in italiano

Se trovi più varianti o oggetti simili, includili tutti, massimo 5.
Se non trovi l'oggetto, scrivi {"error": "not_found"}.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  const text = extractJsonText(response);

  if (!text) {
    return null;
  }

  const data = JSON.parse(text);

  if (data.error) {
    return null;
  }

  return Array.isArray(data) ? data : [data];
}

async function lookupCityStats(cityName) {
  const prompt = `
Sei un assistente esperto di Pathfinder Prima Edizione.
L'utente vuole conoscere le statistiche economiche della città di "${cityName}" nel mondo di Golarion, Varisia, Pathfinder 1e.

Restituisci un oggetto JSON con questi campi:
- name: nome ufficiale della città
- type: categoria, es. Small Town, Large City, Metropolis
- baseValue: Valore Base in mo, Base Value
- purchaseLimit: Limite di Acquisto in mo, Purchase Limit
- minorItems: dadi per oggetti magici minori, es. "3d4"
- mediumItems: dadi per oggetti magici medi, es. "2d4"
- majorItems: dadi per oggetti magici maggiori, es. "1d6"

Se non trovi la città o non è un insediamento ufficiale di Golarion/Pathfinder, scrivi {"error": "not_found"}.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  const text = extractJsonText(response);

  if (!text) {
    return null;
  }

  const data = JSON.parse(text);

  if (data.error) {
    return null;
  }

  return data;
}

async function generateCityMagicInventory(cityName, stats, counts) {
  const total = counts.minor + counts.medium + counts.major;

  if (total === 0) {
    return [];
  }

  const prompt = `
Sei un assistente esperto di Pathfinder Prima Edizione.
Genera un inventario magico casuale per la città di "${cityName}" (${stats.type}).

DEVI GENERARE ESATTAMENTE QUESTO NUMERO DI OGGETTI, NON UNO DI MENO, NON UNO DI PIÙ:
- OGGETTI MINORI: ${counts.minor}
- OGGETTI MEDI: ${counts.medium}
- OGGETTI MAGGIORI: ${counts.major}

Totale oggetti da generare nell'ARRAY JSON: ${total}

IMPORTANTE:
Ogni oggetto generato deve corrispondere alla rarità richiesta.
Se hai richiesto ${counts.minor} minori, ${counts.medium} medi e ${counts.major} maggiori, l'array finale deve riflettere esattamente queste quantità nel campo "rarity".

Includi oggetti SPECIFICI di Pathfinder 1e.

Ogni oggetto deve avere:
- name: nome completo
- price: prezzo esatto in mo
- weight: peso in kg
- category: "Oggetti Magici"
- description: breve descrizione dell'effetto
- rarity: deve essere esattamente "Minore", "Medio" o "Maggiore"

Restituisci un ARRAY JSON di oggetti. L'array deve avere lunghezza ${total}.
`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json"
    }
  });

  const text = extractJsonText(response);

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Metodo non consentito. Usa POST."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "GEMINI_API_KEY non configurata su Vercel."
    });
  }

  try {
    const { action, payload } = req.body;

    if (!action || !payload) {
      return res.status(400).json({
        error: "Richiesta non valida."
      });
    }

    let result = null;

    if (action === "lookupItemOnWiki") {
      result = await lookupItemOnWiki(payload.itemName);
    } else if (action === "lookupCityStats") {
      result = await lookupCityStats(payload.cityName);
    } else if (action === "generateCityMagicInventory") {
      result = await generateCityMagicInventory(
        payload.cityName,
        payload.stats,
        payload.counts
      );
    } else {
      return res.status(400).json({
        error: "Azione non riconosciuta."
      });
    }

    return res.status(200).json({
      result
    });
  } catch (error) {
    console.error("Errore API Gemini:", error);

    return res.status(500).json({
      error: "Errore interno durante la chiamata a Gemini."
    });
  }
}