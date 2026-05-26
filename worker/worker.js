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

// ============================================================================
// INLINE DATA (was cars.json + knowledge.json)
// Edit these objects directly to update car entries or general knowledge.
// ============================================================================
console.log("DEPLOYED VERSION: 2026-05-26-NEW-PROMPT");
const carsKnowledgeBase = {
  "_meta": {
    "version": "1.0",
    "last_updated": "2026-05-25",
    "note": "Add entries as you spot patterns. Match strings are lowercase substrings."
  },
  "cars": {
    "honda_civic_8th_gen": {
      "match": [
        "honda civic"
      ],
      "years": [
        2006,
        2007,
        2008,
        2009,
        2010,
        2011
      ],
      "engine": "1.8L R18 or 2.0L K20 (Si)",
      "common_problems": [
        {
          "issue": "Cracked engine block (2.0L Si)",
          "frequency": "documented",
          "cost_range": "$3,000+"
        },
        {
          "issue": "AC compressor failure",
          "frequency": "common 100k+",
          "cost_range": "$800-1,200"
        },
        {
          "issue": "Rear tire wear from alignment",
          "frequency": "common",
          "cost_range": "$100 alignment + tires"
        }
      ],
      "watch_for": [
        "Service history",
        "Tire wear pattern",
        "AC blows cold",
        "Si motor for block cracks"
      ],
      "good_first_car": true,
      "first_car_reason": "Cheap to fix, parts everywhere, easy to drive",
      "reliability_score": "8/10",
      "market_notes": "Si commands premium. Manuals worth more. Watch for modded ones."
    },
    "honda_civic_modern": {
      "match": [
        "honda civic"
      ],
      "years": [
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021,
        2022
      ],
      "engine": "1.8L R18 / 2.0L / 1.5T L15B (16+)",
      "common_problems": [
        {
          "issue": "1.5T fuel dilution in oil",
          "frequency": "common in cold climates",
          "cost_range": "monitor + frequent oil changes"
        },
        {
          "issue": "Infotainment glitches",
          "frequency": "common 16-18",
          "cost_range": "software update"
        },
        {
          "issue": "AC condenser failures",
          "frequency": "common",
          "cost_range": "$600-900"
        }
      ],
      "watch_for": [
        "Oil level above max = fuel dilution",
        "Infotainment responsiveness",
        "AC works on hot day"
      ],
      "good_first_car": true,
      "first_car_reason": "Reliable, cheap to own, good safety scores",
      "reliability_score": "8/10",
      "market_notes": "Holds value well. Si and Type R command premiums. 1.5T avoid for first car if you're in a cold climate."
    },
    "honda_accord": {
      "match": [
        "honda accord"
      ],
      "years": [
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017
      ],
      "engine": "2.4L K24 or 3.5L J35 V6",
      "common_problems": [
        {
          "issue": "V6 VCM oil consumption",
          "frequency": "very common on V6",
          "cost_range": "$2,000+ or VCM Muzzler $100"
        },
        {
          "issue": "Power steering pump leaks",
          "frequency": "common",
          "cost_range": "$400-700"
        },
        {
          "issue": "Starter failure 100k+",
          "frequency": "common",
          "cost_range": "$300-500"
        }
      ],
      "watch_for": [
        "V6 oil consumption",
        "Power steering noise",
        "Starter cranks fast"
      ],
      "good_first_car": true,
      "first_car_reason": "4-cylinder bulletproof, avoid V6 for first car",
      "reliability_score": "8/10",
      "market_notes": "4-cylinder holds value better long-term. V6 is fast but expensive long-term."
    },
    "honda_crv": {
      "match": [
        "honda cr-v",
        "honda crv",
        "honda cr v"
      ],
      "years": [
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.4L K24 or 1.5T L15B (17+)",
      "common_problems": [
        {
          "issue": "1.5T fuel dilution (17-19)",
          "frequency": "very common cold climate",
          "cost_range": "monitor or replace"
        },
        {
          "issue": "AC compressor failure",
          "frequency": "common 100k+",
          "cost_range": "$900-1,300"
        },
        {
          "issue": "Rear differential whine (AWD)",
          "frequency": "common",
          "cost_range": "$200 fluid service prevents"
        }
      ],
      "watch_for": [
        "Oil level high",
        "AC cold",
        "Rear diff service done"
      ],
      "good_first_car": true,
      "first_car_reason": "Safe, tall driving position, AWD options",
      "reliability_score": "8/10",
      "market_notes": "Strong resale. 2.4L preferred over 1.5T."
    },
    "toyota_camry": {
      "match": [
        "toyota camry"
      ],
      "years": [
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021,
        2022
      ],
      "engine": "2.4L / 2.5L / 3.5L V6",
      "common_problems": [
        {
          "issue": "Oil consumption (07-09 2AZ-FE)",
          "frequency": "very common",
          "cost_range": "Toyota extended warranty if eligible, otherwise $4,000 short block"
        },
        {
          "issue": "Water pump leaks",
          "frequency": "common 100k+",
          "cost_range": "$400-600"
        },
        {
          "issue": "VVT-i actuator rattle on cold start",
          "frequency": "common",
          "cost_range": "$200-400"
        }
      ],
      "watch_for": [
        "Oil level (especially 07-09)",
        "Cold start rattle",
        "Service records"
      ],
      "good_first_car": true,
      "first_car_reason": "Bulletproof reputation, cheap parts, easy to insure",
      "reliability_score": "9/10",
      "market_notes": "Hybrid models gaining premium. Avoid 07-09 unless oil issue documented fixed."
    },
    "toyota_corolla": {
      "match": [
        "toyota corolla"
      ],
      "years": [
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021,
        2022
      ],
      "engine": "1.8L 2ZR-FE",
      "common_problems": [
        {
          "issue": "Excessive oil consumption (09-11)",
          "frequency": "common",
          "cost_range": "$200/yr in oil or rebuild"
        },
        {
          "issue": "EVAP system codes",
          "frequency": "common",
          "cost_range": "$100-300"
        },
        {
          "issue": "MAF sensor",
          "frequency": "common 100k+",
          "cost_range": "$150-250"
        }
      ],
      "watch_for": [
        "Oil consumption history",
        "Check engine light",
        "Tire wear"
      ],
      "good_first_car": true,
      "first_car_reason": "Cheapest reliable car to own, easy to learn on",
      "reliability_score": "9/10",
      "market_notes": "Boring but unkillable. Worst-case repairs are cheap."
    },
    "toyota_rav4": {
      "match": [
        "toyota rav4",
        "toyota rav 4"
      ],
      "years": [
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.4L / 2.5L / 3.5L V6 (06-12)",
      "common_problems": [
        {
          "issue": "Transfer case actuator (AWD)",
          "frequency": "common",
          "cost_range": "$400-700"
        },
        {
          "issue": "Oil consumption 2AZ (07-08)",
          "frequency": "common",
          "cost_range": "potentially major"
        },
        {
          "issue": "Sunroof leaks",
          "frequency": "occasional",
          "cost_range": "$200-500 drain cleaning"
        }
      ],
      "watch_for": [
        "AWD engages smoothly",
        "Sunroof drains clear",
        "Headliner stains"
      ],
      "good_first_car": true,
      "first_car_reason": "Reliable, safe, AWD for PNW winters",
      "reliability_score": "8/10",
      "market_notes": "AWD trims hold value. V6 (06-12) is fast and rare."
    },
    "toyota_tacoma": {
      "match": [
        "toyota tacoma"
      ],
      "years": [
        2005,
        2006,
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021,
        2022
      ],
      "engine": "2.7L 2TR-FE / 4.0L 1GR-FE V6 / 3.5L 2GR-FKS",
      "common_problems": [
        {
          "issue": "Frame rust (05-10)",
          "frequency": "common in salt states, less in PNW",
          "cost_range": "if severe, totaled"
        },
        {
          "issue": "Leaf spring sag",
          "frequency": "common",
          "cost_range": "$400-800"
        },
        {
          "issue": "3.5L gas mileage / lacks torque",
          "frequency": "characteristic",
          "cost_range": "n/a"
        }
      ],
      "watch_for": [
        "Frame condition (look underneath)",
        "Service records",
        "Mods - taco crowd loves to lift"
      ],
      "good_first_car": false,
      "first_car_reason": "Way overpriced for what you get. Tacoma tax is real.",
      "reliability_score": "9/10",
      "market_notes": "Holds value better than almost anything. People pay stupid money for old Tacomas. PNW demand is bubble territory."
    },
    "toyota_4runner": {
      "match": [
        "toyota 4runner",
        "toyota 4 runner"
      ],
      "years": [
        2003,
        2004,
        2005,
        2006,
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "4.0L 1GR-FE V6",
      "common_problems": [
        {
          "issue": "Lower ball joints (03-09)",
          "frequency": "common",
          "cost_range": "$500-800"
        },
        {
          "issue": "Pink milkshake (head gasket 4.0L early)",
          "frequency": "rare but serious",
          "cost_range": "$2,500+"
        },
        {
          "issue": "Rear hatch glass actuator",
          "frequency": "common",
          "cost_range": "$300-500"
        }
      ],
      "watch_for": [
        "Coolant condition",
        "Ball joints clunk",
        "Frame underneath"
      ],
      "good_first_car": false,
      "first_car_reason": "Heavy, hard to park, gas guzzler, overpriced",
      "reliability_score": "9/10",
      "market_notes": "Cult following. Holds value almost as well as Tacoma. PNW loves these."
    },
    "subaru_outback": {
      "match": [
        "subaru outback"
      ],
      "years": [
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.5L FB25 or 3.6L EZ36",
      "common_problems": [
        {
          "issue": "Head gasket leaks (older EJ25 pre-2011)",
          "frequency": "very common",
          "cost_range": "$2,000-3,000"
        },
        {
          "issue": "CVT failures (10-14)",
          "frequency": "documented",
          "cost_range": "$5,000+"
        },
        {
          "issue": "Oil consumption FB25 (11-14)",
          "frequency": "common",
          "cost_range": "extended warranty if eligible"
        }
      ],
      "watch_for": [
        "Coolant condition",
        "CVT shudder on takeoff",
        "Oil level"
      ],
      "good_first_car": true,
      "first_car_reason": "AWD perfect for PNW, safe, practical",
      "reliability_score": "7/10",
      "market_notes": "PNW state car. Demand keeps prices high. Avoid 10-14 unless CVT/oil documented."
    },
    "subaru_forester": {
      "match": [
        "subaru forester"
      ],
      "years": [
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.5L FB25 / 2.0XT turbo",
      "common_problems": [
        {
          "issue": "Oil consumption FB25 (11-14)",
          "frequency": "common",
          "cost_range": "monitor + frequent oil changes"
        },
        {
          "issue": "Wheel bearings",
          "frequency": "common 100k+",
          "cost_range": "$300-500 per side"
        },
        {
          "issue": "Cracked windshield (Eyesight cars cost more to replace)",
          "frequency": "common in PNW",
          "cost_range": "$800-1,500 with Eyesight"
        }
      ],
      "watch_for": [
        "Oil level",
        "Wheel bearing hum",
        "Windshield cracks"
      ],
      "good_first_car": true,
      "first_car_reason": "AWD, safe, tall driving position, good visibility",
      "reliability_score": "7/10",
      "market_notes": "Eyesight models hold premium. Manual transmissions getting rare."
    },
    "subaru_impreza_wrx": {
      "match": [
        "subaru wrx",
        "subaru sti",
        "subaru impreza"
      ],
      "years": [
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.0/2.5L turbo (WRX/STI) or 2.0L FB20 (Impreza)",
      "common_problems": [
        {
          "issue": "Ringland failure (WRX 08-14)",
          "frequency": "very common when modded",
          "cost_range": "$3,500-6,000 rebuild"
        },
        {
          "issue": "Blown turbos",
          "frequency": "common with abuse",
          "cost_range": "$1,500-3,000"
        },
        {
          "issue": "Clutch wear (manual)",
          "frequency": "depends on driver",
          "cost_range": "$1,000-1,500"
        }
      ],
      "watch_for": [
        "Modifications (huge red flag)",
        "Smoke at WOT",
        "Clutch slip",
        "Boost gauges = abused"
      ],
      "good_first_car": false,
      "first_car_reason": "Insurance brutal, easily modded, blown by previous owner 90% chance",
      "reliability_score": "5/10",
      "market_notes": "Stock unmodded WRX is unicorn. Most are abused. STI insurance alone disqualifies first car."
    },
    "ford_f150": {
      "match": [
        "ford f-150",
        "ford f150",
        "f-150",
        "ford f 150"
      ],
      "years": [
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021,
        2022
      ],
      "engine": "5.0L Coyote / 3.5L EcoBoost / 2.7L EcoBoost / 3.7L V6",
      "common_problems": [
        {
          "issue": "EcoBoost cam phasers rattle (3.5L 11-16)",
          "frequency": "very common",
          "cost_range": "$2,000-3,500"
        },
        {
          "issue": "5.0L oil consumption (18+)",
          "frequency": "documented",
          "cost_range": "monitor, Ford TSB"
        },
        {
          "issue": "Spark plug breakage 3-valve (early)",
          "frequency": "common older trucks",
          "cost_range": "$800-1,500 if broken"
        }
      ],
      "watch_for": [
        "Cam phaser rattle on cold start",
        "Oil consumption",
        "Bed rust (rare PNW)"
      ],
      "good_first_car": false,
      "first_car_reason": "Insurance, fuel cost, parking nightmare for new driver",
      "reliability_score": "7/10",
      "market_notes": "5.0L Coyote preferred for reliability. EcoBoost more fun but more problems."
    },
    "chevy_silverado": {
      "match": [
        "chevrolet silverado",
        "chevy silverado",
        "gmc sierra"
      ],
      "years": [
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "5.3L LMG/L83/L84 V8 / 6.2L V8 / 4.8L V8",
      "common_problems": [
        {
          "issue": "AFM lifter failure (5.3L 07-14)",
          "frequency": "very common",
          "cost_range": "$2,500-5,000"
        },
        {
          "issue": "Oil consumption AFM",
          "frequency": "common",
          "cost_range": "AFM delete $1,000 or rebuild"
        },
        {
          "issue": "Transmission shudder (8L90 17+)",
          "frequency": "common",
          "cost_range": "fluid service or replace"
        }
      ],
      "watch_for": [
        "AFM delete done",
        "Oil consumption",
        "Tick at idle"
      ],
      "good_first_car": false,
      "first_car_reason": "Same as F-150 \u2014 too much truck, too much gas",
      "reliability_score": "6/10",
      "market_notes": "AFM-deleted trucks worth more to enthusiasts. 4.8L is bulletproof but rare."
    },
    "nissan_altima_sentra": {
      "match": [
        "nissan altima",
        "nissan sentra"
      ],
      "years": [
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.5L QR25DE / 2.0L MR20DE + JATCO CVT",
      "common_problems": [
        {
          "issue": "CVT failure (13-18)",
          "frequency": "very common 80-120k",
          "cost_range": "$3,500-5,000 replacement"
        },
        {
          "issue": "CVT shudder/judder",
          "frequency": "early warning sign",
          "cost_range": "$8,000 if ignored"
        },
        {
          "issue": "Steering lock recall",
          "frequency": "common Altima",
          "cost_range": "Nissan covers"
        }
      ],
      "watch_for": [
        "CVT shudder on highway acceleration",
        "Whining transmission",
        "Service records for CVT fluid"
      ],
      "good_first_car": false,
      "first_car_reason": "CVT is a ticking time bomb. Walk away.",
      "reliability_score": "4/10",
      "market_notes": "Why these are cheap on Marketplace. Be very careful \u2014 they show up under $5k because they're broken."
    },
    "hyundai_kia_theta": {
      "match": [
        "hyundai sonata",
        "hyundai santa fe",
        "hyundai tucson",
        "kia optima",
        "kia sorento",
        "kia sportage"
      ],
      "years": [
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019
      ],
      "engine": "2.0T / 2.4L Theta II GDI",
      "common_problems": [
        {
          "issue": "Theta II engine failure (rod knock)",
          "frequency": "VERY common \u2014 class action",
          "cost_range": "Hyundai/Kia warranty extension covers"
        },
        {
          "issue": "Excessive oil consumption",
          "frequency": "very common",
          "cost_range": "leads to engine failure"
        },
        {
          "issue": "KSDS (Knock Sensor Detection System) update",
          "frequency": "mandatory recall",
          "cost_range": "free at dealer"
        }
      ],
      "watch_for": [
        "KSDS update completed at dealer",
        "Engine knock at idle",
        "Oil consumption",
        "Service records"
      ],
      "good_first_car": true,
      "first_car_reason": "ONLY if KSDS update is done and no oil consumption documented",
      "reliability_score": "5/10",
      "market_notes": "If engine fails, Hyundai/Kia must replace under settlement. Verify KSDS update before buying. Skip ones without records."
    },
    "jeep_wrangler": {
      "match": [
        "jeep wrangler"
      ],
      "years": [
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "3.8L EGH / 3.6L Pentastar / 2.0T Hurricane",
      "common_problems": [
        {
          "issue": "Death wobble (steering)",
          "frequency": "common after lifts",
          "cost_range": "$500-1,500 steering parts"
        },
        {
          "issue": "Pentastar oil cooler leak",
          "frequency": "very common 3.6L",
          "cost_range": "$600-900"
        },
        {
          "issue": "Soft top leaks/tears",
          "frequency": "wear item",
          "cost_range": "$500-1,500"
        }
      ],
      "watch_for": [
        "Death wobble at 50-60mph",
        "Oil cooler weep",
        "Top condition",
        "Mod evidence"
      ],
      "good_first_car": false,
      "first_car_reason": "Rolls over easy, soft top theft, mods galore",
      "reliability_score": "6/10",
      "market_notes": "Holds value insanely well. JL (18+) better than JK. Avoid heavily modded ones."
    },
    "bmw_3series": {
      "match": [
        "bmw 328i",
        "bmw 335i",
        "bmw 330i",
        "bmw 320i",
        "bmw 325i",
        "bmw 3 series",
        "bmw 3-series"
      ],
      "years": [
        2006,
        2007,
        2008,
        2009,
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020
      ],
      "engine": "N52 / N54 / N55 / B58 / N20",
      "common_problems": [
        {
          "issue": "N54 high-pressure fuel pump failure (335i)",
          "frequency": "very common",
          "cost_range": "$1,500 covered under extended warranty"
        },
        {
          "issue": "Oil filter housing gasket leak",
          "frequency": "very common all models",
          "cost_range": "$400-800"
        },
        {
          "issue": "Valve cover gasket leak",
          "frequency": "very common",
          "cost_range": "$300-600"
        },
        {
          "issue": "N20 timing chain (12-15)",
          "frequency": "documented failure",
          "cost_range": "$4,000-6,000"
        }
      ],
      "watch_for": [
        "Oil leaks everywhere",
        "HPFP code (335i)",
        "Service records mandatory",
        "Timing chain rattle"
      ],
      "good_first_car": false,
      "first_car_reason": "Maintenance will bankrupt a new driver",
      "reliability_score": "5/10",
      "market_notes": "Cheap to buy, expensive to own. Annual repair costs $1,500-3,500. Only buy with full BMW service records."
    },
    "vw_jetta_golf": {
      "match": [
        "volkswagen jetta",
        "vw jetta",
        "volkswagen golf",
        "vw golf",
        "volkswagen passat",
        "vw passat"
      ],
      "years": [
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020
      ],
      "engine": "2.0T TSI / 1.8T / 2.5L / 1.4T",
      "common_problems": [
        {
          "issue": "Timing chain tensioner (2.0T)",
          "frequency": "common before 2015",
          "cost_range": "$1,500-3,000 if it slips"
        },
        {
          "issue": "Carbon buildup on intake valves",
          "frequency": "common all GDI",
          "cost_range": "$500-800 walnut blast"
        },
        {
          "issue": "Water pump leaks",
          "frequency": "common",
          "cost_range": "$600-900"
        }
      ],
      "watch_for": [
        "Timing chain rattle on cold start",
        "Service records",
        "Carbon buildup at 80k+"
      ],
      "good_first_car": false,
      "first_car_reason": "German maintenance cost trap",
      "reliability_score": "6/10",
      "market_notes": "Fun to drive, expensive long-term. Avoid pre-2015 2.0T unless tensioner done."
    },
    "mazda_3": {
      "match": [
        "mazda 3",
        "mazda3"
      ],
      "years": [
        2010,
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "2.0L / 2.5L SkyActiv",
      "common_problems": [
        {
          "issue": "Clutch slave cylinder (manual)",
          "frequency": "common",
          "cost_range": "$400-600"
        },
        {
          "issue": "AC condenser failure (rocks crack it)",
          "frequency": "common",
          "cost_range": "$600-900"
        },
        {
          "issue": "Rust on rear wheel wells (older models)",
          "frequency": "common in salt states",
          "cost_range": "varies"
        }
      ],
      "watch_for": [
        "Wheel well rust (mostly older)",
        "AC works",
        "Clutch feel if manual"
      ],
      "good_first_car": true,
      "first_car_reason": "Underrated reliable, fun to drive, safe, good fuel economy",
      "reliability_score": "8/10",
      "market_notes": "Undervalued vs Civic/Corolla. Better driving experience than either."
    },
    "ford_mustang": {
      "match": [
        "ford mustang"
      ],
      "years": [
        2011,
        2012,
        2013,
        2014,
        2015,
        2016,
        2017,
        2018,
        2019,
        2020,
        2021
      ],
      "engine": "3.7L V6 / 5.0L Coyote V8 / 2.3T EcoBoost",
      "common_problems": [
        {
          "issue": "5.0L oil pan leak",
          "frequency": "common",
          "cost_range": "$600-900"
        },
        {
          "issue": "Tick noise (5.0L)",
          "frequency": "common",
          "cost_range": "monitor or rebuild $4,000+"
        },
        {
          "issue": "Differential whine (8.8 rear)",
          "frequency": "common",
          "cost_range": "$1,000+"
        }
      ],
      "watch_for": [
        "Modifications (huge red flag)",
        "Tire condition (burnout abuse)",
        "Tick at idle"
      ],
      "good_first_car": false,
      "first_car_reason": "Insurance brutal, rear-wheel drive in PNW rain, temptation to drive stupid",
      "reliability_score": "7/10",
      "market_notes": "5.0L GT holds value. V6 is bargain transport. Modded ones avoid."
    }
  }
};

const generalKnowledge = {
  "_meta": {
    "version": "1.0",
    "last_updated": "2026-05-25",
    "purpose": "General car-buying intelligence baked into every Gemini call for grounded answers."
  },
  "pricing_intelligence": {
    "data_hierarchy": "Use cars.json market_notes first. Then NHTSA + research. PNW prices typically 5-10% above national.",
    "negotiation_norms": {
      "typical_off_ask": "10-15% off asking is normal in private party",
      "opening_offer": "15-20% below ask is reasonable starting position",
      "walk_away_threshold": "If seller won't budge 8% on a car priced at market, there's a reason"
    },
    "value_traps": [
      "Cars priced 25%+ below market = scam, salvage hidden, or major mechanical issue",
      "Cars priced 20%+ above market = seller thinks rare/clean, often disconnected from reality",
      "Round numbers ($5,000, $10,000) = seller open to negotiation",
      "Specific numbers ($5,750) = seller did research, less wiggle room"
    ],
    "pnw_regional_adjustments": {
      "awd_premium": "AWD vehicles command 10-15% premium in PNW vs national",
      "subaru_tax": "Subarus 10-20% above book value due to local demand",
      "tacoma_bubble": "Tacomas 15-25% above book \u2014 pure demand-driven, not condition",
      "convertibles_discount": "Convertibles 10-15% below national due to climate"
    }
  },
  "scam_framework": {
    "high_confidence_scam_signals": [
      "Price 30%+ below market for similar listings",
      "Seller refuses VIN or asks 'why do you need it'",
      "Seller wants to ship car / can't meet in person",
      "Photos look professional or watermarked (stolen from dealer)",
      "Vague description, copy-pasted boilerplate",
      "Seller pushes urgency: 'first come first serve', 'leaving country'",
      "Title is in someone else's name with vague explanation",
      "Seller asks for deposit / wire / Zelle / gift cards",
      "Email contact only, won't text or call",
      "Story doesn't add up (low miles, perfect condition, dirt cheap, in a hurry)",
      "Listing posted in multiple cities at once"
    ],
    "medium_confidence_signals": [
      "Only 1-2 exterior photos, no interior",
      "Photos taken at night or in poor lighting (hiding damage)",
      "No engine bay photos",
      "Mileage suspiciously low for year (unless documented)",
      "Multiple Marketplace listings under different names",
      "Seller has zero or new profile"
    ],
    "specific_scams": {
      "stolen_vehicle": "Title in seller's name but they bought it 'last week' or 'inherited'. Check NMVTIS ($4-10) \u2014 catches title washing that Carfax misses.",
      "odometer_rollback": "Wear inconsistent with miles. Pedals worn smooth, steering wheel shiny, seat bolsters torn. Cross-check service records.",
      "flood_car": "Musty smell, water lines in trunk under spare tire, corrosion on under-dash wiring, mismatched interior pieces.",
      "salvage_rebuild": "Mismatched body panels, fresh paint on hood/fenders, hood pins, gaps in panel alignment, airbag light recently 'fixed'."
    }
  },
  "mileage_intelligence": {
    "annual_thresholds": {
      "low": "Under 7,500/year",
      "average": "10,000-15,000/year",
      "high": "15,000+/year"
    },
    "realistic_lifespan_by_brand": {
      "toyota_honda_lexus_acura": "250,000-300,000+ miles",
      "mazda_subaru": "200,000-250,000 miles (Subaru gasket issues)",
      "ford_chevy_half_ton_trucks": "200,000+ miles",
      "bmw_mercedes_audi_vw": "150,000-200,000 before repair costs exceed value",
      "nissan_cvt": "100,000-150,000 before CVT failure dominates",
      "british_luxury": "120,000-150,000 tops"
    },
    "quality_over_quantity": [
      "130k highway miles often better than 80k stop-and-go city",
      "Low-mileage cars that sat are often worse (seals dry, rubber cracks)",
      "8-year-old car with 25k miles = suspicious unless documented garage queen"
    ]
  },
  "title_brand_severity_guide": {
    "clean": {
      "meaning": "No reported issues",
      "verdict_default": "Normal"
    },
    "salvage": {
      "meaning": "Insurance totaled, not rebuilt",
      "verdict_default": "PASS unless major discount and pre-purchase inspection"
    },
    "rebuilt": {
      "meaning": "Salvage that's been repaired and re-titled",
      "verdict_default": "INSPECT FIRST, expect 30-50% discount, hard to insure/finance"
    },
    "flood": {
      "meaning": "Water damage",
      "verdict_default": "PASS \u2014 electrical problems forever"
    },
    "lemon_buyback": {
      "meaning": "Manufacturer repurchased due to chronic issues",
      "verdict_default": "PASS or massive discount"
    },
    "odometer_rollback": {
      "meaning": "Mileage discrepancy",
      "verdict_default": "PASS"
    },
    "junk": {
      "meaning": "Declared unrepairable",
      "verdict_default": "PASS \u2014 parts car only"
    }
  },
  "ownership_cost_reality": {
    "aaa_2025_total_annual": "$11,577 average for new car (depreciation, fuel, insurance, maintenance, fees)",
    "annual_repair_costs_by_class": {
      "japanese_economy": "$400-800/yr (Civic, Corolla, Camry)",
      "japanese_suv_truck": "$600-1,200/yr (Tacoma, 4Runner, RAV4)",
      "american_truck": "$800-1,500/yr",
      "german_luxury": "$1,500-3,500/yr (BMW, Audi, MB) \u2014 one repair can wipe value",
      "korean_modern": "$500-1,000/yr",
      "british_luxury": "$2,500-5,000+/yr (Jag, Land Rover)"
    },
    "first_year_budget_rule": "Vehicle should be no more than 50% of total first-year transportation budget",
    "emergency_repair_threshold": "AAA: 64M Americans would need to borrow $500-600 for unexpected car repair. Recommend $1,000-2,000 maintenance reserve before any used car purchase."
  },
  "first_car_criteria": {
    "ideal_attributes": [
      "Mid-size sedan or compact SUV",
      "5-star NHTSA overall safety rating",
      "Electronic stability control (mandatory 2012+)",
      "Side curtain airbags",
      "Naturally aspirated engine (turbos get driven hard)",
      "Automatic transmission (manual ok if learning)",
      "Reliable brand \u2014 Toyota, Honda, Mazda top tier",
      "Sub-$15k to limit damage if totaled",
      "Insurance under $1,500/year for teen",
      "Parts available at any auto parts store",
      "Boring enough not to encourage speeding"
    ],
    "best_models": [
      "Honda Civic 2012-2019",
      "Toyota Corolla 2014+",
      "Mazda 3 2014+",
      "Toyota Camry 2012+",
      "Honda Accord 2013+ (4-cyl only)",
      "Subaru Impreza/Crosstrek 2017+",
      "Hyundai Elantra 2017+ (KSDS done)",
      "Subaru Forester 2014+"
    ],
    "worst_first_cars": [
      "Anything over 300hp",
      "BMW 3-series (maintenance bankruptcy)",
      "Subaru WRX/STI (insurance + abuse history)",
      "Mustang/Camaro/Challenger (insurance + RWD in rain)",
      "Lifted trucks (rollover risk + visibility)",
      "Convertibles (theft + crash structure)",
      "Anything with title brand other than clean",
      "Nissan with CVT 2013-2018",
      "Anything modded by previous owner"
    ]
  },
  "common_problems_by_system": {
    "engine_red_flags": [
      "Blue smoke at startup = valve seals",
      "White smoke continuous = head gasket / coolant",
      "Black smoke = running rich, sensor issue",
      "Tick that goes away when warm = lifter, monitor",
      "Tick that gets worse = serious",
      "Rattle on cold start = timing chain tensioner (common BMW, VW)"
    ],
    "transmission_red_flags": [
      "CVT shudder on highway pull = early failure (Nissan, Subaru, Honda)",
      "Hard 1-2 shift = solenoid",
      "Delayed engagement in drive/reverse = pump or low fluid",
      "DCT hesitation off the line = clutch wear (VW, Ford)"
    ],
    "suspension_red_flags": [
      "Death wobble at 50-60mph (Jeep) = steering components",
      "Clunk over bumps = ball joints, sway bar links",
      "Pull to one side = alignment or worn parts",
      "Uneven tire wear = alignment or worn suspension"
    ],
    "electrical_red_flags": [
      "Multiple warning lights on = check before buying",
      "Battery less than 2 years old + parasitic drain = expensive to diagnose",
      "Aftermarket stereo/lighting = previous owner messed with wiring"
    ],
    "cooling_red_flags": [
      "Brown/rusty coolant = neglected",
      "Oil in coolant = head gasket",
      "Coolant in oil (milky dipstick) = head gasket"
    ]
  },
  "pnw_regional_context": {
    "climate": "Wet but mild. Rust is less common than salt states. Cracked windshields very common from highway debris.",
    "common_lifted_trucks": "PNW has heavy lift culture. Lifted F-150/Silverado/Tacoma listings everywhere \u2014 most are abused offroad.",
    "tacoma_bubble": "PNW Tacoma demand is extreme. 15-year-old Tacomas selling for what new ones cost in other states.",
    "subaru_culture": "Subaru is the regional default. Outback/Forester demand keeps prices high.",
    "salt_air_coastal": "Coastal cars (Bellingham, Anacortes, coast) can have early rust",
    "wet_climate_concerns": "Sunroof drains clog. Convertible tops leak. Wheel bearings die from constant wet."
  },
  "voice_norms": {
    "say": [
      "Walk away",
      "Get a pre-purchase inspection",
      "Check the title in person",
      "Run the VIN through NMVTIS ($4)",
      "Test drive at highway speed",
      "Check service records"
    ],
    "do_not_say": [
      "Unleash",
      "Elevate",
      "Transform",
      "Bespoke",
      "Comprehensive",
      "Ultimate",
      "Game-changing",
      "Synergy",
      "Robust"
    ],
    "tone": "Talk like a friend texting. Short sentences. Contractions. Honest. Slight regional flavor okay (PNW, Snohomish County)."
  },
  "pre_purchase_inspection_guide": {
    "what_a_ppi_covers": "$100-200 at independent shop. Codes pulled, lift inspection, brakes/suspension/leaks checked, test drive.",
    "red_flag_findings": [
      "Active engine codes (not just history)",
      "Frame damage / rust through",
      "Active oil leaks",
      "Suspension wear beyond normal",
      "Brake pads under 30%",
      "Tires under 4/32 tread",
      "Differential whine, transmission slip",
      "Hidden body work (paint thickness gauge reveals)"
    ],
    "when_to_skip_ppi": "Never. Even on a $3,000 car. $150 PPI saves you from $3,000 mistake."
  }
};

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
// IN-MEMORY RATE LIMIT
// Resets when the isolate restarts (every few hours under low traffic).
// Good enough to prevent runaway costs without KV complexity.
// ============================================================================

const rateLimitStore = new Map();

function checkRateLimit(ip) {
  if (!ip) return { ok: true, remaining: RATE_LIMIT_PER_DAY };

  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;

  // Cleanup old entries (different day) periodically
  if (rateLimitStore.size > 1000) {
    for (const k of rateLimitStore.keys()) {
      if (!k.endsWith(today)) rateLimitStore.delete(k);
    }
  }

  const count = rateLimitStore.get(key) ?? 0;

  if (count >= RATE_LIMIT_PER_DAY) {
    return { ok: false, remaining: 0 };
  }

  rateLimitStore.set(key, count + 1);
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

  const limit = checkRateLimit(ip);
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
CRITICAL: Use the EXACT key names below. Do NOT use "verdict", "asking_price", "market_value", "prior_offenses", or "mikey_note" — those are FORBIDDEN. The correct keys are: subject, grade, gradeBurn, asking, fairLow, fairHigh, priceVerdict, watch, note, sellerMessage.
{
  "subject": "YEAR MAKE MODEL · MILEAGE mi (e.g. '2017 Honda Civic LX · 87,400 mi')",
  "grade": "A+ | A | A- | B+ | B | B- | C+ | C | C- | D+ | D | F",
  "gradeBurn": "ONE punchy sentence explaining the grade. Honest, casual, specific. Like a one-liner you'd text a friend. Max 20 words.",
  "asking": ${price},
  "fairLow": <number — low end of fair private-party price for this car/mileage/condition in PNW>,
  "fairHigh": <number — high end of fair price>,
  "priceVerdict": "Underpriced | Fair | Overpriced",
  "watch": [
    "3-5 specific problems pulled from research + NHTSA",
    "Each item is one line, specific, actionable",
    "Include rough repair cost when known"
  ],
  "note": "4-6 sentences. Casual. Honest. Reference specific data. Suggest one thing to check at inspection. End with a real action — usually an offer amount or a walk-away.",
  "sellerMessage": "A polite message to send the seller via Marketplace. 2-4 sentences. Use the watch items and fair price as leverage. End with a specific cash offer amount. Sound like a real buyer texting, not corporate. Example: 'Hey — interested in the Civic. I noticed [specific concern from watch list]. Comparable ones around here are listing $X-Y. I can pick up this week with cash for $Z. Let me know.'"
}

GRADING RUBRIC:
- A: Great deal. Reliable car, fair or underpriced, no major red flags. Buy.
- B: Solid. Minor concerns or slightly overpriced, but a normal used car deal.
- C: Mixed. Worth inspecting but has real problems — pricing, reliability, or trust.
- D: Risky. Overpriced, problematic model, or red flags in the listing.
- F: Walk away. Likely scam, salvage, or known disaster car. Hard pass.

RULES:
- If listing seems fake (stolen photos, sketchy low price, copy-paste vague description): grade F.
- Market value: trust research notes when present. PNW prices skew slightly higher.
- Watch list: prefer real NHTSA + research data over guessing.
- If asking > 15% over fairHigh, priceVerdict is "Overpriced" and grade drops at least one letter.
- If asking < fairLow by 10%+ and listing looks legit, priceVerdict is "Underpriced".
- Subject MUST include mileage if mentioned in listing.
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
