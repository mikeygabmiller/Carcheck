/**
 * Second Opinion API — Deno Deploy
 *
 * Flow:
 * 1. Receive listing text + price (+ optional VIN) from frontend
 * 2. Rate-limit by IP (20/day) via Deno KV
 * 3. Use Gemini to extract year/make/model
 * 4. Look up car in knowledge base (cars.json)
 * 5. Fetch NHTSA recalls + complaints in parallel
 * 6. (Optional) VIN decode via NHTSA vPIC
 * 7. Send everything to Gemini for final synthesis
 * 8. Return structured JSON to frontend
 */

import carsKnowledgeBase from "./cars.json" with { type: "json" };
import generalKnowledge from "./knowledge.json" with { type: "json" };

// ============================================================================
// CONFIG
// ============================================================================

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RATE_LIMIT_PER_DAY = 20;
const SECONDS_PER_DAY = 60 * 60 * 24;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // lock to your domain in production
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ============================================================================
// KV (Deno's built-in key-value store)
// ============================================================================

const kv = await Deno.openKv();

async function checkRateLimit(ip) {
  if (!ip) return { ok: true, remaining: RATE_LIMIT_PER_DAY };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = ["rate", ip, today];

  const current = await kv.get(key);
  const count = current.value ?? 0;

  if (count >= RATE_LIMIT_PER_DAY) {
    return { ok: false, remaining: 0 };
  }

  await kv.set(key, count + 1, { expireIn: SECONDS_PER_DAY * 1000 });
  return { ok: true, remaining: RATE_LIMIT_PER_DAY - count - 1 };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  // Rate limit by IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    "unknown";

  const limit = await checkRateLimit(ip);
  if (!limit.ok) {
    return jsonResponse(
      { error: "Daily limit hit (20 checks). Try again tomorrow." },
      429,
    );
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "Server missing GEMINI_API_KEY" }, 500);
    }

    const { listing, price, vin = null } = await request.json();

    if (!listing || !price) {
      return jsonResponse({ error: "listing and price required" }, 400);
    }

    // Step 1: Extract year/make/model
    const carInfo = await extractCarInfo(listing, apiKey);

    if (!carInfo.year || !carInfo.make || !carInfo.model) {
      return jsonResponse(
        {
          error:
            "Could not identify the car. Make sure year, make, and model are in the listing.",
        },
        400,
      );
    }

    // Step 2: Knowledge base lookup
    const knowledgeEntry = findKnowledgeEntry(carInfo);

    // Step 3: NHTSA parallel fetch
    const [recalls, complaints] = await Promise.all([
      fetchNHTSARecalls(carInfo),
      fetchNHTSAComplaints(carInfo),
    ]);

    // Step 4: VIN decode if provided
    let vinData = null;
    if (vin && vin.length === 17) {
      vinData = await decodeVIN(vin);
    }

    // Step 5: Synthesize
    const report = await generateReport(
      {
        listing,
        price: Number(price),
        carInfo,
        knowledgeEntry,
        recalls,
        complaints,
        vinData,
      },
      apiKey,
    );

    return jsonResponse(report);
  } catch (err) {
    console.error("Worker error:", err);
    return jsonResponse(
      {
        error: "Something broke on my end. Try again.",
        detail: err.message,
      },
      500,
    );
  }
});

// ============================================================================
// STEP 1: EXTRACT CAR INFO
// ============================================================================

async function extractCarInfo(listing, apiKey) {
  const prompt = `Extract the year, make, and model from this car listing. Return ONLY JSON in this exact format:
{"year": 2008, "make": "BMW", "model": "335i"}

If you can't determine any field, set it to null. No explanation. No markdown.

Listing:
${listing}`;

  const response = await callGemini(prompt, apiKey, { temperature: 0 });
  return parseJSON(response);
}

// ============================================================================
// STEP 2: KNOWLEDGE BASE LOOKUP
// ============================================================================

function findKnowledgeEntry(carInfo) {
  const searchText =
    `${carInfo.year} ${carInfo.make} ${carInfo.model}`.toLowerCase();
  const cars = carsKnowledgeBase.cars;

  for (const [key, entry] of Object.entries(cars)) {
    const matches = entry.match || [];
    const yearMatch = !entry.years || entry.years.includes(Number(carInfo.year));
    const textMatch = matches.some((m) => searchText.includes(m.toLowerCase()));
    if (textMatch && yearMatch) {
      return { key, ...entry };
    }
  }
  return null;
}

