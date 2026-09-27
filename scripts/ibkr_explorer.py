"""On-demand IBKR instrument discovery and historical OHLC bars; no orders."""
import datetime as dt
import json
from pathlib import Path
from ibapi.contract import Contract
from ibkr_model import Quote, now_ms

ROOT = Path(__file__).resolve().parents[1]


def metadata(c, name=''):
    return dict(conId=c.conId, symbol=c.symbol, name=name or c.localSymbol or c.symbol,
                secType=c.secType, exchange=c.exchange or c.primaryExchange or 'SMART',
                primaryExchange=c.primaryExchange, currency=c.currency,
                expiry=c.lastTradeDateOrContractMonth[:8], strike=c.strike if 0 < c.strike < 1e7 else None, right=c.right,
                multiplier=c.multiplier, tradingClass=c.tradingClass)


def make_contract(**values):
    c = Contract()
    for key, value in values.items():
        setattr(c, key, value)
    return c


class ExplorerMixin:
    def init_explorer(self):
        self.explore = dict(requestId='', status='idle', results=[], bars=[], chains=[])
        self.explore_ids = {}
        self.explore_quote = None
        self.explore_command = None
        self.explore_contract = None
        self.explore_last = 0

    def explorer_poll(self):
        try:
            command = json.loads((ROOT / '.runtime/explore-request.json').read_text())
        except (OSError, ValueError):
            return
        if command.get('id') == self.explore.get('requestId') or not 0 <= now_ms()-command.get('createdAt', 0) < 180000 or now_ms()-self.explore_last < 2000:
            return
        with self.guard:
            for req, kind in self.explore_ids.items():
                if kind == 'quote': self.cancelMktData(req)
                if kind == 'history': self.cancelHistoricalData(req)
            self.explore_ids = {}
            self.explore_quote = None
            self.explore_contract = None
            self.explore_command = command
            self.explore_last = now_ms()
            self.explore = dict(requestId=command['id'], action=command['action'], status='loading',
                                asOf=now_ms(), interval=command.get('interval','5m'), results=[], bars=[], chains=[])
            req = self.next_id()
            if command['action'] == 'search' and command.get('secType') != 'FUT':
                self.explore_ids[req] = 'search'
                self.reqMatchingSymbols(req, command['query'])
            else:
                self.explore_ids[req] = 'resolve'
                if command['action'] == 'search':
                    c = make_contract(symbol=command['query'].upper(), secType='FUT', exchange=command['exchange'], currency=command['currency'])
                elif command['action'] == 'option':
                    c = make_contract(symbol=command['symbol'], secType='OPT', exchange=command['exchange'], currency=command['currency'],
                        lastTradeDateOrContractMonth=command['expiry'], strike=command['strike'], right=command['right'], multiplier=command['multiplier'], tradingClass=command.get('tradingClass',''))
                else:
                    c = make_contract(conId=command['conId'], exchange=command['exchange'])
                self.reqContractDetails(req,c)

    def symbolSamples(self, reqId, descriptions):
        with self.guard:
            if self.explore_ids.get(reqId) != 'search': return
            self.explore['results'] = [metadata(d.contract, getattr(d,'description','')) for d in descriptions if d.contract.currency in ('CAD','USD') and d.contract.secType == 'STK' and d.contract.primaryExchange in ('NASDAQ','NYSE','ARCA','AMEX','BATS','IEX','ISLAND','TSE','VENTURE','NEO','PURE','CSE','NYSEAMERICAN')]
            self.explore['results'].sort(key=lambda c: c['currency']!='CAD')
            self.explore['results']=self.explore['results'][:60]
            self.explore.update(status='ready', asOf=now_ms(), message='Choose an exact listing. Search is supplied by IBKR.')

    def explorer_details(self, reqId, details):
        if self.explore_ids.get(reqId) != 'resolve': return False
        self.explore['results'].append(metadata(details.contract, details.longName))
        self.explore_contract = details.contract
        return True

    def explorer_details_end(self, reqId):
        if self.explore_ids.get(reqId) != 'resolve': return False
        cmd = self.explore_command
        if cmd['action']=='search':
            today=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
            self.explore['results']=sorted([c for c in self.explore['results'] if c['expiry']>=today],key=lambda c:c['expiry'])[:60]
            self.explore.update(status='ready', asOf=now_ms())
            return True
        if len(self.explore['results'])!=1:
            self.explore.update(status='error',message='IBKR could not resolve one exact contract.',asOf=now_ms());return True
        c=self.explore_contract
        self.explore['instrument']=self.explore['results'][0]
        if cmd['action']=='chain':
            if c.secType!='STK':
                self.explore.update(status='error',message='Select a stock or ETF underlying for its equity options chain.');return True
            req=self.next_id();self.explore_ids[req]='chain'
            self.reqSecDefOptParams(req,c.symbol,'','STK',c.conId)
        else:
            category='Options' if c.secType=='OPT' else 'Futures' if c.secType=='FUT' else 'Stocks'
            self.explore_quote=Quote(dict(metadata(c),id=str(c.conId)),category,'Canada' if c.currency=='CAD' else 'US')
            req=self.next_id();self.explore_ids[req]='quote';self.reqMktData(req,c,'',False,False,[])
            req=self.next_id();self.explore_ids[req]='history'
            interval=self.explore['interval'];bar,duration={'1m':('1 min','1 D'),'5m':('5 mins','2 D'),'1h':('1 hour','2 W'),'1d':('1 day','1 Y')}[interval]
            self.reqHistoricalData(req,c,'',duration,bar,'TRADES',1,2,False,[])
        return True

    def explorer_chain(self, reqId, exchange, underlyingConId, tradingClass, multiplier, expirations, strikes):
        if self.explore_ids.get(reqId)!='chain': return False
        if exchange in ('SMART','CDE'):
            today=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d')
            self.explore['chains'].append(dict(exchange=exchange,tradingClass=tradingClass,multiplier=multiplier,
                expiries=sorted(e for e in expirations if e>=today),strikes=sorted(s for s in strikes if s>0)))
        return True

    def securityDefinitionOptionParameterEnd(self, reqId):
        with self.guard:
            if self.explore_ids.get(reqId)=='chain':
                self.explore['chains'].sort(key=lambda c: (c['tradingClass'] != self.explore_contract.symbol, -len(c['expiries'])))
                self.explore.update(status='ready',asOf=now_ms(),message='Expiry and strike combinations are verified when selected.')

    def historicalData(self, reqId, bar):
        with self.guard:
            if self.explore_ids.get(reqId)!='history': return
            try:
                date=str(bar.date)
                timestamp=int(dt.datetime.strptime(date,'%Y%m%d').replace(tzinfo=dt.timezone.utc).timestamp()*1000) if len(date)==8 else int(date)*1000
                value=dict(time=timestamp,open=float(bar.open),high=float(bar.high),low=float(bar.low),close=float(bar.close),volume=float(bar.volume))
                self.explore['bars'].append(value)
                self.explore['bars']=sorted({p['time']:p for p in self.explore['bars']}.values(),key=lambda p:p['time'])[-300:]
            except (ValueError,TypeError): pass

    def historicalDataEnd(self, reqId, start, end):
        with self.guard:
            if self.explore_ids.get(reqId)=='history':
                self.explore.update(status='ready',asOf=now_ms(),message='Historical trades from IBKR; latest candle may be incomplete. Refresh to update.')

    def explorer_error(self, reqId, code):
        kind=self.explore_ids.get(reqId)
        if not kind: return False
        if code in (2104,2106,2107,2108,2158): return True
        if kind=='quote':
            if self.explore_quote:self.explore_quote.error='IBKR quote unavailable or subscription restricted.'
        else:
            self.explore.update(status='error',asOf=now_ms(),message=f'IBKR data request returned code {code}. Data may require an exchange entitlement or a different contract.')
        return True

    def explorer_snapshot(self):
        result=dict(self.explore)
        if result['status']=='loading' and now_ms()-self.explore_last>45000:
            result.update(status='error',message='IBKR request timed out. Retry when Gateway is available.')
        if self.explore_quote: result['quote']=self.explore_quote.snapshot(self.ready.is_set(),now_ms())
        return result
