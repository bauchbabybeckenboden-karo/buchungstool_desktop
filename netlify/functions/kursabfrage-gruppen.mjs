// Proxy: liest die Kurs-Gruppen (Wochentag, Uhrzeit, Termine), die
// manuell entfernten Pausentermine (bbb_removed_v2) und die
// Kursstart/Kursstunde-Notizen (bbb_notizen_v2) aus der Kursabfrage-App
// (eigener Netlify Blob Store, anderes Projekt). Läuft serverseitig,
// damit der Browser nicht durch CORS blockiert wird.
//
// Alle drei werden gebraucht, um wie in den Google-Apps-Scripten (siehe
// kv2FindeDurchlauf/keFindeDurchlauf) den echten nächsten Kurs-Durchlauf
// zu bestimmen: die Notizen markieren "voraussichtlicher Kursstart" /
// "voraussichtlich letzte Kursstunde", removed listet einzelne
// Pausentermine innerhalb dieses Zeitraums, die NICHT als echte
// Kursstunde zählen.

const BASE_URL = "https://bauch-baby-beckenboden-kursabfrage.netlify.app/.netlify/functions/blob-get";

async function holeBlob(key) {
  const res = await fetch(`${BASE_URL}?key=${key}`);
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`Kursabfrage antwortete mit ${res.status} für ${key}`);
  return res.json();
}

export default async () => {
  try {
    const [gruppen, removed, notizen] = await Promise.all([
      holeBlob("bbb_gruppen_v2"),
      holeBlob("bbb_removed_v2"),
      holeBlob("bbb_notizen_v2"),
    ]);
    return new Response(JSON.stringify({ gruppen, removed, notizen }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/.netlify/functions/kursabfrage-gruppen" };