// ============================================================================
// STEP 3: NHTSA APIs (free, no key)
// ============================================================================

async function fetchNHTSARecalls({ year, make, model }) {
  try {
    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, 5).map((r) => ({
      campaign: r.NHTSACampaignNumber,
      component: r.Component,
      summary: r.Summary?.substring(0, 200),
      consequence: r.Consequence?.substring(0, 150),
    }));
  } catch (e) {
    console.error("NHTSA recalls failed:", e);
    return [];
  }
}

async function fetchNHTSAComplaints({ year, make, model }) {
  try {
    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
    const res = await fetch(url);
    if (!res.ok) return { total: 0, components: [] };
    const data = await res.json();
    const complaints = data.results || [];
    const componentCounts = {};
    complaints.forEach((c) => {
      const comp = c.components || "Unknown";
      componentCounts[comp] = (componentCounts[comp] || 0) + 1;
    });
    return {
      total: complaints.length,
      components: Object.entries(componentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
    };
  } catch (e) {
    console.error("NHTSA complaints failed:", e);
    return { total: 0, components: [] };
  }
}

async function decodeVIN(vin) {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.Results?.[0];
    if (!result) return null;
    return {
      year: result.ModelYear,
      make: result.Make,
      model: result.Model,
      trim: result.Trim,
      engine: result.DisplacementL
        ? `${result.DisplacementL}L ${result.EngineConfiguration || ""}`.trim()
        : null,
      transmission: result.TransmissionStyle,
      body: result.BodyClass,
      plant: result.PlantCountry,
    };
  } catch (e) {
    console.error("VIN decode failed:", e);
    return null;
  }
}

// ============================================================================
// STEP 5: SYNTHESIS
// ============================================================================

async function generateReport(data, apiKey) {
  const systemPrompt = buildSystemPrompt(data);
  const response = await callGemini(systemPrompt, apiKey, { temperature: 0.4 });
  const parsed = parseJSON(response);
  parsed.sources = buildSources(data);
  return parsed;
}

