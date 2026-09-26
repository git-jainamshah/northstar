"""Public quote state only. Never stores account identifiers or credentials."""
import math
import time


def now_ms():
    return int(time.time() * 1000)


def valid_price(value):
    return isinstance(value, (int, float)) and math.isfinite(value) and 0 < value < 1e20


class Quote:
    def __init__(self, contract, category, region):
        self.meta = dict(contract, category=category, region=region)
        self.mode = 0
        self.values = {}
        self.history = []
        self.error = None

    def set_mode(self, mode):
        if mode != self.mode:
            self.values.clear()
            self.history.clear()
        self.mode = mode

    def tick(self, field, value, timestamp=None):
        timestamp = now_ms() if timestamp is None else timestamp
        self.values[field] = {"value": value if valid_price(value) else None, "receivedAt": timestamp}
        bid, ask = self.values.get('bid', {}), self.values.get('ask', {})
        if field not in ('bid', 'ask'):
            return
        if valid_price(bid.get('value')) and valid_price(ask.get('value')) and bid['value'] <= ask['value'] and timestamp - min(bid['receivedAt'], ask['receivedAt']) <= 120000:
            point = {"time": timestamp, "value": (bid['value'] + ask['value']) / 2}
            if self.history and timestamp - self.history[-1]['time'] > 120000:
                self.history.append({"time": timestamp-1, "value": None})
            if self.history and self.history[-1]['value'] is not None and timestamp // 1000 == self.history[-1]['time'] // 1000:
                self.history[-1] = point
            else:
                self.history.append(point)
            self.history = self.history[-1800:]
        elif self.history and self.history[-1]['value'] is not None:
            self.history.append({"time": timestamp, "value": None})

    def snapshot(self, connected, timestamp):
        fields = {}
        for name in ('bid', 'ask', 'last', 'close', 'bidSize', 'askSize'):
            entry = self.values.get(name, {})
            fields[name] = entry.get('value')
            fields[name + 'ReceivedAt'] = entry.get('receivedAt')
        valid = valid_price(fields['bid']) and valid_price(fields['ask']) and fields['bid'] <= fields['ask']
        book_at = min(fields['bidReceivedAt'], fields['askReceivedAt']) if valid else None
        fresh = bool(connected and valid and max(fields['bidReceivedAt'], fields['askReceivedAt']) <= timestamp and 0 <= timestamp - book_at <= 120000)
        modes = {0: 'unknown', 1: 'live', 2: 'frozen', 3: 'delayed', 4: 'delayed-frozen'}
        status = 'disconnected' if not connected else 'unavailable' if not valid else 'stale' if not fresh else modes.get(self.mode, 'unknown')
        return dict(self.meta, **fields, mode=modes.get(self.mode, 'unknown'), status=status,
                    mid=(fields['bid'] + fields['ask']) / 2 if valid else None,
                    receivedAt=book_at, history=self.history, error=self.error,
                    eligibleForSimulation=fresh and self.mode == 1 and not self.error)
