package sakti;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Persistent binary-template store for testing. Raw fingerprint images are never stored here. */
final class TemplateStore {
    static final String FORMAT = "sourceafis-template";
    static final int FORMAT_VERSION = 1;

    private final String url;

    private TemplateStore(String url) {
        this.url = url;
    }

    static TemplateStore openFromEnv() throws IOException {
        String path = System.getenv().getOrDefault("TEMPLATE_DB_PATH", "./data/sakti-fingerprint.sqlite");
        return open(Path.of(path));
    }

    static TemplateStore open(Path path) throws IOException {
        try {
            Path db = path.toAbsolutePath();
            Path parent = db.getParent();
            if (parent != null) Files.createDirectories(parent);
            Class.forName("org.sqlite.JDBC");
            TemplateStore store = new TemplateStore("jdbc:sqlite:" + db);
            store.initialize();
            return store;
        } catch (SQLException | ClassNotFoundException e) {
            throw new IOException("cannot open biometric template store: " + e.getMessage(), e);
        }
    }

    private void initialize() throws SQLException {
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.executeUpdate("""
                CREATE TABLE IF NOT EXISTS fingerprint_templates (
                  member_id TEXT NOT NULL,
                  template_index INTEGER NOT NULL,
                  template_format TEXT NOT NULL,
                  format_version INTEGER NOT NULL,
                  template_blob BLOB NOT NULL,
                  created_at TEXT NOT NULL,
                  PRIMARY KEY (member_id, template_index)
                )
                """);
        }
    }

    Map<String, List<byte[]>> loadAll() throws SQLException {
        Map<String, List<byte[]>> loaded = new LinkedHashMap<>();
        try (Connection c = DriverManager.getConnection(url);
             PreparedStatement q = c.prepareStatement("""
                 SELECT member_id, template_blob FROM fingerprint_templates
                 WHERE template_format = ? AND format_version = ?
                 ORDER BY member_id, template_index
                 """)) {
            q.setString(1, FORMAT);
            q.setInt(2, FORMAT_VERSION);
            try (ResultSet rows = q.executeQuery()) {
                while (rows.next()) {
                    loaded.computeIfAbsent(rows.getString(1), ignored -> new ArrayList<>()).add(rows.getBytes(2));
                }
            }
        }
        return loaded;
    }

    synchronized void append(String memberId, int index, byte[] template) throws SQLException {
        try (Connection c = DriverManager.getConnection(url);
             PreparedStatement insert = c.prepareStatement("""
                 INSERT INTO fingerprint_templates
                 (member_id, template_index, template_format, format_version, template_blob, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 """)) {
            insert.setString(1, memberId);
            insert.setInt(2, index);
            insert.setString(3, FORMAT);
            insert.setInt(4, FORMAT_VERSION);
            insert.setBytes(5, template);
            insert.setString(6, Instant.now().toString());
            insert.executeUpdate();
        }
    }
}