function buildSystemPrompt(data) {
  const { listing, price, carInfo, knowledgeEntry, recalls, complaints, vinData } = data;
  const gk = generalKnowledge;

  let prompt = `You are Mikey, a 17-year-old mobile detailer in Snohomish County, WA who also does an automotive apprenticeship. You help people figure out if a used car listing is worth buying. You're honest, direct, and you talk like a friend texting — not a salesman, not corporate, not AI.

VOICE RULES:
- Short sentences. Contractions. Mild slang okay.
- No emojis.
- NEVER use: ${gk.voice_norms.do_not_say.join(", ")}.
- You haven't seen the car in person. Always recommend an inspection.
- Be conservative on BUY. When in doubt, INSPECT FIRST.

SCAM FRAMEWORK — high-confidence signals:
${gk.scam_framework.high_confidence_scam_signals.map((s) => `- ${s}`).join("\n")}

PRICING NORMS:
- 10-15% off ask is typical private party
- 25%+ below market = scam, salvage, or major issue
- PNW prices skew 5-10% above national; AWD premium 10-15%; Tacomas 15-25% above book

MILEAGE THRESHOLDS BY BRAND:
- Toyota/Honda/Lexus: 250-300k+ realistic
- Mazda/Subaru: 200-250k
- BMW/Mercedes/Audi/VW: 150-200k before repair cost exceeds value
- Nissan with CVT: 100-150k before CVT failure

TITLE BRAND DEFAULTS:
${Object.entries(gk.title_brand_severity_guide).map(([k, v]) => `- ${k}: ${v.meaning}. Default: ${v.verdict_default}`).join("\n")}

PNW CONTEXT: ${gk.pnw_regional_context.climate} ${gk.pnw_regional_context.tacoma_bubble}

INPUT DATA:

LISTING TEXT:
${listing}

ASKING PRICE: $${price}

IDENTIFIED CAR: ${carInfo.year} ${carInfo.make} ${carInfo.model}
`;

  if (vinData) {
    prompt += `\nVIN DECODED (ground truth from NHTSA):
- Trim: ${vinData.trim || "unknown"}
- Engine: ${vinData.engine || "unknown"}
- Transmission: ${vinData.transmission || "unknown"}
- Body: ${vinData.body || "unknown"}
- Built in: ${vinData.plant || "unknown"}
`;
  }

  if (knowledgeEntry) {
    prompt += `\nMY OWN RESEARCH NOTES on this car (treat as authoritative):
- Engine: ${knowledgeEntry.engine}
- Reliability score: ${knowledgeEntry.reliability_score}
- Good first car? ${knowledgeEntry.good_first_car ? "yes" : "no"} — ${knowledgeEntry.first_car_reason}
- Market notes: ${knowledgeEntry.market_notes}
- Common problems:
${knowledgeEntry.common_problems.map((p) => `  • ${p.issue} (${p.frequency}) — ${p.cost_range || "cost varies"}`).join("\n")}
- What to check at inspection: ${knowledgeEntry.watch_for.join(", ")}
`;
  } else {
    prompt += `\nNOTE: No detailed research notes for this exact model. Use general knowledge but be more conservative on verdicts.\n`;
  }

  if (recalls.length > 0) {
    prompt += `\nNHTSA RECALLS (official US government data):
${recalls.map((r) => `- ${r.campaign} (${r.component}): ${r.summary}`).join("\n")}
`;
  }

  if (complaints.total > 0) {
    prompt += `\nNHTSA OWNER COMPLAINTS: ${complaints.total} total filed with US government.
Top problem categories:
${complaints.components.map((c) => `- ${c.name}: ${c.count} complaints`).join("\n")}
`;
  }

  prompt += `

OUTPUT FORMAT — return ONLY valid JSON in this exact shape, no markdown fences:

{
  "verdict": "BUY" | "PASS" | "INSPECT FIRST",
  "subject": "YEAR MAKE MODEL",
  "location": "City, State" or null,
  "asking_price": ${price},
  "market_value": {
    "estimate": <number — average private party sale price>,
    "delta_text": "$X under" | "$X over" | "fair price",
    "delta_class": "good" | "bad" | "warn"
  },
  "reliability": {
    "score": "X / 10",
    "detail": "short phrase",
    "class": "good" | "bad" | "warn"
  },
  "scam_risk": {
    "level": "LOW" | "MED" | "HIGH",
    "detail": "short phrase",
    "class": "good" | "bad" | "warn"
  },
  "first_car": {
    "verdict": "GOOD FIT" | "HARD NO" | "MAYBE",
    "detail": "short phrase",
    "class": "good" | "bad" | "warn"
  },
  "prior_offenses": [
    "specific problems pulled from research + NHTSA — be precise",
    "3-5 items total"
  ],
  "mikey_note": "4-6 sentences. Casual. Honest. Reference specific data points. Mention one thing to check at inspection. End with a real action the buyer should take."
}

RULES:
- If listing seems fake (stolen photos, sketchy low price, copy-paste vague description): scam_risk HIGH, verdict PASS.
- Market value: trust research notes when present. PNW prices skew slightly higher.
- Prior offenses: prefer real NHTSA + research data over guessing.
- If asking > 15% over your market estimate, market_value.delta_class is "bad".
- Output JSON only. No code fences.`;

  return prompt;
}

function buildSources(data) {
  const sources = [];
  if (data.knowledgeEntry) sources.push("Second Opinion research database");
  if (data.recalls.length > 0) sources.push(`${data.recalls.length} NHTSA recall(s)`);
  if (data.complaints.total > 0) sources.push(`${data.complaints.total} NHTSA owner complaints`);
  if (data.vinData) sources.push("NHTSA vPIC VIN decode");
  if (sources.length === 0) sources.push("AI synthesis from training data");
  return sources;
}

// ============================================================================
// GEMINI HELPERS
// ============================================================================

async function callGemini(prompt, apiKey, options = {}) {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      maxOutputTokens: options.maxTokens ?? 2048,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON parse failed. Raw:", text);
    throw new Error("Gemini returned invalid JSON");
  }
}

// ============================================================================
// RESPONSE HELPER
// ============================================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
