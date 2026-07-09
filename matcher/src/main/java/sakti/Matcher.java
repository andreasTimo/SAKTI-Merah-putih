package sakti;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.machinezoo.sourceafis.FingerprintImage;
import com.machinezoo.sourceafis.FingerprintImageOptions;
import com.machinezoo.sourceafis.FingerprintMatcher;
import com.machinezoo.sourceafis.FingerprintTemplate;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

/**
 * SAKTI fingerprint matcher — SourceAFIS 1:1 verification.
 *
 * Storage is IN-MEMORY only (a ConcurrentHashMap). There is no disk or DB
 * persistence, so every enrolled template is erased when this process stops —
 * exactly the "local cache, cleared when the app dies" behaviour requested for
 * the testing phase. A real database design lands in a later task.
 */
public class Matcher {
    static final Gson GSON = new Gson();
    static final double DEFAULT_THRESHOLD = envDouble("MATCH_THRESHOLD", 40.0); // SourceAFIS: FMR 0.01%
    // The CS9711 emits a small 68x118 frame; SourceAFIS finds usable minutiae only
    // when told a low DPI (it then upscales to its internal 500 DPI). Empirically
    // ~150 extracts rich minutiae; 500 finds none. Calibrate per sensor on hardware.
    static final int SENSOR_DPI = (int) envDouble("SENSOR_DPI", 150);

    // memberId -> list of enrolled templates (multi-template). Ephemeral.
    static final Map<String, List<FingerprintTemplate>> STORE = new ConcurrentHashMap<>();

    public static void main(String[] args) throws IOException {
        int port = (int) envDouble("MATCHER_PORT", 8090);
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/health", Matcher::health);
        server.createContext("/enroll", Matcher::enroll);
        server.createContext("/verify", Matcher::verify);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("[matcher] SourceAFIS 1:1 matcher on :" + port
                + " (in-memory/ephemeral, threshold " + DEFAULT_THRESHOLD + ", dpi " + SENSOR_DPI + ")");
    }

    static void health(HttpExchange ex) throws IOException {
        int totalTemplates = 0;
        for (List<FingerprintTemplate> v : STORE.values()) totalTemplates += v.size();
        JsonObject o = new JsonObject();
        o.addProperty("service", "sakti-matcher");
        o.addProperty("storage", "in-memory (ephemeral)");
        o.addProperty("threshold", DEFAULT_THRESHOLD);
        o.addProperty("enrolledMembers", STORE.size());
        o.addProperty("totalTemplates", totalTemplates);
        send(ex, 200, o);
    }

    // POST /enroll { memberId, images: [pgmBase64, ...] }  -> stores one template per image
    static void enroll(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { send(ex, 405, err("POST only")); return; }
        try {
            JsonObject body = readJson(ex);
            String memberId = optString(body, "memberId");
            JsonArray images = body.has("images") ? body.getAsJsonArray("images") : null;
            if (memberId == null || memberId.isBlank() || images == null || images.size() == 0) {
                send(ex, 400, err("memberId and non-empty images[] required"));
                return;
            }
            List<FingerprintTemplate> templates = new ArrayList<>();
            for (JsonElement el : images) {
                templates.add(templateFrom(Base64.getDecoder().decode(el.getAsString())));
            }
            STORE.merge(memberId, templates, (existing, added) -> {
                existing.addAll(added);
                return existing;
            });
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("memberId", memberId);
            o.addProperty("templatesAdded", templates.size());
            o.addProperty("templatesTotal", STORE.get(memberId).size());
            send(ex, 200, o);
        } catch (Exception e) {
            send(ex, 500, err(e.getMessage()));
        }
    }

    // POST /verify { memberId, image: pgmBase64, threshold? }  -> 1:1 match (max over member's templates)
    static void verify(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { send(ex, 405, err("POST only")); return; }
        try {
            JsonObject body = readJson(ex);
            String memberId = optString(body, "memberId");
            double threshold = body.has("threshold") ? body.get("threshold").getAsDouble() : DEFAULT_THRESHOLD;
            List<FingerprintTemplate> candidates = STORE.get(memberId);
            if (candidates == null) { send(ex, 404, err("member not enrolled: " + memberId)); return; }

            FingerprintTemplate probe = templateFrom(Base64.getDecoder().decode(body.get("image").getAsString()));
            FingerprintMatcher matcher = new FingerprintMatcher(probe);
            double best = 0.0;
            for (FingerprintTemplate candidate : candidates) {
                best = Math.max(best, matcher.match(candidate));
            }
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("memberId", memberId);
            o.addProperty("score", best);
            o.addProperty("threshold", threshold);
            o.addProperty("matched", best >= threshold);
            o.addProperty("comparedTemplates", candidates.size());
            send(ex, 200, o);
        } catch (Exception e) {
            send(ex, 500, err(e.getMessage()));
        }
    }

    /** PGM bytes -> SourceAFIS template. Shared by enroll and verify (and tests). */
    static FingerprintTemplate templateFrom(byte[] imageBytes) {
        Pgm pgm = Pgm.parse(imageBytes);
        FingerprintImage img = new FingerprintImage(
                pgm.width, pgm.height, pgm.pixels, new FingerprintImageOptions().dpi(SENSOR_DPI));
        return new FingerprintTemplate(img);
    }

    // ---- helpers ----
    static JsonObject readJson(HttpExchange ex) throws IOException {
        try (Reader r = new InputStreamReader(ex.getRequestBody(), StandardCharsets.UTF_8)) {
            JsonObject o = GSON.fromJson(r, JsonObject.class);
            if (o == null) throw new IllegalArgumentException("empty or invalid JSON body");
            return o;
        }
    }

    static String optString(JsonObject o, String k) {
        return o.has(k) && !o.get(k).isJsonNull() ? o.get(k).getAsString() : null;
    }

    static JsonObject err(String msg) {
        JsonObject o = new JsonObject();
        o.addProperty("ok", false);
        o.addProperty("error", msg == null ? "error" : msg);
        return o;
    }

    static void send(HttpExchange ex, int code, JsonObject body) throws IOException {
        byte[] b = GSON.toJson(body).getBytes(StandardCharsets.UTF_8);
        Headers h = ex.getResponseHeaders();
        h.add("Content-Type", "application/json");
        h.add("Access-Control-Allow-Origin", "*");
        ex.sendResponseHeaders(code, b.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(b);
        }
    }

    static double envDouble(String k, double d) {
        String v = System.getenv(k);
        try {
            return v == null ? d : Double.parseDouble(v);
        } catch (NumberFormatException e) {
            return d;
        }
    }
}
