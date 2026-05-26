// MIKEY API - MOBILE SLIM VERSION
const kv = await Deno.openKv();
const G_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type"};

// 1. CAR DATABASE (Common PNW Cars)
const DB = {
  "honda": "Civic/Accord: Reliable. Watch for AC failure and V6 oil burn. 1.5T fuel dilution.",
  "toyota": "Camry/Corolla/RAV4: Bulletproof. 07-09 models burn oil. Tacomas have 'Tacoma Tax'.",
  "subaru": "Outback/Forester: PNW standard. Check head gaskets (pre-2011) and CVT shudder.",
  "nissan": "Altima/Sentra: HARD PASS. CVT transmission is a ticking time bomb.",
  "trucks": "F150/Silverado: Expensive to run. Check cam phasers and AFM lifters."
};

// 2. HELPER: CALL GEMINI
async function askAI(prompt, key) {
  const res = await fetch(`${G_URL}?key=${key}`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})
  });
  const d = await res.json();
  return (d.candidates?.[0]?.content?.parts?.[0]?.text || "").replace(/```json|```/g, "").trim();
}

// 3. MAIN SERVER
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, {headers: CORS});
  const key = Deno.env.get("GEMINI_API_KEY");
  
  try {
    const { listing, price } = await req.json();

    // Identify Car
    const carJSON = await askAI(`Return JSON {"y":year,"m":"make","mod":"model"} for: ${listing}`, key);
    const v = JSON.parse(carJSON);
    
    // Find Expert Notes
    const notes = DB[v.m.toLowerCase()] || "No specific database notes. Use general mechanic knowledge.";

    // Final Report
    const p = `Act as Mikey, a PNW mechanic apprentice. Text style. 
      Listing: ${listing} ($${price}). 
      Car: ${v.y} ${v.m} ${v.mod}.
      Database Notes: ${notes}.
      Rules: No corporate talk. Mention one specific PNW thing. 
      Output JSON: {verdict, asking_price, market_value, reliability, scam_risk, first_car, prior_offenses, mikey_note}`;

    return new Response(await askAI(p, key), {headers:{"Content-Type":"application/json",...CORS}});
  } catch (e) {
    return new Response(JSON.stringify({error: "Paste error or API fail"}), {status:500, headers:CORS});
  }
});
