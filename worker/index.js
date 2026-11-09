// Jokko sur Cloudflare : sert l'appli (dossier dist) et, pour les liens partagés sur WhatsApp, Facebook ou TikTok
// (?v= vitrine, ?modele= modèle du Studio), écrit l'aperçu du lien : nom de l'entreprise ou du modèle + sa photo.
// Les données viennent de Supabase avec la clé publique (les mêmes fonctions que la page publique).
const SUPABASE_URL = "https://solocpbqtqlxdfpjiewm.supabase.co";
const SUPABASE_KEY = "sb_publishable_F4muHE1khamqagY3Qa1GuQ_lK91p252";
const STORAGE = `${SUPABASE_URL}/storage/v1/object/public`;

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const price = (n) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} F`;
/** Texte sûr dans un attribut (pas de guillemets ni de chevrons). */
const clean = (t) => String(t ?? "").replace(/["<>]/g, "").slice(0, 200);

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  return res.ok ? res.json() : null;
}

/** Ce que WhatsApp, Facebook et TikTok affichent quand on colle le lien. */
async function preview(url) {
  const slug = url.searchParams.get("v");
  if (slug) {
    const v = await rpc("vitrine_public", { p_slug: slug }).catch(() => null);
    if (!v) return null;
    const first = v.modeles?.[0];
    const article = (v.articles ?? []).find((a) => a.photo);
    const image = first ? `${STORAGE}/galerie/${first.image}` : article ? `${STORAGE}/vitrine/${article.photo}` : null;
    const count = (v.articles?.length ?? 0) + (v.modeles?.length ?? 0);
    const what = v.modeles?.length ? "modèles" : "articles";
    return {
      title: v.nom,
      description: v.bio || `${count} ${what} avec leurs prix${v.ville ? ` · ${v.ville}` : ""}. Commandez directement sur WhatsApp.`,
      image,
    };
  }
  const id = url.searchParams.get("modele");
  if (id) {
    const m = await rpc("modele_public", { p_id: id, p_shop: url.searchParams.get("t") }).catch(() => null);
    if (!m) return null;
    const name = cap(m.habit || String(m.titre).split(" · ")[0]);
    return {
      title: m.atelier ? `${name} · ${m.atelier}` : name,
      description: `${cap(m.tissu)}. Regardez le modèle et commandez-le sur WhatsApp.`,
      image: `${STORAGE}/galerie/${m.image}`,
    };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const shared = url.pathname === "/" && (url.searchParams.has("v") || url.searchParams.has("modele"));
    if (!shared) return env.ASSETS.fetch(request);
    const [page, card] = await Promise.all([
      env.ASSETS.fetch(new Request(new URL("/", url), request)),
      preview(url).catch(() => null),
    ]);
    if (!card) return page;
    const set = (_, value) => ({ element: (el) => el.setAttribute("content", clean(value)) });
    let rewriter = new HTMLRewriter()
      .on("title", { element: (el) => el.setInnerContent(clean(card.title)) })
      .on('meta[property="og:title"]', set(0, card.title))
      .on('meta[property="og:description"]', set(0, card.description))
      .on('meta[name="description"]', set(0, card.description))
      .on('meta[property="og:url"]', set(0, url.toString()))
      .on('meta[name="twitter:title"]', set(0, card.title))
      .on('meta[name="twitter:description"]', set(0, card.description));
    if (card.image) {
      rewriter = rewriter
        .on('meta[property="og:image"]', set(0, card.image))
        .on('meta[name="twitter:image"]', set(0, card.image))
        .on('meta[property="og:image:width"]', { element: (el) => el.remove() })
        .on('meta[property="og:image:height"]', { element: (el) => el.remove() })
        .on('meta[property="og:image:alt"]', set(0, card.title));
    }
    const out = rewriter.transform(page);
    const headers = new Headers(out.headers);
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(out.body, { status: out.status, headers });
  },
};
