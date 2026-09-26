"""Read-only TWS API pilot. No orders, account queries, credentials or public listener."""
import argparse
import fcntl
import datetime as dt
import json
import logging
import os
from pathlib import Path
import signal
import socket
import threading
import time

from ibapi.client import EClient
from ibapi.wrapper import EWrapper
from ibapi.contract import Contract
from ibkr_model import Quote, now_ms, valid_price

ROOT = Path(__file__).resolve().parents[1]
MESSAGES = {
    200: 'Contract could not be uniquely resolved by IBKR.',
    354: 'Live market data subscription is missing for this instrument.',
    10167: 'Live subscription missing; IBKR may provide delayed data.',
    10168: 'No data entitlement. Delayed data is not available for this request.',
    10089: 'Additional market data subscription is required for API access.',
    10090: 'Some requested market data requires an additional subscription.',
    10091: 'Part of this market data requires an additional subscription; available ticks may still arrive.',
    10197: 'Market data unavailable because another brokerage session is active.',
    326: 'API client ID is already in use.',
    502: 'Cannot reach the gateway API port. Check API settings and login.',
    504: 'Gateway API is not connected.',
    1100: 'Gateway lost its connection to IBKR.',
    1101: 'IBKR connection restored; restarting subscriptions.',
    1102: 'IBKR connection restored; refreshing the local session.',
    2103: 'Market data farm disconnected. Waiting for recovery.',
    2104: 'Market data farm connected.',
}


def contract(**fields):
    result = Contract()
    for key, value in fields.items():
        setattr(result, key, value)
    return result


class Connector(EWrapper, EClient):
    def __init__(self):
        EClient.__init__(self, self)
        self.guard = threading.RLock()
        self.ready = threading.Event()
        self.failed = threading.Event()
        self.quotes = {}
        self.requests = {}
        self.chains = []
        self.option_requested = False
        self.option_day = None
        self.counter = 100
        self.events = []
        self.discovery = {}
        self.last_check = now_ms()

    def next_id(self):
        self.counter += 1
        return self.counter

    def nextValidId(self, orderId):
        self.ready.set()

    def currentTime(self, timestamp):
        self.last_check = now_ms()

    def connectionClosed(self):
        self.ready.clear()
        self.failed.set()

    def error(self, reqId, errorTime, errorCode, errorString, advancedOrderRejectJson=''):
        # Never publish raw gateway errors: they may contain private account details.
        if errorCode in (2106, 2107, 2108, 2158):
            return
        message = MESSAGES.get(errorCode, f'IBKR reported code {errorCode}. Check the gateway log.')
        with self.guard:
            self.events.append(dict(time=now_ms(), code=errorCode, message=message))
            self.events = self.events[-20:]
            if reqId in self.quotes and errorCode not in (2104,):
                self.quotes[reqId].error = message
            if reqId in self.requests:
                self.discovery[self.requests[reqId]['category']] = message
        if errorCode in (1100, 1101, 1102, 326, 502, 504):
            self.ready.clear()
            self.failed.set()

    def resolve(self, value, category, region):
        req_id = self.next_id()
        self.requests[req_id] = dict(category=category, region=region, results=[])
        self.discovery[category] = 'Resolving an exact IBKR contract…'
        self.reqContractDetails(req_id, value)

    def contractDetails(self, reqId, details):
        with self.guard:
            if reqId in self.requests:
                self.requests[reqId]['results'].append(details.contract)

    def contractDetailsEnd(self, reqId):
        with self.guard:
            task = self.requests.pop(reqId, None)
            if not task:
                return
            results = task['results']
            if task['category'] == 'Futures':
                today = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
                results = sorted((c for c in results if c.lastTradeDateOrContractMonth[:8] > today), key=lambda c: c.lastTradeDateOrContractMonth)
                results = results[:1]
            if len(results) != 1:
                self.discovery[task['category']] = 'No unique eligible contract was returned. No guessed contract is used.'
                return
            c = results[0]
            req_id = self.next_id()
            self.quotes[req_id] = Quote(dict(id=str(c.conId), symbol=c.localSymbol or c.symbol,
                conId=c.conId, currency=c.currency, exchange=c.exchange, secType=c.secType,
                expiry=c.lastTradeDateOrContractMonth, strike=c.strike, right=c.right,
                multiplier=c.multiplier), task['category'], task['region'])
            self.discovery[task['category']] = 'Subscribed; waiting for quote and entitlement status.'
            # Live if entitled; explicitly labeled delayed fallback otherwise. Never request paid snapshots.
            self.reqMktData(req_id, c, '', False, False, [])
            if c.symbol == 'SPY' and c.secType == 'STK':
                self.reqSecDefOptParams(self.next_id(), 'SPY', '', 'STK', c.conId)

    def securityDefinitionOptionParameter(self, reqId, exchange, underlyingConId, tradingClass, multiplier, expirations, strikes):
        if exchange == 'SMART' and tradingClass == 'SPY':
            with self.guard:
                self.chains.append((multiplier, sorted(expirations), sorted(s for s in strikes if valid_price(s))))

    def maybe_option(self):
        with self.guard:
            today = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
            if today != self.option_day:
                self.option_requested = False
                self.option_day = today
                for req_id, q in list(self.quotes.items()):
                    if q.meta['category'] == 'Options' and q.meta['expiry'] < today:
                        self.cancelMktData(req_id)
                        del self.quotes[req_id]
            if self.option_requested or not self.chains:
                return
            underlying = next((q for q in self.quotes.values() if q.meta['symbol'] == 'SPY'), None)
            if not underlying:
                return
            ref = next((underlying.values.get(key, {}).get('value') for key in ('last', 'close', 'ask') if valid_price(underlying.values.get(key, {}).get('value'))), None)
            if not ref:
                self.discovery['Options'] = 'Waiting for an actual SPY price to select a near-money call.'
                return
            multiplier, expiries, strikes = self.chains[0]
            tomorrow = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime('%Y%m%d')
            expiries = [e for e in expiries if e >= tomorrow]
            if not expiries or not strikes:
                return
            self.option_requested = True
            self.resolve(contract(symbol='SPY', secType='OPT', exchange='SMART', currency='USD',
                lastTradeDateOrContractMonth=expiries[0], strike=min(strikes, key=lambda s: abs(s-ref)),
                right='C', multiplier=multiplier, tradingClass='SPY'), 'Options', 'US')

    def marketDataType(self, reqId, marketDataType):
        with self.guard:
            if reqId in self.quotes:
                self.quotes[reqId].set_mode(marketDataType)
                if marketDataType == 1:
                    self.quotes[reqId].error = None

    def tickPrice(self, reqId, tickType, price, attrib):
        fields = {1:'bid', 2:'ask', 4:'last', 9:'close', 66:'bid', 67:'ask', 68:'last', 75:'close'}
        with self.guard:
            quote = self.quotes.get(reqId)
            if quote and tickType in fields:
                if tickType in (66, 67, 68, 75) and quote.mode not in (3, 4):
                    quote.set_mode(3)
                quote.tick(fields[tickType], price)

    def tickSize(self, reqId, tickType, size):
        fields = {0: 'bidSize', 3: 'askSize', 69: 'bidSize', 70: 'askSize'}
        with self.guard:
            quote = self.quotes.get(reqId)
            if quote and tickType in fields:
                quote.tick(fields[tickType], float(size))

    def start_quotes(self):
        self.reqMarketDataType(3)
        self.resolve(contract(symbol='USD', secType='CASH', exchange='IDEALPRO', currency='CAD'), 'FX', 'Canada')
        self.resolve(contract(symbol='RY', secType='STK', exchange='SMART', primaryExchange='TSE', currency='CAD'), 'Stocks', 'Canada')
        self.resolve(contract(symbol='SPY', secType='STK', exchange='SMART', currency='USD'), 'ETFs', 'US')
        self.resolve(contract(symbol='MES', secType='FUT', exchange='CME', currency='USD'), 'Futures', 'US')
        self.discovery['Options'] = 'Waiting for the SPY chain and underlying price.'

    def snapshot(self, port, status):
        with self.guard:
            timestamp = now_ms()
            connected = self.ready.is_set() and self.isConnected() and not self.failed.is_set() and timestamp-self.last_check < 45000
            return dict(schemaVersion=1, provider='IBKR TWS API', asOf=timestamp, connected=connected,
                status=status if not connected else 'connected', port=port, readOnly=True,
                execution='disabled', assets=[q.snapshot(connected, timestamp) for q in self.quotes.values()],
                discovery=dict(self.discovery), events=list(self.events),
                note='Private local pilot. Receipt timestamps are not exchange timestamps. No order execution.')


