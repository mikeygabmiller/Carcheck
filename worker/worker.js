
const kv = await Deno.openKv();
const G_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

async function callG(prompt, key, temp = 0.4) {
  const res = await fetch(`${G_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: temp, 
        responseMimeType: "application/json" 
      }
    })
  });
  const d = await res.json();
  const t = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return t.replace(/```json|```/g, "").trim();
}

async function getNHTSA(type, v) {
  try {
    const url = `https://api.nhtsa.gov/${type}/${type}ByVehicle?make=${v.make}&model=${v.model}&modelYear=${v.year}`;
    const res = await fetch(url);
    const d = await res.json();
    return (d.results || []).slice(0, 3);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const ip = req.headers.get("cf-connecting-ip") || "anon";
  const {value: ct} = await kv.get(["rate", ip, new Date().getDay()]);
  if ((ct ?? 0) >= 20) return new Response("Limit hit", { status: 429 });
  await kv.set(["rate", ip, new Date().getDay()], (ct ?? 0) + 1, { expireIn: 86400000 });

  try {
    const key = Deno.env.get("GEMINI_API_KEY");
    const { listing, price } = await req.json();
    
    const info = JSON.parse(await callG(`Extract year, make, model as JSON from: ${listing}`, key, 0));
    const [rec, comp] = await Promise.all([getNHTSA('recalls', info), getNHTSA('complaints', info)]);

    const car = Object.values(CARS).find(c => 
      c.m.some(m => `${info.make} ${info.model}`.toLowerCase().includes(m))
    );

    const p = `Act as Mikey, PNW mechanic apprentice. 
    Voice: Text style, short, honest. No corporate talk.
    Car: ${info.year} ${info.make} ${info.model} ($${price})
    Listing: ${listing}
    Expert Notes: ${JSON.stringify(car)}
    Recalls: ${JSON.stringify(rec)}
    Output JSON: {verdict, asking_price, market_value, reliability, scam_risk, first_car, prior_offenses, mikey_note}`;

    const r = await callG(p, key);
    return new Response(r, { headers: { "Content-Type": "application/json", ...CORS } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});const CARS = {
  honda: {
    m: ["honda civic", "honda accord"],
    engine: "1.8L / 2.4L / 1.5T",
    problems: "Oil dilution on 1.5T, AC failure, V6 oil burn",
    first_car: "Yes, 4-cyl only",
    score: "8/10"
  },
  toyota: {
    m: ["toyota camry", "toyota corolla", "rav4"],
    engine: "2.5L / 1.8L",
    problems: "Oil consumption 07-09, Water pumps",
    first_car: "Yes, bulletproof",
    score: "9/10"
  },
  subaru: {
    m: ["subaru outback", "forester", "crosstrek"],
    engine: "2.5L Boxer",
    problems: "Head gaskets pre-2011, CVT shudder",
    first_car: "Yes, great for PNW",
    score: "7/10"
  }
};Object.assign(CARS, {
  trucks: {
    m: ["f150", "silverado", "tacoma"],
    problems: "EcoBoost cam phasers, Frame rust, AFM lifters",
    first_car: "No, gas and insurance too high",
    score: "7/10"
  },
  nissan: {
    m: ["altima", "sentra", "rogue"],
    problems: "CVT transmission failure is guaranteed",
    first_car: "No, avoid",
    score: "3/10"
  }
});
