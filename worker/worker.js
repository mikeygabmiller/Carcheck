// PART 1: CORE LOGIC
const kv = await Deno.openKv();
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function callGemini(prompt, apiKey, temp = 0.4) {
  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: temp, responseMimeType: "application/json" }
    })
  });
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.replace(/```json|```/g, "").trim();
}

async function fetchNHTSA(type, { year, make, model }) {
  try {
    const url = `https://api.nhtsa.gov/${type}/${type}ByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
    const res = await fetch(url);
    const d = await res.json();
    return (d.results || []).slice(0, 5).map(r => 
      type === 'recalls' ? { camp: r.NHTSACampaignNumber, comp: r.Component, sum: r.Summary?.slice(0, 150) } 
      : { name: r.components, count: 1 }
    );
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const dateKey = new Date().toISOString().slice(0, 10);
  const { value: count } = await kv.get(["rate", ip, dateKey]);
  
  if ((count ?? 0) >= 20) return new Response(JSON.stringify({ error: "Limit hit" }), { status: 429, headers: CORS });
  await kv.set(["rate", ip, dateKey], (count ?? 0) + 1, { expireIn: 86400000 });

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const { listing, price } = await req.json();
    
    const extractPrompt = `Extract year, make, model as JSON: {"year":2010,"make":"Ford","model":"F150"} from: ${listing}`;
    const carInfo = JSON.parse(await callGemini(extractPrompt, apiKey, 0));
    
    const [recalls, complaints] = await Promise.all([
      fetchNHTSA('recalls', carInfo), 
      fetchNHTSA('complaints', carInfo)
    ]);

    const entry = Object.values(carsKnowledgeBase.cars).find(c => 
      c.match.some(m => `${carInfo.make} ${carInfo.model}`.toLowerCase().includes(m)) && 
      (!c.years || c.years.includes(Number(carInfo.year)))
    );

    const prompt = `Act as Mikey, PNW mechanic. Text style. 
      Listing: ${listing} ($${price}). Car: ${carInfo.year} ${carInfo.make} ${carInfo.model}.
      Knowledge: ${JSON.stringify(entry)}. 
      Scams: ${JSON.stringify(generalKnowledge.scam_framework.high_confidence_scam_signals)}.
      Recalls: ${JSON.stringify(recalls)}. 
      Output exactly JSON: {verdict, asking_price, market_value, reliability, scam_risk, first_car, prior_offenses, mikey_note}`;

    const report = await callGemini(prompt, apiKey);
    return new Response(report, { headers: { "Content-Type": "application/json", ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});
// PART 2: HONDA & TOYOTA
const carsKnowledgeBase = { "cars": {
  "honda_civic": { "match": ["honda civic"], "years": [2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022], "engine": "1.8L / 2.0L / 1.5T", "reliability_score": "8/10", "good_first_car": true, "common_problems": [{"issue":"Cracked block (06-09)","cost":"$3k"},{"issue":"AC Failure","cost":"$1k"}], "watch_for": ["Service history", "AC cold"] },
  "honda_accord": { "match": ["honda accord"], "years": [2008,2009,2010,2011,2012,2013,2014,2015,2016,2017], "engine": "2.4L / 3.5L V6", "reliability_score": "8/10", "good_first_car": true, "common_problems": [{"issue":"V6 Oil consumption","cost":"$2k"}], "watch_for": ["Starter failure", "Power steering leaks"] },
  "toyota_camry": { "match": ["toyota camry"], "years": [2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], "engine": "2.4L / 2.5L", "reliability_score": "9/10", "good_first_car": true, "common_problems": [{"issue":"Oil consumption (07-09)","cost":"$4k"}], "watch_for": ["Cold start rattle"] },
  "toyota_corolla": { "match": ["toyota corolla"], "years": [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], "engine": "1.8L", "reliability_score": "9/10", "good_first_car": true, "common_problems": [{"issue":"Oil consumption (09-11)","cost":"minor"}], "watch_for": ["Check engine light"] },
  "toyota_tacoma": { "match": ["toyota tacoma"], "years": [2005,2006,2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], "engine": "V6 / 2.7L", "reliability_score": "9/10", "good_first_car": false, "market_notes": "Tacoma tax is real. Very expensive in PNW.", "watch_for": ["Frame rust"] }
}};
// PART 3: SUBARU & OTHERS
Object.assign(carsKnowledgeBase.cars, {
  "subaru_outback": { "match": ["subaru outback"], "years": [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], "engine": "2.5L", "reliability_score": "7/10", "good_first_car": true, "common_problems": [{"issue":"Head gaskets (pre-2011)","cost":"$2.5k"},{"issue":"CVT failure (10-14)","cost":"$5k"}] },
  "subaru_forester": { "match": ["subaru forester"], "years": [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019], "engine": "2.5L", "reliability_score": "7/10", "good_first_car": true, "watch_for": ["Oil consumption", "Wheel bearings"] },
  "ford_f150": { "match": ["ford f150", "f-150"], "years": [2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020], "engine": "5.0L / 3.5L EcoBoost", "reliability_score": "7/10", "good_first_car": false, "common_problems": [{"issue":"Cam phaser rattle","cost":"$3k"}] },
  "nissan_altima": { "match": ["nissan altima", "sentra"], "years": [2013,2014,2015,2016,2017,2018,2019], "engine": "2.5L", "reliability_score": "4/10", "good_first_car": false, "common_problems": [{"issue":"CVT Failure","cost":"$4k"}], "market_notes": "Avoid. Transmission is a ticking time bomb." }
});
// PART 4: GENERAL KNOWLEDGE
const generalKnowledge = {
  "scam_framework": {
    "high_confidence_scam_signals": [
      "Price 30% below market", "Refuses VIN", "Wants to ship car", "Professional watermarked photos", "Asks for deposit via Zelle", "Story doesn't add up"
    ]
  },
  "pricing": { "pnw_adjustments": "AWD +15%, Tacomas +20%, Subarus +15%" }
};