def detect_port(explicit=None):
    for port in ([explicit] if explicit else [4002, 4001, 7497, 7496]):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                return port
        except OSError:
            continue
    return None


def write_snapshot(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
        json.dump(data, f, allow_nan=False)
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int)
    parser.add_argument('--client-id', type=int, default=73)
    parser.add_argument('--seconds', type=int, default=0, help='Bounded connection check; 0 runs until stopped.')
    args = parser.parse_args()
    lock_path = ROOT / '.runtime/ibkr.lock'
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = open(lock_path, 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        parser.exit(1, 'Another Northstar IBKR connector is running. Stop it before starting a second.\n')
    logging.getLogger('ibapi').setLevel(logging.CRITICAL)
    path = ROOT / '.runtime/ibkr.json'
    stop = threading.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: stop.set())
    deadline = time.monotonic() + args.seconds if args.seconds else float('inf')
    client = Connector()
    port = None
    backoff = 2
    try:
        while not stop.is_set() and time.monotonic() < deadline:
            port = detect_port(args.port)
            client = Connector()
            write_snapshot(path, client.snapshot(port, 'connecting' if port else 'gateway-not-found'))
            if port:
                try:
                    client.connect('127.0.0.1', port, args.client_id)
                    reader = threading.Thread(target=client.run, daemon=True)
                    reader.start()
                    if not client.ready.wait(10):
                        raise RuntimeError('API handshake timed out. Check gateway API connection approval.')
                    client.start_quotes()
                    backoff = 2
                    last_ping = 0
                    print(f'IBKR API connected on localhost:{port}. Read-only quotes; orders disabled.', flush=True)
                    while not stop.is_set() and time.monotonic() < deadline and client.isConnected() and not client.failed.is_set():
                        if now_ms()-last_ping > 15000:
                            client.reqCurrentTime()
                            last_ping = now_ms()
                        if now_ms()-client.last_check > 45000:
                            break
                        client.maybe_option()
                        write_snapshot(path, client.snapshot(port, 'connected'))
                        stop.wait(1)
                except Exception as exc:
                    print(f'Connection attempt failed ({type(exc).__name__}). Retrying; check gateway API settings.', flush=True)
                finally:
                    client.disconnect()
                    client.ready.clear()
                    write_snapshot(path, client.snapshot(port, 'disconnected'))
            else:
                print('No local IBKR API port found. Retrying.', flush=True)
            stop.wait(min(backoff, max(0, deadline-time.monotonic())))
            backoff = min(60, backoff*2)
    finally:
        client.disconnect()
        client.ready.clear()
        write_snapshot(path, client.snapshot(port, 'stopped'))


if __name__ == '__main__':
    main()
