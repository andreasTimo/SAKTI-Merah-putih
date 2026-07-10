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
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

/**
 * SAKTI fingerprint matcher — SourceAFIS 1:1 verification.
 *
 * Matching stays in memory for speed, while serialized SourceAFIS templates are
 * persisted as SQLite BLOBs. Raw fingerprint images are never persisted.
 */
public class Matcher {
    static final Gson GSON = new Gson();
    static final double DEFAULT_THRESHOLD = envDouble("MATCH_THRESHOLD", 40.0); // SourceAFIS: FMR 0.01%
    // The CS9711 emits a small 68x118 frame; SourceAFIS finds usable minutiae only
    // when told a low DPI (it then upscales to its internal 500 DPI). Empirically
    // ~150 extracts rich minutiae; 500 finds none. Calibrate per sensor on hardware.
    static final int SENSOR_DPI = (int) envDouble("SENSOR_DPI", 150);

    // Touch-ID-style guided enrollment: a tap that already scores >= REDUNDANT_SCORE
    // against an enrolled area is "already covered"; enrollment is complete once
    // TARGET_AREAS distinct areas are stored.
    static final double REDUNDANT_SCORE = envDouble("REDUNDANT_SCORE", 60.0);
    static final int TARGET_AREAS = (int) envDouble("TARGET_AREAS", 8);

    // memberId -> list of enrolled templates (multi-template). Ephemeral.
    static final Map<String, List<FingerprintTemplate>> STORE = new ConcurrentHashMap<>();
    static TemplateStore TEMPLATE_STORE;

    public static void main(String[] args) throws IOException {
        TEMPLATE_STORE = TemplateStore.openFromEnv();
        try {
            for (Map.Entry<String, List<byte[]>> entry : TEMPLATE_STORE.loadAll().entrySet()) {
                List<FingerprintTemplate> templates = new ArrayList<>();
                for (byte[] bytes : entry.getValue()) templates.add(new FingerprintTemplate(bytes));
                STORE.put(entry.getKey(), templates);
            }
        } catch (Exception e) {
            throw new IOException("cannot load biometric templates: " + e.getMessage(), e);
        }
        int port = (int) envDouble("MATCHER_PORT", 8090);
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/health", Matcher::health);
        server.createContext("/enroll", Matcher::enroll);
        server.createContext("/enroll-tap", Matcher::enrollTap);
        server.createContext("/verify", Matcher::verify);
        server.createContext("/diagnostics/member", Matcher::memberDiagnostics);
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("[matcher] SourceAFIS 1:1 matcher on :" + port
                + " (SQLite template BLOBs, threshold " + DEFAULT_THRESHOLD + ", dpi " + SENSOR_DPI + ")");
    }

