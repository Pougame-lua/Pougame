
import { getStore } from "@netlify/blobs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const store = getStore("pougame-public-games");

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function validId(id) {
  return typeof id === "string" &&
    /^[A-Za-z0-9_-]{8,20}$/.test(id.trim());
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    // Evitar publicaciones desde otros sitios web
    const origin = request.headers.get("origin");

    if (origin && new URL(origin).host !== url.host) {
      return json({ error: "Origen no permitido." }, 403);
    }

    // PUBLICAR
    if (request.method === "POST") {
      const body = await request.json();

      const name = String(body.name || "MiJuego").slice(0, 50);
      const html = body.html;

      if (typeof html !== "string" ||
          !html.startsWith("<!DOCTYPE html>")) {
        return json({ error: "HTML no válido." }, 400);
      }

      if (new TextEncoder().encode(html).length > 4 * 1024 * 1024) {
        return json({ error: "El juego supera el límite de 4 MB." }, 413);
      }

      let id;
      let token;
      let saved = false;

      for (let attempt = 0; attempt < 5; attempt++) {
        id = randomBytes(7).toString("base64url");
        token = randomBytes(32).toString("hex");

        const result = await store.set(
          id,
          JSON.stringify({
            name,
            html,
            tokenHash: hashToken(token).toString("hex"),
            createdAt: new Date().toISOString()
          }),
          { onlyIfNew: true }
        );

        if (result.modified) {
          saved = true;
          break;
        }
      }

      if (!saved) {
        return json({ error: "No se pudo generar un enlace único." }, 500);
      }

      return json({ id, token });
    }

    const id = url.searchParams.get("id");

    if (!validId(id)) {
      return json({ error: "Identificador no válido." }, 400);
    }

    const saved = await store.get(id, { type: "json" });

    if (!saved) {
      return new Response("Juego no encontrado.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // ABRIR JUEGO PÚBLICO
    if (request.method === "GET") {
      return new Response(saved.html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    // DESPUBLICAR
    if (request.method === "DELETE") {
      const body = await request.json();
      const token = String(body.token || "");

      if (!/^[a-f0-9]{64}$/.test(token)) {
        return json({ error: "Permiso no válido." }, 403);
      }

      const expected = Buffer.from(saved.tokenHash, "hex");
      const received = hashToken(token);

      if (expected.length !== received.length ||
          !timingSafeEqual(expected, received)) {
        return json({ error: "No tienes permiso para eliminar este juego." }, 403);
      }

      await store.delete(id);

      return json({ success: true });
    }

    return json({ error: "Método no permitido." }, 405);

  } catch (error) {
    console.error(error);
    return json({ error: "Error interno del servidor." }, 500);
  }
}
