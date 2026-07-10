package sakti;

/** Minimal parser for binary PGM (P5) grayscale images — the format the capture agent emits. */
public final class Pgm {
    public final int width;
    public final int height;
    public final byte[] pixels; // width*height grayscale bytes, exactly what SourceAFIS wants

    public Pgm(int width, int height, byte[] pixels) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
    }

    public static Pgm parse(byte[] data) {
        int[] pos = {0};
        String magic = token(data, pos);
        if (!"P5".equals(magic)) {
            throw new IllegalArgumentException("not a binary PGM (P5): got '" + magic + "'");
        }
        int width = Integer.parseInt(token(data, pos));
        int height = Integer.parseInt(token(data, pos));
        Integer.parseInt(token(data, pos)); // maxval, unused
        int need = width * height;
        int start = pos[0];
        if (data.length - start < need) {
            throw new IllegalArgumentException("pixel data too short: have " + (data.length - start) + ", need " + need);
        }
        byte[] px = new byte[need];
        System.arraycopy(data, start, px, 0, need);
        return new Pgm(width, height, px);
    }

    // Reads the next header token, skipping whitespace/comments, then consumes ONE trailing
    // whitespace byte (the single separator that precedes the binary pixel block).
    private static String token(byte[] d, int[] p) {
        while (p[0] < d.length) {
            int c = d[p[0]] & 0xff;
            if (c == '#') {
                while (p[0] < d.length && d[p[0]] != '\n') p[0]++;
            } else if (Character.isWhitespace(c)) {
                p[0]++;
            } else {
                break;
            }
        }
        StringBuilder sb = new StringBuilder();
        while (p[0] < d.length && !Character.isWhitespace(d[p[0]] & 0xff)) {
            sb.append((char) (d[p[0]] & 0xff));
            p[0]++;
        }
        if (p[0] < d.length && Character.isWhitespace(d[p[0]] & 0xff)) p[0]++;
        return sb.toString();
    }
}
