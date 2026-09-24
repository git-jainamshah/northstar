import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from ibkr_model import Quote


class QuotesTest(unittest.TestCase):
    def quote(self, mode=1):
        q = Quote(dict(symbol='MES', currency='USD'), 'Futures', 'US')
        q.set_mode(mode)
        q.tick('bid', 100, 1000)
        q.tick('ask', 101, 1001)
        return q

    def test_only_live_fresh_two_sided_quotes_qualify(self):
        self.assertTrue(self.quote().snapshot(True, 1002)['eligibleForSimulation'])
        for mode in (0, 2, 3, 4):
            self.assertFalse(self.quote(mode).snapshot(True, 1002)['eligibleForSimulation'])

    def test_last_tick_does_not_refresh_old_bid_ask(self):
        q = self.quote()
        q.tick('last', 102, 200000)
        self.assertEqual(q.snapshot(True, 200000)['status'], 'stale')
        self.assertEqual(len(q.history), 1)

    def test_disconnect_and_invalid_books_block_simulation(self):
        q = self.quote()
        self.assertFalse(q.snapshot(False, 1002)['eligibleForSimulation'])
        for value in (-1, 0, float('nan'), float('inf'), 105):
            q.tick('bid', value, 1002)
            self.assertFalse(q.snapshot(True, 1003)['eligibleForSimulation'])

    def test_mode_change_clears_old_values_and_history(self):
        q = self.quote(3)
        q.set_mode(1)
        self.assertEqual(q.history, [])
        self.assertIsNone(q.snapshot(True, 1002)['bid'])

    def test_missing_entitlement_not_cleared_by_delayed_tick(self):
        q = self.quote(3)
        q.error = 'Subscription required'
        q.tick('last', 101, 1002)
        self.assertEqual(q.error, 'Subscription required')

    def test_quote_gap_is_not_interpolated(self):
        q = self.quote()
        q.tick('bid', 101, 200000)
        q.tick('ask', 102, 200001)
        self.assertTrue(any(p['value'] is None for p in q.history))

    def test_history_is_bounded(self):
        q = self.quote()
        for t in range(2000, 2005000, 1000):
            q.tick('bid', 100, t)
            q.tick('ask', 101, t)
        self.assertLessEqual(len(q.history), 1800)


if __name__ == '__main__':
    unittest.main()
