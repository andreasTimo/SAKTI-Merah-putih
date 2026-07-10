import tempfile
import unittest

import numpy as np

import sigfm_matcher as matcher


class SigfmMatcherTest(unittest.TestCase):
    def test_template_blob_round_trip(self):
        template = matcher.Template(np.array([[1.5, 2.5]], dtype=np.float32), np.arange(128, dtype=np.float32).reshape((1, 128)))
        restored = matcher.deserialize_template(matcher.serialize_template(template))
        np.testing.assert_array_equal(template.points, restored.points)
        np.testing.assert_array_equal(template.descriptors, restored.descriptors)

    def test_sqlite_store_persists_binary_template(self):
        with tempfile.TemporaryDirectory() as directory:
            store = matcher.TemplateStore(f"{directory}/templates.sqlite")
            template = matcher.Template(np.array([[1.0, 2.0]], dtype=np.float32), np.ones((1, 128), dtype=np.float32))
            store.append("test-member", 0, template)
            self.assertEqual(1, len(store.load()["test-member"]))
