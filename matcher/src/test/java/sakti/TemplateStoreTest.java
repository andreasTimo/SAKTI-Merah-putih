package sakti;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

class TemplateStoreTest {
    @Test
    void persistsBinaryTemplateBlob() throws Exception {
        var path = Files.createTempDirectory("sakti-template-store").resolve("templates.sqlite");
        TemplateStore store = TemplateStore.open(path);
        byte[] template = {0, 1, 2, (byte) 255};
        store.append("test-001", 0, template);

        Map<String, List<byte[]>> restored = store.loadAll();
        assertEquals(1, restored.get("test-001").size());
        assertArrayEquals(template, restored.get("test-001").get(0));
    }
}
