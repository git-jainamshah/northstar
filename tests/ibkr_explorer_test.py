"""Exercise callback routing without requiring Gateway or installing the SDK in CI."""
import sys
import types
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
if 'ibapi.contract' not in sys.modules:
    module=types.ModuleType('ibapi.contract')
    class Contract:
        def __init__(self):
            for k in ['symbol','localSymbol','secType','exchange','primaryExchange','currency','lastTradeDateOrContractMonth','right','multiplier','tradingClass']: setattr(self,k,'')
            self.conId=0;self.strike=0
    module.Contract=Contract
    sys.modules.setdefault('ibapi',types.ModuleType('ibapi'))
    sys.modules['ibapi.contract']=module
from ibkr_explorer import ExplorerMixin, make_contract
class Harness(ExplorerMixin):
    def __init__(self):
        self.guard=threading.RLock();self.ready=threading.Event();self.ready.set();self.counter=100;self.calls=[];self.init_explorer()
    def next_id(self): self.counter+=1;return self.counter
    def reqMktData(self,*args): self.calls.append(('quote',args))
    def reqHistoricalData(self,*args): self.calls.append(('history',args))
    def reqSecDefOptParams(self,*args): self.calls.append(('chain',args))
class ExplorerTest(unittest.TestCase):
    def test_exact_future_resolves_to_real_history_request(self):
        h=Harness();h.explore_command={'action':'chart'};h.explore_ids[1]='resolve';h.explore['interval']='5m'
        c=make_contract(conId=42,symbol='MES',secType='FUT',exchange='CME',currency='USD',lastTradeDateOrContractMonth='20261218')
        h.explorer_details(1,types.SimpleNamespace(contract=c,longName='Micro S&P'))
        self.assertTrue(h.explorer_details_end(1));self.assertEqual([c[0] for c in h.calls],['quote','history'])
        args=h.calls[1][1];self.assertEqual(args[4:9],('5 mins','TRADES',1,2,False));self.assertEqual(h.explore['instrument']['conId'],42)
        bar=types.SimpleNamespace(date='1790000000',open=10,high=12,low=9,close=11,volume=5)
        h.historicalData(args[0],bar);h.historicalData(args[0],bar);self.assertEqual(len(h.explore['bars']),1)
        h.historicalData(999,bar);self.assertEqual(len(h.explore['bars']),1)
        h.historicalDataEnd(args[0],'','');self.assertEqual(h.explore['status'],'ready')
    def test_ambiguous_contract_never_subscribes_and_errors_are_sanitized(self):
        h=Harness();h.explore_ids[1]='resolve';h.explore_command={'action':'chart'}
        h.explorer_details_end(1);self.assertEqual(h.explore['status'],'error');self.assertEqual(h.calls,[])
        h.explorer_error(1,200);self.assertIn('code 200',h.explore['message'])
    def test_chain_filters_past_expiry_and_dedicated_venues(self):
        h=Harness();h.explore_ids[2]='chain'
        h.explorer_chain(2,'SMART',1,'SPY','100',{'20000101','20991231'},{0,100,101})
        h.explorer_chain(2,'UNKNOWN',1,'SPY','100',{'20991231'},{100})
        self.assertEqual(len(h.explore['chains']),1);self.assertEqual(h.explore['chains'][0]['expiries'],['20991231']);self.assertEqual(h.explore['chains'][0]['strikes'],[100,101])
