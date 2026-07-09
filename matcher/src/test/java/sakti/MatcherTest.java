package sakti;

import com.machinezoo.sourceafis.FingerprintMatcher;
import com.machinezoo.sourceafis.FingerprintTemplate;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class MatcherTest {

    @Test
    void parsesBinaryPgm() {
        byte[] header = "P5\n3 2\n255\n".getBytes();
        byte[] px = {10, 20, 30, 40, 50, 60};
        Pgm p = Pgm.parse(concat(header, px));
        assertEquals(3, p.width);
        assertEquals(2, p.height);
        assertEquals(6, p.pixels.length);
        assertEquals(10, p.pixels[0] & 0xff);
        assertEquals(60, p.pixels[5] & 0xff);
    }

    @Test
    void rejectsNonPgm() {
        assertThrows(RuntimeException.class, () -> Pgm.parse("not an image".getBytes()));
    }

    @Test
    void rejectsTruncatedPixels() {
        byte[] data = concat("P5\n4 4\n255\n".getBytes(), new byte[]{1, 2, 3});
        assertThrows(IllegalArgumentException.class, () -> Pgm.parse(data));
    }

    // Exercises the real SourceAFIS API path (image -> template -> serialize -> match)
    // so a breaking API/dependency change fails the build. Uses a synthetic ridge
    // pattern; asserts API sanity, not biometric accuracy.
    @Test
    void buildsTemplateAndRoundTrips() {
        byte[] pgm = syntheticRidgePgm(200, 200);
        FingerprintTemplate t = Matcher.templateFrom(pgm);
        byte[] serialized = t.toByteArray();
        assertTrue(serialized.length > 0, "template should serialize");
        FingerprintTemplate restored = new FingerprintTemplate(serialized);
        double score = new FingerprintMatcher(t).match(restored);
        assertTrue(score >= 0.0 && !Double.isNaN(score), "self-match score must be finite/non-negative");
    }

    // Real biometric check — only runs when FP_SAMPLE points to a real .pgm capture.
    // Skipped in CI/Docker build (no biometric fixture committed).
    @Test
    void realFingerprintSelfMatchIsStrong() throws Exception {
        String path = System.getenv("FP_SAMPLE");
        assumeTrue(path != null && Files.exists(Paths.get(path)), "set FP_SAMPLE to a real .pgm to run");
        byte[] pgm = Files.readAllBytes(Paths.get(path));
        FingerprintTemplate t = Matcher.templateFrom(pgm);
        double self = new FingerprintMatcher(t).match(t);
        assertTrue(self > 40.0, "self-match of a real print should exceed threshold, got " + self);
    }

    static byte[] syntheticRidgePgm(int w, int h) {
        byte[] header = ("P5\n" + w + " " + h + "\n255\n").getBytes();
        byte[] px = new byte[w * h];
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                double v = 128 + 110 * Math.sin((x * 0.35) + 2.0 * Math.sin(y * 0.06));
                px[y * w + x] = (byte) Math.max(0, Math.min(255, (int) v));
            }
        }
        return concat(header, px);
    }

    static byte[] concat(byte[] a, byte[] b) {
        byte[] c = new byte[a.length + b.length];
        System.arraycopy(a, 0, c, 0, a.length);
        System.arraycopy(b, 0, c, a.length, b.length);
        return c;
    }
}