    static void health(HttpExchange ex) throws IOException {
        int totalTemplates = 0;
        for (List<FingerprintTemplate> v : STORE.values()) totalTemplates += v.size();
        JsonObject o = new JsonObject();
        o.addProperty("service", "sakti-matcher");
        o.addProperty("storage", "SQLite BLOB (persistent testing storage)");
        o.addProperty("templateFormat", TemplateStore.FORMAT);
        o.addProperty("templateFormatVersion", TemplateStore.FORMAT_VERSION);
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
            List<FingerprintTemplate> stored = STORE.computeIfAbsent(memberId, k -> new ArrayList<>());
            synchronized (stored) {
                int start = stored.size();
                for (int i = 0; i < templates.size(); i++) {
                    TEMPLATE_STORE.append(memberId, start + i, templates.get(i).toByteArray());
                    stored.add(templates.get(i));
                }
            }
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("memberId", memberId);
            o.addProperty("templatesAdded", templates.size());
            o.addProperty("templatesTotal", stored.size());
            send(ex, 200, o);
        } catch (Exception e) {
            send(ex, 500, err(e.getMessage()));
        }
    }

    // POST /enroll-tap { memberId, image }  -> Touch-ID-style guided enrollment.
    // Stores the tap only if it covers a NEW area (best overlap with existing
    // templates < REDUNDANT_SCORE). Returns coverage progress + completion.
    static void enrollTap(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { send(ex, 405, err("POST only")); return; }
        try {
            JsonObject body = readJson(ex);
            String memberId = optString(body, "memberId");
            if (memberId == null || memberId.isBlank() || !body.has("image")) {
                send(ex, 400, err("memberId and image required"));
                return;
            }
            FingerprintTemplate probe = templateFrom(Base64.getDecoder().decode(body.get("image").getAsString()));
            List<FingerprintTemplate> areas = STORE.computeIfAbsent(memberId, k -> new ArrayList<>());

            double best = 0.0;
            boolean redundant;
            int total;
            synchronized (areas) {
                if (!areas.isEmpty()) {
                    FingerprintMatcher matcher = new FingerprintMatcher(probe);
                    for (FingerprintTemplate a : areas) best = Math.max(best, matcher.match(a));
                }
                redundant = !areas.isEmpty() && best >= REDUNDANT_SCORE;
                if (!redundant) {
                    TEMPLATE_STORE.append(memberId, areas.size(), probe.toByteArray());
                    areas.add(probe);
                }
                total = areas.size();
            }

            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("memberId", memberId);
            o.addProperty("accepted", !redundant);
            o.addProperty("reason", redundant ? "redundant" : "new-area");
            o.addProperty("bestScore", best);
            o.addProperty("templatesTotal", total);
            o.addProperty("target", TARGET_AREAS);
            o.addProperty("coverageComplete", total >= TARGET_AREAS);
            send(ex, 200, o);
        } catch (Exception e) {
            send(ex, 500, err(e.getMessage()));
        }
    }

    // POST /verify { memberId, image | images[], threshold? }  -> 1:1 match.
    // Accepts a single image or a burst (swipe). Score = max over every probe
    // frame against every stored template of the member.
    static void verify(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) { send(ex, 405, err("POST only")); return; }
        try {
            JsonObject body = readJson(ex);
            String memberId = optString(body, "memberId");
            double threshold = body.has("threshold") ? body.get("threshold").getAsDouble() : DEFAULT_THRESHOLD;
            List<FingerprintTemplate> candidates = STORE.get(memberId);
            if (candidates == null) { send(ex, 404, err("member not enrolled: " + memberId)); return; }

            List<byte[]> probeImages = imagesFrom(body);
            if (probeImages.isEmpty()) { send(ex, 400, err("image or non-empty images[] required")); return; }

            double best = 0.0;
            for (byte[] img : probeImages) {
                FingerprintMatcher matcher = new FingerprintMatcher(templateFrom(img));
                for (FingerprintTemplate candidate : candidates) {
                    best = Math.max(best, matcher.match(candidate));
                }
            }
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
            o.addProperty("memberId", memberId);
            o.addProperty("score", best);
            o.addProperty("threshold", threshold);
            o.addProperty("matched", best >= threshold);
            o.addProperty("probeFrames", probeImages.size());
            o.addProperty("comparedTemplates", candidates.size());
            send(ex, 200, o);
        } catch (Exception e) {
            send(ex, 500, err(e.getMessage()));
        }
    }

    // Read-only calibration summary. It deliberately returns aggregate scores only,
    // never raw frames, minutiae, or serialized templates.
    static void memberDiagnostics(HttpExchange ex) throws IOException {
        if (!"GET".equals(ex.getRequestMethod())) { send(ex, 405, err("GET only")); return; }
        String memberId = queryParam(ex, "memberId");
        List<FingerprintTemplate> templates = STORE.get(memberId);
        if (memberId == null || memberId.isBlank()) { send(ex, 400, err("memberId required")); return; }
        if (templates == null) { send(ex, 404, err("member not enrolled: " + memberId)); return; }

        List<Double> scores = new ArrayList<>();
        synchronized (templates) {
            for (int i = 0; i < templates.size(); i++) {
                FingerprintMatcher matcher = new FingerprintMatcher(templates.get(i));
                for (int j = i + 1; j < templates.size(); j++) scores.add(matcher.match(templates.get(j)));
            }
        }
        Collections.sort(scores);
        int acceptedPairs = 0;
        for (double score : scores) if (score >= DEFAULT_THRESHOLD) acceptedPairs++;

        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        o.addProperty("memberId", memberId);
        o.addProperty("templates", templates.size());
        o.addProperty("pairs", scores.size());
        o.addProperty("threshold", DEFAULT_THRESHOLD);
        o.addProperty("pairsAtThreshold", acceptedPairs);
        o.addProperty("bestPairScore", scores.isEmpty() ? 0.0 : scores.get(scores.size() - 1));
        o.addProperty("medianPairScore", scores.isEmpty() ? 0.0 : scores.get(scores.size() / 2));
        send(ex, 200, o);
    }

    // Accept either "image" (single base64 PGM) or "images":[...] (a swipe burst).
    static List<byte[]> imagesFrom(JsonObject body) {
        List<byte[]> out = new ArrayList<>();
        if (body.has("images") && body.get("images").isJsonArray()) {
            for (JsonElement el : body.getAsJsonArray("images")) {
                out.add(Base64.getDecoder().decode(el.getAsString()));
            }
        } else if (body.has("image") && !body.get("image").isJsonNull()) {
            out.add(Base64.getDecoder().decode(body.get("image").getAsString()));
        }
        return out;
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

    static String queryParam(HttpExchange ex, String key) {
        String query = ex.getRequestURI().getRawQuery();
        if (query == null) return null;
        for (String entry : query.split("&")) {
            String[] pair = entry.split("=", 2);
            if (pair.length == 2 && key.equals(pair[0])) {
                return java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }
        return null;
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
