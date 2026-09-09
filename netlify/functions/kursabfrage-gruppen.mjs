// Proxy: liest die Kurs-Gruppen (Wochentag, Uhrzeit, Termine) aus der
// Kursabfrage-App (eigener Netlify Blob Store, anderes Projekt). Läuft
// serverseitig, damit der Browser nicht durch CORS blockiert wird.

const SOURCE_URL =
  "https://bauch-baby-beckenboden-kursabfrage.netlify.app/.netlify/functions/blob-get?key=bbb_gruppen_v2";

export default async () => {
  try {
    const res = await fetch(SOURCE_URL);
    if (res.status === 404) {
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Kursabfrage antwortete mit ${res.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = await res.text();
    return new Response(data, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/.netlify/functions/kursabfrage-gruppen" };
